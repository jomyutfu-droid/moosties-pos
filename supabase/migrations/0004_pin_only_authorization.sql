-- PIN-only authorization for privileged screens and overtime/payroll.
-- A valid PIN creates a short-lived server-side session bound to the device's
-- anonymous Supabase auth user. No email/password is required and no PIN/hash
-- is persisted in the browser.

create table if not exists public.pin_sessions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.pin_sessions enable row level security;
revoke all on public.pin_sessions from anon, authenticated;
grant select on public.pin_sessions to authenticated;

drop policy if exists pin_sessions_self on public.pin_sessions;
create policy pin_sessions_self on public.pin_sessions
  for select to authenticated
  using (auth_user_id = auth.uid());

create or replace function public.verify_staff_pin(p_pin text)
returns table (
  id uuid,
  branch_id uuid,
  name text,
  email text,
  role text,
  hourly_wage numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer;
  v_user_id uuid;
begin
  select count(*), (array_agg(u.id))[1]
    into v_count, v_user_id
  from public.users u
  where u.is_active = true
    and encode(extensions.digest(p_pin, 'sha256'), 'hex') = u.pin_hash;

  if v_count = 1 and auth.uid() is not null then
    insert into public.pin_sessions (auth_user_id, user_id, expires_at, updated_at)
    values (auth.uid(), v_user_id, now() + interval '12 hours', now())
    on conflict (auth_user_id) do update
      set user_id = excluded.user_id,
          expires_at = excluded.expires_at,
          updated_at = now();
  end if;

  return query
  select u.id, u.branch_id, u.name, u.email, u.role::text, u.hourly_wage,
         u.is_active, u.created_at, u.updated_at
  from public.users u
  where u.is_active = true
    and encode(extensions.digest(p_pin, 'sha256'), 'hex') = u.pin_hash;
end;
$$;

revoke all on function public.verify_staff_pin(text) from public;
grant execute on function public.verify_staff_pin(text) to anon, authenticated;

-- Remove the email/password-only gate from OT. The PIN session is the source
-- of privilege for Owner/Manager actions.
drop policy if exists overtime_requests_read on public.overtime_requests;
drop policy if exists overtime_requests_update on public.overtime_requests;

create policy overtime_requests_read on public.overtime_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.pin_sessions ps
      join public.users u on u.id = ps.user_id
      where ps.auth_user_id = auth.uid()
        and ps.expires_at > now()
        and u.is_active = true
        and u.role in ('owner', 'manager')
    )
  );

create policy overtime_requests_update on public.overtime_requests
  for update to authenticated
  using (
    status = 'pending'
    and exists (
      select 1
      from public.pin_sessions ps
      join public.users u on u.id = ps.user_id
      where ps.auth_user_id = auth.uid()
        and ps.expires_at > now()
        and u.is_active = true
        and u.role in ('owner', 'manager')
    )
  )
  with check (
    status in ('approved', 'rejected')
    and reviewed_at is not null
    and reviewed_by = (
      select ps.user_id
      from public.pin_sessions ps
      where ps.auth_user_id = auth.uid()
        and ps.expires_at > now()
    )
  );

-- Privileged time/payroll reports use the same PIN session. Existing staff
-- policies remain in place for clock-in/out and ordinary staff views.
drop policy if exists time_logs_owner_manager_read on public.time_logs;
create policy time_logs_owner_manager_read on public.time_logs
  for select to authenticated
  using (
    exists (
      select 1
      from public.pin_sessions ps
      join public.users u on u.id = ps.user_id
      where ps.auth_user_id = auth.uid()
        and ps.expires_at > now()
        and u.is_active = true
        and u.role in ('owner', 'manager')
    )
  );


-- Resolve the currently verified PIN identity without exposing pin_hash.
create or replace function public.get_pin_session_user()
returns table (
  id uuid,
  branch_id uuid,
  name text,
  email text,
  role text,
  hourly_wage numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.branch_id, u.name, u.email, u.role::text, u.hourly_wage,
         u.is_active, u.created_at, u.updated_at
  from public.pin_sessions ps
  join public.users u on u.id = ps.user_id
  where ps.auth_user_id = auth.uid()
    and ps.expires_at > now()
    and u.is_active = true;
$$;

revoke all on function public.get_pin_session_user() from public;
grant execute on function public.get_pin_session_user() to anon, authenticated;
