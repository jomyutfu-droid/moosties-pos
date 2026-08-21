do $$
declare
  v_main_branch uuid;
begin
  select u.branch_id into v_main_branch
  from public.users u
  where u.role::text = 'owner'
    and u.is_active = true
    and u.branch_id is not null
  order by u.created_at
  limit 1;

  if v_main_branch is null then
    raise exception 'owner branch is not configured';
  end if;

  update public.users u
  set branch_id = v_main_branch,
      updated_at = now()
  where u.role::text <> 'owner'
    and u.branch_id is null;
end;
$$;

create or replace function public.save_user_admin(
  p_token text,
  p_id uuid,
  p_branch_id uuid,
  p_name text,
  p_email text,
  p_role text,
  p_is_active boolean,
  p_hourly_wage numeric,
  p_pin_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_uid uuid;
  v_role text;
  v_owner_branch uuid;
  v_user public.users;
begin
  v_uid := public.pin_session_user(p_token);

  select u.role::text, u.branch_id
  into v_role, v_owner_branch
  from public.users u
  where u.id = v_uid and u.is_active = true;

  if v_uid is null or v_role <> 'owner' then
    raise exception 'owner required';
  end if;
  if v_owner_branch is null then
    raise exception 'owner branch is not configured';
  end if;
  if p_role not in ('owner', 'manager', 'staff') then
    raise exception 'invalid role';
  end if;

  insert into public.users(
    id, branch_id, name, email, role, is_active, hourly_wage, pin_hash
  )
  values(
    coalesce(p_id, gen_random_uuid()),
    coalesce(p_branch_id, v_owner_branch),
    p_name,
    nullif(p_email, ''),
    p_role,
    coalesce(p_is_active, true),
    coalesce(p_hourly_wage, 0),
    p_pin_hash
  )
  on conflict (id) do update set
    branch_id = coalesce(excluded.branch_id, v_owner_branch),
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    is_active = excluded.is_active,
    hourly_wage = excluded.hourly_wage,
    pin_hash = coalesce(excluded.pin_hash, public.users.pin_hash),
    updated_at = now()
  returning * into v_user;
end;
$function$;