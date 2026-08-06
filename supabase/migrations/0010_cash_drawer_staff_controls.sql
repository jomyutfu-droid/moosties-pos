-- Cash drawer sessions are scoped to the cashier who opened them.
-- Staff can record cash in/out and close their own session. Owner/manager
-- can review sessions for their branch. All sensitive operations require the
-- existing server-side PIN session token.
begin;

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id),
  type text not null check (type in ('cash_in', 'cash_out')),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_session_created_idx
  on public.cash_movements(session_id, created_at desc);

create unique index if not exists cash_sessions_one_open_per_user_idx
  on public.cash_sessions(user_id)
  where closed_at is null and user_id is not null;

alter table public.cash_movements enable row level security;

create or replace function public.open_cash_session(
  p_token text,
  p_opening_cash numeric
)
returns table (
  id uuid,
  branch_id uuid,
  user_id uuid,
  opened_at timestamptz,
  opening_cash numeric,
  closed_at timestamptz,
  counted_cash numeric,
  expected_cash numeric,
  variance numeric,
  note text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_branch_id uuid;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;

  select u.branch_id into v_branch_id
  from public.users u
  where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;

  if p_opening_cash is null or p_opening_cash < 0 or p_opening_cash > 1000000 then
    raise exception 'invalid opening cash';
  end if;

  if exists (
    select 1 from public.cash_sessions cs
    where cs.user_id = v_user_id and cs.closed_at is null
  ) then
    raise exception 'cash session already open';
  end if;

  return query
  insert into public.cash_sessions(branch_id, user_id, opening_cash)
  values (v_branch_id, v_user_id, round(p_opening_cash, 2))
  returning cash_sessions.id, cash_sessions.branch_id, cash_sessions.user_id,
    cash_sessions.opened_at, cash_sessions.opening_cash, cash_sessions.closed_at,
    cash_sessions.counted_cash, cash_sessions.expected_cash, cash_sessions.variance,
    cash_sessions.note;
end;
$$;

create or replace function public.get_cash_session_summary(
  p_token text,
  p_limit integer default 20
)
returns table (
  id uuid,
  branch_id uuid,
  user_id uuid,
  user_name text,
  opened_at timestamptz,
  opening_cash numeric,
  closed_at timestamptz,
  counted_cash numeric,
  expected_cash numeric,
  variance numeric,
  note text,
  cash_sales numeric,
  cash_in numeric,
  cash_out numeric
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_role text;
  v_branch_id uuid;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;

  select u.role::text, u.branch_id into v_role, v_branch_id
  from public.users u
  where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;

  return query
  select
    cs.id,
    cs.branch_id,
    cs.user_id,
    u.name,
    cs.opened_at,
    cs.opening_cash,
    cs.closed_at,
    cs.counted_cash,
    case
      when cs.closed_at is null then round(cs.opening_cash + s.cash_sales + m.cash_in - m.cash_out, 2)
      else coalesce(cs.expected_cash, round(cs.opening_cash + s.cash_sales + m.cash_in - m.cash_out, 2))
    end,
    cs.variance,
    cs.note,
    s.cash_sales,
    m.cash_in,
    m.cash_out
  from public.cash_sessions cs
  join public.users u on u.id = cs.user_id
  left join lateral (
    select round(coalesce(sum(p.amount), 0), 2) as cash_sales
    from public.payments p
    join public.orders o on o.id = p.order_id
    where p.method = 'cash'
      and o.status = 'paid'
      and o.user_id = cs.user_id
      and o.created_at >= cs.opened_at
      and o.created_at <= coalesce(cs.closed_at, now())
  ) s on true
  left join lateral (
    select
      round(coalesce(sum(cm.amount) filter (where cm.type = 'cash_in'), 0), 2) as cash_in,
      round(coalesce(sum(cm.amount) filter (where cm.type = 'cash_out'), 0), 2) as cash_out
    from public.cash_movements cm
    where cm.session_id = cs.id
  ) m on true
  where cs.user_id = v_user_id
     or (v_role in ('owner', 'manager') and cs.branch_id is not distinct from v_branch_id)
  order by cs.opened_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function public.get_cash_movements(
  p_token text,
  p_session_id uuid
)
returns table (
  id uuid,
  session_id uuid,
  user_id uuid,
  type text,
  amount numeric,
  note text,
  created_at timestamptz,
  user_name text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_role text;
  v_branch_id uuid;
  v_session_branch uuid;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;

  select u.role::text, u.branch_id into v_role, v_branch_id
  from public.users u
  where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;

  select cs.branch_id into v_session_branch
  from public.cash_sessions cs
  where cs.id = p_session_id;
  if not found then raise exception 'cash session not found'; end if;

  if v_role not in ('owner', 'manager')
     and not exists (
       select 1 from public.cash_sessions cs
       where cs.id = p_session_id and cs.user_id = v_user_id
     ) then
    raise exception 'not authorized';
  end if;
  if v_role in ('owner', 'manager')
     and v_session_branch is distinct from v_branch_id then
    raise exception 'not authorized';
  end if;

  return query
  select cm.id, cm.session_id, cm.user_id, cm.type, cm.amount, cm.note,
    cm.created_at, u.name
  from public.cash_movements cm
  join public.users u on u.id = cm.user_id
  where cm.session_id = p_session_id
  order by cm.created_at desc;
end;
$$;

create or replace function public.add_cash_movement(
  p_token text,
  p_session_id uuid,
  p_type text,
  p_amount numeric,
  p_note text default null
)
returns table (
  id uuid,
  session_id uuid,
  user_id uuid,
  type text,
  amount numeric,
  note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_session public.cash_sessions%rowtype;
  v_available numeric;
  v_note text;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;
  if p_type not in ('cash_in', 'cash_out') then raise exception 'invalid cash movement type'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid cash movement amount'; end if;

  select cs.* into v_session
  from public.cash_sessions cs
  where cs.id = p_session_id
  for update;
  if not found or v_session.user_id <> v_user_id then raise exception 'not authorized'; end if;
  if v_session.closed_at is not null then raise exception 'cash session already closed'; end if;

  v_note := nullif(left(trim(coalesce(p_note, '')), 500), '');
  if p_type = 'cash_out' and v_note is null then
    raise exception 'cash out note is required';
  end if;

  select round(
    v_session.opening_cash
      + coalesce((
          select sum(p.amount)
          from public.payments p
          join public.orders o on o.id = p.order_id
          where p.method = 'cash'
            and o.status = 'paid'
            and o.user_id = v_session.user_id
            and o.created_at >= v_session.opened_at
            and o.created_at <= now()
        ), 0)
      + coalesce((select sum(cm.amount) from public.cash_movements cm where cm.session_id = v_session.id and cm.type = 'cash_in'), 0)
      - coalesce((select sum(cm.amount) from public.cash_movements cm where cm.session_id = v_session.id and cm.type = 'cash_out'), 0),
    2
  ) into v_available;

  if p_type = 'cash_out' and p_amount > v_available then
    raise exception 'cash out exceeds available cash';
  end if;

  return query
  insert into public.cash_movements(session_id, user_id, type, amount, note)
  values (v_session.id, v_user_id, p_type, round(p_amount, 2), v_note)
  returning cash_movements.id, cash_movements.session_id, cash_movements.user_id,
    cash_movements.type, cash_movements.amount, cash_movements.note,
    cash_movements.created_at;
end;
$$;

create or replace function public.close_cash_session(
  p_token text,
  p_session_id uuid,
  p_counted_cash numeric,
  p_note text default null
)
returns table (
  cash_session_id uuid,
  counted_cash numeric,
  expected_cash numeric,
  variance numeric,
  cash_sales numeric,
  cash_in numeric,
  cash_out numeric
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_role text;
  v_branch_id uuid;
  v_session public.cash_sessions%rowtype;
  v_expected numeric;
  v_cash_sales numeric;
  v_cash_in numeric;
  v_cash_out numeric;
  v_closed_at timestamptz := now();
  v_note text;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;
  if p_counted_cash is null or p_counted_cash < 0 or p_counted_cash > 1000000 then
    raise exception 'invalid counted cash';
  end if;

  select u.role::text, u.branch_id into v_role, v_branch_id
  from public.users u
  where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;

  select cs.* into v_session
  from public.cash_sessions cs
  where cs.id = p_session_id
  for update;
  if not found or v_session.closed_at is not null then raise exception 'cash session not found or already closed'; end if;
  if v_session.user_id <> v_user_id
     and not (v_role in ('owner', 'manager') and v_session.branch_id is not distinct from v_branch_id) then
    raise exception 'not authorized';
  end if;

  select round(coalesce(sum(p.amount), 0), 2) into v_cash_sales
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.method = 'cash'
    and o.status = 'paid'
    and o.user_id = v_session.user_id
    and o.created_at >= v_session.opened_at
    and o.created_at <= v_closed_at;

  select
    round(coalesce(sum(cm.amount) filter (where cm.type = 'cash_in'), 0), 2),
    round(coalesce(sum(cm.amount) filter (where cm.type = 'cash_out'), 0), 2)
  into v_cash_in, v_cash_out
  from public.cash_movements cm
  where cm.session_id = v_session.id;

  v_expected := round(v_session.opening_cash + v_cash_sales + v_cash_in - v_cash_out, 2);
  v_note := nullif(left(trim(coalesce(p_note, '')), 500), '');

  update public.cash_sessions cs
  set closed_at = v_closed_at,
      counted_cash = round(p_counted_cash, 2),
      expected_cash = v_expected,
      variance = round(p_counted_cash - v_expected, 2),
      note = v_note
  where cs.id = v_session.id and cs.closed_at is null;
  if not found then raise exception 'cash session was closed by another request'; end if;

  return query select v_session.id, round(p_counted_cash, 2), v_expected,
    round(p_counted_cash - v_expected, 2), v_cash_sales, v_cash_in, v_cash_out;
end;
$$;

revoke all on function public.open_cash_session(text,numeric) from public;
revoke all on function public.get_cash_session_summary(text,integer) from public;
revoke all on function public.get_cash_movements(text,uuid) from public;
revoke all on function public.add_cash_movement(text,uuid,text,numeric,text) from public;
revoke all on function public.close_cash_session(text,uuid,numeric,text) from public;
grant execute on function public.open_cash_session(text,numeric) to anon, authenticated;
grant execute on function public.get_cash_session_summary(text,integer) to anon, authenticated;
grant execute on function public.get_cash_movements(text,uuid) to anon, authenticated;
grant execute on function public.add_cash_movement(text,uuid,text,numeric,text) to anon, authenticated;
grant execute on function public.close_cash_session(text,uuid,numeric,text) to anon, authenticated;

commit;
