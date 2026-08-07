-- Canonicalise OT start against the database clock_in before validating and
-- calculating the request. This prevents a stale/truncated browser timestamp
-- from being rejected when it is only a fraction of a second before clock_in.
begin;

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
  v_ot_start timestamptz;
  v_minutes integer;
  v_id uuid;
  v_schedule record;
  v_work_date date;
  v_next_midnight timestamptz;
begin
  v_session_user := public.pin_session_user(p_token);
  if v_session_user is null then raise exception 'session expired'; end if;
  if p_ot_start is null or p_ot_end is null or p_ot_end <= p_ot_start then
    raise exception 'invalid overtime range';
  end if;

  select t.user_id, t.clock_in, coalesce(u.hourly_wage, 0)
    into v_user_id, v_clock_in, v_wage
  from public.time_logs t
  join public.users u on u.id = t.user_id and u.is_active
  where t.id = p_time_log_id;

  if v_user_id is null then raise exception 'time log not found'; end if;
  if v_user_id <> v_session_user then raise exception 'not authorized'; end if;

  -- The database value is authoritative. If the client sent a value just
  -- before clock_in because of timestamp truncation, start OT at clock_in.
  v_ot_start := greatest(p_ot_start, v_clock_in);
  if p_ot_end <= v_ot_start then
    raise exception 'invalid overtime range';
  end if;

  v_work_date := (v_clock_in at time zone 'Asia/Bangkok')::date;
  if (v_ot_start at time zone 'Asia/Bangkok')::date <> v_work_date then
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
    and (v_ot_start at time zone 'Asia/Bangkok')::time < v_schedule.close_time then
    raise exception 'overtime must start after shop closing time';
  end if;
  if v_ot_start < v_clock_in then
    raise exception 'overtime cannot start before clock-in';
  end if;

  v_minutes := floor(extract(epoch from (p_ot_end - v_ot_start)) / 60);
  if v_minutes <= 0 then raise exception 'overtime must be at least one minute'; end if;

  insert into public.overtime_requests(
    time_log_id, user_id, ot_start, ot_end, minutes, hourly_wage, amount, status, note
  )
  values(
    p_time_log_id, v_user_id, v_ot_start, p_ot_end, v_minutes, v_wage,
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
