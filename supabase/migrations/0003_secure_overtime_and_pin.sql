-- Security hardening for PIN lookup and overtime/payroll data.
-- PIN verification is done inside Postgres; pin_hash is never returned to the browser.
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
language sql
security definer
set search_path = public, extensions
as $$
  select u.id, u.branch_id, u.name, u.email, u.role::text, u.hourly_wage,
         u.is_active, u.created_at, u.updated_at
  from public.users u
  where u.is_active = true
    and encode(extensions.digest(p_pin, 'sha256'), 'hex') = u.pin_hash;
$$;

revoke all on function public.verify_staff_pin(text) from public;
grant execute on function public.verify_staff_pin(text) to anon, authenticated;

alter table public.overtime_requests enable row level security;
drop policy if exists overtime_requests_read on public.overtime_requests;
drop policy if exists overtime_requests_insert on public.overtime_requests;
drop policy if exists overtime_requests_update on public.overtime_requests;

-- Never allow the browser to write wage/amount fields directly. The function
-- below derives them from the time log and the employee's current wage.
revoke all on public.overtime_requests from anon, authenticated;

create or replace function public.submit_overtime_request(
  p_time_log_id uuid,
  p_ot_start timestamptz,
  p_ot_end timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wage numeric(12,2);
  v_minutes integer;
  v_id uuid;
begin
  if p_ot_end <= p_ot_start then
    raise exception 'invalid overtime range';
  end if;

  select t.user_id, coalesce(u.hourly_wage, 0)
    into v_user_id, v_wage
  from public.time_logs t
  join public.users u on u.id = t.user_id and u.is_active = true
  where t.id = p_time_log_id;

  if v_user_id is null then
    raise exception 'time log not found';
  end if;

  v_minutes := floor(extract(epoch from (p_ot_end - p_ot_start)) / 60);
  if v_minutes <= 0 then
    raise exception 'overtime must be at least one minute';
  end if;

  insert into public.overtime_requests
    (time_log_id, user_id, ot_start, ot_end, minutes, hourly_wage, amount, status, reviewed_by, reviewed_at, note)
  values
    (p_time_log_id, v_user_id, p_ot_start, p_ot_end, v_minutes, v_wage,
     round((v_minutes::numeric / 60) * v_wage, 2), 'pending', null, null, p_note)
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

revoke all on function public.submit_overtime_request(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.submit_overtime_request(uuid, timestamptz, timestamptz, text) to anon, authenticated;

-- Employees may submit a pending request, but cannot read salary/OT rows.
-- Only an authenticated, active Owner/Manager can read or review OT.
create policy overtime_requests_read on public.overtime_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and u.is_active = true
        and u.role in ('owner', 'manager')
    )
  );

create policy overtime_requests_update on public.overtime_requests
  for update to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.users u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and u.is_active = true
        and u.role in ('owner', 'manager')
    )
  )
  with check (
    status in ('approved', 'rejected')
    and reviewed_by is not null
    and reviewed_at is not null
    and exists (
      select 1 from public.users u
      where u.id = reviewed_by
        and lower(u.email) = lower(auth.jwt() ->> 'email')
        and u.is_active = true
        and u.role in ('owner', 'manager')
    )
  );
