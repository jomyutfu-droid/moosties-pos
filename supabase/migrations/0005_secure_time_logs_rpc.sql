-- Protect attendance records behind the same PIN session used by OT/payroll.
-- Apply after 0004_pin_only_secure.sql.
begin;

create or replace function public.get_time_logs_session(
  p_token text,
  p_open_only boolean default false,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  user_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz,
  user_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session_user uuid;
  v_role text;
begin
  v_session_user := public.pin_session_user(p_token);
  if v_session_user is null then raise exception 'session expired'; end if;

  select u.role::text into v_role
  from public.users u
  where u.id = v_session_user and u.is_active = true;

  return query
    select t.id, t.user_id, t.clock_in, t.clock_out, t.note, t.created_at, u.name
    from public.time_logs t
    join public.users u on u.id = t.user_id
    where (v_role in ('owner', 'manager') or t.user_id = v_session_user)
      and (not coalesce(p_open_only, false) or t.clock_out is null)
      and (p_from is null or t.clock_in >= p_from)
      and (p_to is null or t.clock_in <= p_to)
    order by t.clock_in desc;
end;
$$;
revoke all on function public.get_time_logs_session(text,boolean,timestamptz,timestamptz) from public;
grant execute on function public.get_time_logs_session(text,boolean,timestamptz,timestamptz) to anon, authenticated;

create or replace function public.get_open_time_log(p_token text, p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz,
  user_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session_user uuid;
  v_role text;
begin
  v_session_user := public.pin_session_user(p_token);
  if v_session_user is null then raise exception 'session expired'; end if;
  select u.role::text into v_role from public.users u where u.id = v_session_user and u.is_active;
  if p_user_id is null or (p_user_id <> v_session_user and v_role not in ('owner','manager')) then
    raise exception 'not authorized';
  end if;

  return query
    select t.id, t.user_id, t.clock_in, t.clock_out, t.note, t.created_at, u.name
    from public.time_logs t
    join public.users u on u.id = t.user_id
    where t.user_id = p_user_id and t.clock_out is null
    order by t.clock_in desc
    limit 1;
end;
$$;
revoke all on function public.get_open_time_log(text,uuid) from public;
grant execute on function public.get_open_time_log(text,uuid) to anon, authenticated;

create or replace function public.create_time_log(
  p_token text, p_user_id uuid, p_note text default null
)
returns table (
  id uuid,
  user_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session_user uuid;
begin
  v_session_user := public.pin_session_user(p_token);
  if v_session_user is null or p_user_id is null or p_user_id <> v_session_user then
    raise exception 'not authorized';
  end if;

  return query
    insert into public.time_logs(user_id, note)
    values (v_session_user, nullif(left(coalesce(p_note, ''), 500), ''))
    returning time_logs.id, time_logs.user_id, time_logs.clock_in,
      time_logs.clock_out, time_logs.note, time_logs.created_at;
end;
$$;
revoke all on function public.create_time_log(text,uuid,text) from public;
grant execute on function public.create_time_log(text,uuid,text) to anon, authenticated;

create or replace function public.close_time_log(
  p_token text, p_log_id uuid, p_clock_out timestamptz
)
returns table (
  id uuid,
  user_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session_user uuid;
begin
  v_session_user := public.pin_session_user(p_token);
  if v_session_user is null then raise exception 'session expired'; end if;
  if p_log_id is null or p_clock_out is null then raise exception 'invalid clock-out'; end if;

  return query
    update public.time_logs t
    set clock_out = p_clock_out
    where t.id = p_log_id and t.user_id = v_session_user and t.clock_out is null
    returning t.id, t.user_id, t.clock_in, t.clock_out, t.note, t.created_at;

  if not found then raise exception 'time log not found or already closed'; end if;
end;
$$;
revoke all on function public.close_time_log(text,uuid,timestamptz) from public;
grant execute on function public.close_time_log(text,uuid,timestamptz) to anon, authenticated;

-- No table-level attendance access remains; every attendance operation checks
-- the server-side PIN session and derives the authenticated employee from it.
revoke all on public.time_logs from anon, authenticated;

commit;
