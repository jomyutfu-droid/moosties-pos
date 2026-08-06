-- Require the staff member to be selected before PIN verification.
-- The browser receives only a random session token and safe identity fields.
begin;

create or replace function public.verify_selected_staff_pin(p_user_id uuid, p_pin text)
returns table (
  session_token text,
  id uuid,
  branch_id uuid,
  name text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user public.users%rowtype;
  v_token text;
begin
  if p_user_id is null or p_pin is null or length(p_pin) < 4 or length(p_pin) > 12 then
    return;
  end if;

  select u.* into v_user
  from public.users as u
  where u.id = p_user_id
    and u.is_active = true
    and encode(extensions.digest(p_pin, 'sha256'), 'hex') = u.pin_hash;
  if not found then
    return;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.pin_sessions(user_id, token_hash)
  values (v_user.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return query
  select v_token, v_user.id, v_user.branch_id, v_user.name,
    v_user.role::text, v_user.is_active, v_user.created_at, v_user.updated_at;
end;
$$;

revoke all on function public.verify_selected_staff_pin(uuid, text) from public;
grant execute on function public.verify_selected_staff_pin(uuid, text) to anon, authenticated;

commit;
