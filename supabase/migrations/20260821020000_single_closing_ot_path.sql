-- ร้านปิด 19:00 และให้ OT ใช้เส้นทางเดียวจากแบบฟอร์ม OT ปิดร้านของพนักงาน
-- เวลาออกงานหลัง 19:00 ใช้เก็บประวัติเท่านั้น ไม่สร้าง overtime_requests อัตโนมัติ
begin;

update public.settings
set value = jsonb_set(
  case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end,
  '{weekly}',
  coalesce(
    (
      select jsonb_agg(
        jsonb_set(item, '{close_time}', to_jsonb('19:00'::text), true)
        order by coalesce((item->>'day')::integer, 0)
      )
      from jsonb_array_elements(
        case when jsonb_typeof(value->'weekly') = 'array' then value->'weekly' else '[]'::jsonb end
      ) as rows(item)
    ),
    '[]'::jsonb
  ),
  true
),
updated_at = now()
where key = 'business_hours';

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
      'close_time', '19:00',
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
        then (v_special->>'close_time')::time else '19:00'::time end,
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
      then (v_weekly->>'close_time')::time else '19:00'::time end,
    case when jsonb_typeof(v_weekly->'allow_ot') = 'boolean'
      then (v_weekly->>'allow_ot')::boolean else true end;
end;
$$;

create or replace function public.submit_closing_ot_reward(
  p_token text,
  p_reward_date date,
  p_order_at timestamptz,
  p_left_at timestamptz,
  p_note text default null
)
returns public.staff_rewards
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_role text;
  v_branch_id uuid;
  v_reward public.staff_rewards;
  v_schedule record;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_role, v_branch_id
  from public.users u
  where u.id = v_user_id and u.is_active = true;
  if not found or v_role = 'owner' then raise exception 'employee access required'; end if;
  if p_reward_date is null or p_order_at is null or p_left_at is null or p_left_at <= p_order_at then
    raise exception 'เวลา OT ไม่ถูกต้อง';
  end if;
  if timezone('Asia/Bangkok', p_order_at)::date <> p_reward_date
     or timezone('Asia/Bangkok', p_left_at)::date <> p_reward_date then
    raise exception 'วันของเวลาออเดอร์และเวลาออกต้องเป็นวันเดียวกัน';
  end if;

  select * into v_schedule from public.shop_business_hours_for_date(p_reward_date);
  if v_schedule.is_open
     and timezone('Asia/Bangkok', p_left_at)::time <= v_schedule.close_time then
    raise exception 'เวลาออกจากร้านต้องหลังเวลาปิดร้าน %', to_char(v_schedule.close_time, 'HH24:MI');
  end if;

  if exists (
    select 1 from public.staff_rewards r
    where r.user_id = v_user_id
      and r.reward_date = p_reward_date
      and r.reward_type = 'closing_ot'
      and r.status in ('pending', 'approved', 'paid')
  ) then
    raise exception 'มีคำขอ OT ปิดร้านของวันนี้แล้ว';
  end if;

  insert into public.staff_rewards (
    branch_id, user_id, reward_date, reward_type, quantity, amount, status,
    details_json, requested_by, updated_at
  ) values (
    v_branch_id, v_user_id, p_reward_date, 'closing_ot', 1, 50, 'pending',
    jsonb_build_object(
      'order_at', p_order_at,
      'left_at', p_left_at,
      'note', nullif(left(trim(coalesce(p_note, '')), 500), '')
    ),
    v_user_id, now()
  )
  returning * into v_reward;

  insert into public.audit_log (user_id, action, entity, entity_id, detail_json)
  values (
    v_user_id,
    'submit_staff_reward',
    'staff_rewards',
    v_reward.id,
    jsonb_build_object(
      'reward_type', 'closing_ot',
      'reward_date', p_reward_date,
      'order_at', p_order_at,
      'left_at', p_left_at
    )
  );
  return v_reward;
end;
$$;

-- ป้องกัน client รุ่นเก่าหรือคำขอโดยตรงไม่ให้สร้าง OT แบบคิดรายนาทีซ้ำกับ OT ปิดร้าน
revoke execute on function public.submit_overtime_request(text, uuid, timestamptz, timestamptz, text) from anon, authenticated;

commit;
