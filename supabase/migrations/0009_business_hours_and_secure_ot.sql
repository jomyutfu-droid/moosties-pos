-- Store business hours in settings.business_hours and validate OT against the
-- same policy on the server. The frontend remains responsible for displaying
-- the policy, while this function prevents arbitrary OT ranges from being sent
-- directly to submit_overtime_request.
begin;

create or replace function public.shop_business_hours_for_date(p_date date)
returns table (
  is_open boolean,
  open_time time,
  close_time time,
  allow_ot boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config jsonb;
  v_weekly jsonb;
  v_special jsonb;
  v_default_weekly jsonb;
begin
  select s.value into v_config
  from public.settings s
  where s.key = 'business_hours';

  v_default_weekly := (
    select jsonb_agg(jsonb_build_object(
      'day', day_number,
      'is_open', day_number <> 3,
      'open_time', '10:00',
      'close_time', '20:30',
      'allow_ot', true
    ) order by day_number)
    from generate_series(0, 6) as days(day_number)
  );

  if v_config is null or jsonb_typeof(v_config) <> 'object' then
    v_config := jsonb_build_object('weekly', v_default_weekly, 'special_dates', '[]'::jsonb);
  end if;

  select item into v_special
  from jsonb_array_elements(coalesce(v_config->'special_dates', '[]'::jsonb)) as items(item)
  where item->>'date' = p_date::text
  limit 1;

  if v_special is not null then
    return query select
      coalesce(v_special->>'mode', 'closed') = 'open',
      case when (v_special->>'open_time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (v_special->>'open_time')::time else '10:00'::time end,
      case when (v_special->>'close_time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (v_special->>'close_time')::time else '20:30'::time end,
      case when jsonb_typeof(v_special->'allow_ot') = 'boolean'
        then (v_special->>'allow_ot')::boolean else true end;
    return;
  end if;

  select item into v_weekly
  from jsonb_array_elements(coalesce(v_config->'weekly', v_default_weekly)) as items(item)
  where (item->>'day') ~ '^[0-6]$'
    and (item->>'day')::integer = extract(dow from p_date)::integer
  limit 1;

  if v_weekly is null then
    select item into v_weekly
    from jsonb_array_elements(v_default_weekly) as defaults(item)
    where (item->>'day')::integer = extract(dow from p_date)::integer
    limit 1;
  end if;

  return query select
    case when jsonb_typeof(v_weekly->'is_open') = 'boolean'
      then (v_weekly->>'is_open')::boolean else extract(dow from p_date)::integer <> 3 end,
    case when (v_weekly->>'open_time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_weekly->>'open_time')::time else '10:00'::time end,
    case when (v_weekly->>'close_time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_weekly->>'close_time')::time else '20:30'::time end,
    case when jsonb_typeof(v_weekly->'allow_ot') = 'boolean'
      then (v_weekly->>'allow_ot')::boolean else true end;
end;
$$;

revoke all on function public.shop_business_hours_for_date(date) from public;

create or replace function public.submit_overtime_request(
  p_token text,
  p_time_log_id uuid,
  p_ot_start timestamptz,
  p_ot_end timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session_user uuid;
  v_user_id uuid;
  v_wage numeric(12,2);
  v_clock_in timestamptz;
  v_minutes integer;
  v_id uuid;
  v_schedule record;
  v_work_date date;
  v_next_midnight timestamptz;
begin
  v_session_user := public.pin_session_user(p_token);
  if v_session_user is null then raise exception 'session expired'; end if;
  if p_ot_end <= p_ot_start then raise exception 'invalid overtime range'; end if;

  select t.user_id, t.clock_in, coalesce(u.hourly_wage, 0)
    into v_user_id, v_clock_in, v_wage
  from public.time_logs t
  join public.users u on u.id = t.user_id and u.is_active
  where t.id = p_time_log_id;

  if v_user_id is null then raise exception 'time log not found'; end if;
  if v_user_id <> v_session_user then raise exception 'not authorized'; end if;

  v_work_date := (v_clock_in at time zone 'Asia/Bangkok')::date;
  if (p_ot_start at time zone 'Asia/Bangkok')::date <> v_work_date then
    raise exception 'overtime date must match time log';
  end if;
  v_next_midnight := ((v_work_date + 1)::timestamp at time zone 'Asia/Bangkok');
  if p_ot_end > v_next_midnight then
    raise exception 'overtime cannot cross midnight';
  end if;

  select * into v_schedule
  from public.shop_business_hours_for_date(v_work_date);

  if not v_schedule.allow_ot then
    raise exception 'overtime is not allowed on this date';
  end if;
  if v_schedule.is_open
    and (p_ot_start at time zone 'Asia/Bangkok')::time < v_schedule.close_time then
    raise exception 'overtime must start after shop closing time';
  end if;
  if p_ot_start < v_clock_in then
    raise exception 'overtime cannot start before clock-in';
  end if;

  v_minutes := floor(extract(epoch from (p_ot_end - p_ot_start)) / 60);
  if v_minutes <= 0 then raise exception 'overtime must be at least one minute'; end if;

  insert into public.overtime_requests(
    time_log_id, user_id, ot_start, ot_end, minutes, hourly_wage, amount, status, note
  )
  values(
    p_time_log_id, v_user_id, p_ot_start, p_ot_end, v_minutes, v_wage,
    round((v_minutes::numeric / 60) * v_wage, 2), 'pending', p_note
  )
  on conflict (time_log_id) do update set
    ot_start = excluded.ot_start,
    ot_end = excluded.ot_end,
    minutes = excluded.minutes,
    hourly_wage = excluded.hourly_wage,
    amount = excluded.amount,
    note = excluded.note,
    requested_at = now()
  where overtime_requests.status = 'pending'
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_overtime_request(text, uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.submit_overtime_request(text, uuid, timestamptz, timestamptz, text) to anon, authenticated;

commit;
