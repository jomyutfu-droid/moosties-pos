-- Keep admin RPCs fail-closed when the PIN token is missing, expired, or invalid.
-- The browser may persist only the random session token; pin_hash remains excluded.

create or replace function public.get_users_admin(p_token text)
returns table (id uuid, branch_id uuid, name text, email text, role text,
  hourly_wage numeric, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_uid uuid; v_role text;
begin
  v_uid := public.pin_session_user(p_token);
  select u.role::text into v_role from public.users u where u.id = v_uid and u.is_active = true;
  if v_uid is null or v_role <> 'owner' then raise exception 'not authorized'; end if;
  return query select u.id,u.branch_id,u.name,u.email,u.role::text,u.hourly_wage,
    u.is_active,u.created_at,u.updated_at from public.users u order by u.name;
end;
$$;
revoke all on function public.get_users_admin(text) from public;
grant execute on function public.get_users_admin(text) to anon, authenticated;

create or replace function public.save_user_admin(
  p_token text, p_id uuid, p_branch_id uuid, p_name text, p_email text,
  p_role text, p_is_active boolean, p_hourly_wage numeric, p_pin_hash text default null
)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_uid uuid; v_role text; v_user public.users;
begin
  v_uid := public.pin_session_user(p_token);
  select u.role::text into v_role from public.users u where u.id = v_uid and u.is_active = true;
  if v_uid is null or v_role <> 'owner' then raise exception 'owner required'; end if;
  if p_role not in ('owner','manager','staff') then raise exception 'invalid role'; end if;
  insert into public.users(id,branch_id,name,email,role,is_active,hourly_wage,pin_hash)
    values(coalesce(p_id,gen_random_uuid()),p_branch_id,p_name,nullif(p_email,''),p_role,
      coalesce(p_is_active,true),coalesce(p_hourly_wage,0),p_pin_hash)
  on conflict (id) do update set branch_id=excluded.branch_id,name=excluded.name,
    email=excluded.email,role=excluded.role,is_active=excluded.is_active,
    hourly_wage=excluded.hourly_wage,
    pin_hash=coalesce(excluded.pin_hash,public.users.pin_hash),updated_at=now()
  returning * into v_user;
end;
$$;
revoke all on function public.save_user_admin(text,uuid,uuid,text,text,text,boolean,numeric,text) from public;
grant execute on function public.save_user_admin(text,uuid,uuid,text,text,text,boolean,numeric,text) to anon, authenticated;

create or replace function public.deactivate_user_admin(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_uid uuid; v_role text;
begin
  v_uid := public.pin_session_user(p_token);
  select u.role::text into v_role from public.users u where u.id = v_uid and u.is_active = true;
  if v_uid is null or v_role <> 'owner' then raise exception 'owner required'; end if;
  update public.users set is_active = false, updated_at = now() where id = p_id;
end;
$$;
revoke all on function public.deactivate_user_admin(text,uuid) from public;
grant execute on function public.deactivate_user_admin(text,uuid) to anon, authenticated;
