-- เปลี่ยนเกณฑ์โบนัสยอดขายเป็น 25 แก้วขึ้นไปต่อวัน
begin;

create or replace function public.submit_sales_volume_reward(p_token text, p_session_id uuid, p_cups_sold integer)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_role text;
  v_branch_id uuid;
  v_session_user uuid;
  v_session_branch uuid;
  v_session_closed_at timestamptz;
  v_reward_date date;
  v_reward_id uuid;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then raise exception 'session expired'; end if;

  select u.role::text, u.branch_id into v_role, v_branch_id
  from public.users u
  where u.id = v_user_id and u.is_active = true;
  if not found then raise exception 'user not found or inactive'; end if;
  if v_role = 'owner' then return; end if;
  if p_cups_sold is null or p_cups_sold < 0 or p_cups_sold > 100000 then raise exception 'invalid cup count'; end if;
  if p_cups_sold < 25 then return; end if;

  select cs.user_id, cs.branch_id, cs.closed_at
    into v_session_user, v_session_branch, v_session_closed_at
  from public.cash_sessions cs
  where cs.id = p_session_id;
  if not found or v_session_user <> v_user_id or v_session_branch is distinct from v_branch_id then
    raise exception 'cash session not found or not authorized';
  end if;
  if v_session_closed_at is null then
    raise exception 'กรุณายืนยันปิดกะก่อนส่งโบนัสยอดขาย';
  end if;

  v_reward_date := timezone('Asia/Bangkok', v_session_closed_at)::date;
  insert into public.staff_rewards (
    branch_id, user_id, reward_date, reward_type, quantity, amount, status,
    details_json, requested_by, updated_at
  ) values (
    v_branch_id, v_user_id, v_reward_date, 'sales_volume', p_cups_sold, 50, 'pending',
    jsonb_build_object('cups_sold', p_cups_sold), v_user_id, now()
  )
  on conflict (user_id, reward_date, reward_type) do update set
    quantity = excluded.quantity,
    amount = 50,
    status = 'pending',
    details_json = excluded.details_json,
    requested_by = excluded.requested_by,
    reviewed_by = null,
    reviewed_at = null,
    paid_by = null,
    paid_at = null,
    updated_at = now()
  returning id into v_reward_id;

  insert into public.audit_log (user_id, action, entity, entity_id, detail_json)
  values (
    v_user_id,
    'submit_staff_reward',
    'staff_rewards',
    v_reward_id,
    jsonb_build_object(
      'reward_type', 'sales_volume',
      'reward_date', v_reward_date,
      'cups_sold', p_cups_sold,
      'cash_session_id', p_session_id
    )
  );
end;
$$;

revoke all on function public.submit_sales_volume_reward(text, uuid, integer) from public;
grant execute on function public.submit_sales_volume_reward(text, uuid, integer) to anon, authenticated;

commit;
