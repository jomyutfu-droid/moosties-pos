create table if not exists public.staff_rewards (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid null references public.branches(id),
  user_id uuid not null references public.users(id),
  reward_date date not null,
  reward_type text not null check (reward_type in ('grab_review', 'sales_volume', 'closing_ot')),
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(12,2) not null default 50 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  details_json jsonb not null default '{}'::jsonb,
  requested_by uuid null references public.users(id),
  reviewed_by uuid null references public.users(id),
  reviewed_at timestamptz null,
  paid_by uuid null references public.users(id),
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_rewards_one_type_per_day on public.staff_rewards (user_id, reward_date, reward_type);
create index if not exists staff_rewards_branch_date_idx on public.staff_rewards (branch_id, reward_date desc);
alter table public.staff_rewards enable row level security;

create or replace function public.record_grab_reward(p_token text, p_user_id uuid, p_reward_date date, p_quantity integer)
returns public.staff_rewards language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_owner_id uuid; v_owner_role text; v_owner_branch uuid; v_target_branch uuid; v_target_role text; v_reward public.staff_rewards;
begin
  v_owner_id := public.pin_session_user(p_token);
  if v_owner_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_owner_role, v_owner_branch from public.users u where u.id = v_owner_id and u.is_active = true;
  if not found or v_owner_role <> 'owner' then raise exception 'owner access required'; end if;
  if p_user_id is null or p_reward_date is null or p_quantity is null or p_quantity < 1 or p_quantity > 10000 then raise exception 'invalid reward input'; end if;
  select u.branch_id, u.role::text into v_target_branch, v_target_role from public.users u where u.id = p_user_id and u.is_active = true;
  if not found or v_target_role = 'owner' or v_target_branch is distinct from v_owner_branch then raise exception 'employee not found or not authorized'; end if;
  insert into public.staff_rewards (branch_id, user_id, reward_date, reward_type, quantity, amount, status, details_json, requested_by, reviewed_by, reviewed_at, paid_by, paid_at, updated_at)
  values (v_target_branch, p_user_id, p_reward_date, 'grab_review', p_quantity, round(p_quantity * 50, 2), 'approved', jsonb_build_object('comment_count', p_quantity), v_owner_id, v_owner_id, now(), null, null, now())
  on conflict (user_id, reward_date, reward_type) do update set quantity = excluded.quantity, amount = excluded.amount, status = 'approved', details_json = excluded.details_json, requested_by = excluded.requested_by, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, paid_by = null, paid_at = null, updated_at = now()
  returning * into v_reward;
  insert into public.audit_log (user_id, action, entity, entity_id, detail_json)
  values (v_owner_id, 'record_staff_reward', 'staff_rewards', v_reward.id, jsonb_build_object('reward_type', 'grab_review', 'employee_id', p_user_id, 'reward_date', p_reward_date, 'comment_count', p_quantity));
  return v_reward;
end;
$$;

create or replace function public.submit_sales_volume_reward(p_token text, p_session_id uuid, p_cups_sold integer)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user_id uuid; v_role text; v_branch_id uuid; v_session_user uuid; v_session_branch uuid; v_reward_date date; v_reward_id uuid;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_role, v_branch_id from public.users u where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;
  if v_role = 'owner' then return; end if;
  if p_cups_sold is null or p_cups_sold < 0 or p_cups_sold > 100000 then raise exception 'invalid cup count'; end if;
  if p_cups_sold <= 25 then return; end if;
  select cs.user_id, cs.branch_id into v_session_user, v_session_branch from public.cash_sessions cs where cs.id = p_session_id;
  if not found or v_session_user <> v_user_id or v_session_branch is distinct from v_branch_id then raise exception 'cash session not found or not authorized'; end if;
  v_reward_date := timezone('Asia/Bangkok', now())::date;
  insert into public.staff_rewards (branch_id, user_id, reward_date, reward_type, quantity, amount, status, details_json, requested_by, updated_at)
  values (v_branch_id, v_user_id, v_reward_date, 'sales_volume', p_cups_sold, 50, 'pending', jsonb_build_object('cups_sold', p_cups_sold), v_user_id, now())
  on conflict (user_id, reward_date, reward_type) do update set quantity = excluded.quantity, amount = 50, status = 'pending', details_json = excluded.details_json, requested_by = excluded.requested_by, reviewed_by = null, reviewed_at = null, paid_by = null, paid_at = null, updated_at = now()
  returning id into v_reward_id;
  insert into public.audit_log (user_id, action, entity, entity_id, detail_json)
  values (v_user_id, 'submit_staff_reward', 'staff_rewards', v_reward_id, jsonb_build_object('reward_type', 'sales_volume', 'reward_date', v_reward_date, 'cups_sold', p_cups_sold));
end;
$$;

create or replace function public.close_cash_session_with_cups(p_token text, p_session_id uuid, p_counted_cash numeric, p_note text default null, p_cups_sold integer default 0)
returns table (cash_session_id uuid, counted_cash numeric, expected_cash numeric, variance numeric, cash_sales numeric, cash_in numeric, cash_out numeric)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_closed record;
begin
  select * into v_closed from public.close_cash_session(p_token, p_session_id, p_counted_cash, p_note);
  perform public.submit_sales_volume_reward(p_token, p_session_id, p_cups_sold);
  return query select v_closed.cash_session_id, v_closed.counted_cash, v_closed.expected_cash, v_closed.variance, v_closed.cash_sales, v_closed.cash_in, v_closed.cash_out;
end;
$$;

create or replace function public.submit_closing_ot_reward(p_token text, p_reward_date date, p_order_at timestamptz, p_left_at timestamptz, p_note text default null)
returns public.staff_rewards language plpgsql security definer set search_path = public, extensions
as $$
declare v_user_id uuid; v_role text; v_branch_id uuid; v_reward public.staff_rewards;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_role, v_branch_id from public.users u where u.id = v_user_id and u.is_active = true;
  if not found or v_role = 'owner' then raise exception 'employee access required'; end if;
  if p_reward_date is null or p_order_at is null or p_left_at is null or p_left_at <= p_order_at then raise exception 'เวลา OT ไม่ถูกต้อง'; end if;
  if timezone('Asia/Bangkok', p_order_at)::date <> p_reward_date or timezone('Asia/Bangkok', p_left_at)::date <> p_reward_date then raise exception 'วันของเวลาออเดอร์และเวลาออกต้องเป็นวันเดียวกัน'; end if;
  if exists (select 1 from public.staff_rewards r where r.user_id = v_user_id and r.reward_date = p_reward_date and r.reward_type = 'closing_ot' and r.status in ('pending', 'approved', 'paid')) then raise exception 'มีคำขอ OT ปิดร้านของวันนี้แล้ว'; end if;
  insert into public.staff_rewards (branch_id, user_id, reward_date, reward_type, quantity, amount, status, details_json, requested_by, updated_at)
  values (v_branch_id, v_user_id, p_reward_date, 'closing_ot', 1, 50, 'pending', jsonb_build_object('order_at', p_order_at, 'left_at', p_left_at, 'note', nullif(left(trim(coalesce(p_note, '')), 500), '')), v_user_id, now())
  returning * into v_reward;
  insert into public.audit_log (user_id, action, entity, entity_id, detail_json)
  values (v_user_id, 'submit_staff_reward', 'staff_rewards', v_reward.id, jsonb_build_object('reward_type', 'closing_ot', 'reward_date', p_reward_date, 'order_at', p_order_at, 'left_at', p_left_at));
  return v_reward;
end;
$$;

create or replace function public.get_staff_rewards(p_token text, p_from date default null, p_to date default null, p_status text default null)
returns table (id uuid, branch_id uuid, user_id uuid, user_name text, reward_date date, reward_type text, quantity integer, amount numeric, status text, details_json jsonb, requested_by uuid, reviewed_by uuid, reviewed_at timestamptz, paid_by uuid, paid_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_user_id uuid; v_role text; v_branch_id uuid;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_role, v_branch_id from public.users u where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected', 'paid') then raise exception 'invalid reward status'; end if;
  return query
  select r.id, r.branch_id, r.user_id, u.name, r.reward_date, r.reward_type, r.quantity, r.amount, r.status, r.details_json, r.requested_by, r.reviewed_by, r.reviewed_at, r.paid_by, r.paid_at, r.created_at
  from public.staff_rewards r join public.users u on u.id = r.user_id
  where ((v_role in ('owner', 'manager') and r.branch_id is not distinct from v_branch_id) or (v_role not in ('owner', 'manager') and r.user_id = v_user_id))
    and (p_from is null or r.reward_date >= p_from) and (p_to is null or r.reward_date <= p_to) and (p_status is null or r.status = p_status)
  order by r.reward_date desc, r.created_at desc;
end;
$$;

create or replace function public.review_staff_reward(p_token text, p_id uuid, p_status text)
returns public.staff_rewards language plpgsql security definer set search_path = public, extensions
as $$
declare v_owner_id uuid; v_owner_role text; v_owner_branch uuid; v_reward public.staff_rewards;
begin
  v_owner_id := public.pin_session_user(p_token);
  if v_owner_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_owner_role, v_owner_branch from public.users u where u.id = v_owner_id and u.is_active = true;
  if not found or v_owner_role <> 'owner' then raise exception 'owner access required'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid review status'; end if;
  select r.* into v_reward from public.staff_rewards r where r.id = p_id and r.branch_id is not distinct from v_owner_branch for update;
  if not found then raise exception 'reward not found'; end if;
  if v_reward.status <> 'pending' then raise exception 'reward already reviewed'; end if;
  update public.staff_rewards set status = p_status, reviewed_by = v_owner_id, reviewed_at = now(), updated_at = now() where id = p_id returning * into v_reward;
  insert into public.audit_log (user_id, action, entity, entity_id, detail_json) values (v_owner_id, 'review_staff_reward', 'staff_rewards', p_id, jsonb_build_object('status', p_status));
  return v_reward;
end;
$$;

create or replace function public.mark_staff_rewards_paid(p_token text, p_from date, p_to date, p_user_id uuid default null)
returns table (updated_count integer, total_amount numeric)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_owner_id uuid; v_owner_role text; v_owner_branch uuid; v_count integer; v_total numeric;
begin
  v_owner_id := public.pin_session_user(p_token);
  if v_owner_id is null then raise exception 'session expired'; end if;
  select u.role::text, u.branch_id into v_owner_role, v_owner_branch from public.users u where u.id = v_owner_id and u.is_active = true;
  if not found or v_owner_role <> 'owner' then raise exception 'owner access required'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid payout period'; end if;
  with updated as (
    update public.staff_rewards r set status = 'paid', paid_by = v_owner_id, paid_at = now(), updated_at = now()
    where r.branch_id is not distinct from v_owner_branch and r.reward_date between p_from and p_to and r.status = 'approved' and (p_user_id is null or r.user_id = p_user_id)
    returning r.amount
  )
  select count(*)::integer, coalesce(sum(amount), 0) into v_count, v_total from updated;
  insert into public.audit_log (user_id, action, entity, detail_json) values (v_owner_id, 'mark_staff_rewards_paid', 'staff_rewards', jsonb_build_object('from', p_from, 'to', p_to, 'employee_id', p_user_id, 'updated_count', v_count, 'total_amount', v_total));
  return query select v_count, v_total;
end;
$$;

revoke all on table public.staff_rewards from public;
grant select on table public.staff_rewards to anon, authenticated;
revoke all on function public.record_grab_reward(text, uuid, date, integer) from public;
revoke all on function public.submit_sales_volume_reward(text, uuid, integer) from public;
revoke all on function public.close_cash_session_with_cups(text, uuid, numeric, text, integer) from public;
revoke all on function public.submit_closing_ot_reward(text, date, timestamptz, timestamptz, text) from public;
revoke all on function public.get_staff_rewards(text, date, date, text) from public;
revoke all on function public.review_staff_reward(text, uuid, text) from public;
revoke all on function public.mark_staff_rewards_paid(text, date, date, uuid) from public;
grant execute on function public.record_grab_reward(text, uuid, date, integer) to anon, authenticated;
grant execute on function public.submit_sales_volume_reward(text, uuid, integer) to anon, authenticated;
grant execute on function public.close_cash_session_with_cups(text, uuid, numeric, text, integer) to anon, authenticated;
grant execute on function public.submit_closing_ot_reward(text, date, timestamptz, timestamptz, text) to anon, authenticated;
grant execute on function public.get_staff_rewards(text, date, date, text) to anon, authenticated;
grant execute on function public.review_staff_reward(text, uuid, text) to anon, authenticated;
grant execute on function public.mark_staff_rewards_paid(text, date, date, uuid) to anon, authenticated;