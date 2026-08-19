-- Secure owner-only bill cancellation.
-- The legacy void_order(uuid, uuid) routine is no longer callable from the client.

revoke execute on function public.void_order(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.void_order_owner(
  p_token text,
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_role text;
  v_branch_id uuid;
  v_order public.orders%rowtype;
  v_mov record;
  v_reason text;
begin
  v_user_id := public.pin_session_user(p_token);
  if v_user_id is null then
    raise exception 'session expired';
  end if;

  select u.role::text, u.branch_id
    into v_role, v_branch_id
  from public.users u
  where u.id = v_user_id
    and u.is_active = true;

  if not found or v_role <> 'owner' then
    raise exception 'owner required';
  end if;

  select *
    into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'ไม่พบบิล %', p_order_id;
  end if;

  if v_order.branch_id is distinct from v_branch_id then
    raise exception 'ไม่สามารถยกเลิกบิลต่างสาขาได้';
  end if;

  if v_order.status = 'void' then
    return;
  end if;

  if v_order.status <> 'paid' then
    raise exception 'ยกเลิกได้เฉพาะบิลที่ชำระแล้ว';
  end if;

  v_reason := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  if v_reason is null then
    raise exception 'กรุณาระบุเหตุผลการยกเลิกบิล';
  end if;

  for v_mov in
    select ingredient_id, qty_delta, conversion_factor
    from public.stock_movements
    where ref_order_id = p_order_id
      and type = 'sale'
  loop
    insert into public.stock_movements (
      ingredient_id, type, qty_delta, ref_order_id, user_id, note, conversion_factor
    )
    values (
      v_mov.ingredient_id,
      'adjust',
      -v_mov.qty_delta,
      p_order_id,
      v_user_id,
      'คืนสต็อกจากการยกเลิกบิล',
      coalesce(v_mov.conversion_factor, 1)
    );

    update public.ingredients
    set stock_qty = stock_qty - v_mov.qty_delta,
        updated_at = now()
    where id = v_mov.ingredient_id;
  end loop;

  update public.orders
  set status = 'void',
      updated_at = now()
  where id = p_order_id
    and status = 'paid';

  if not found then
    raise exception 'บิลถูกยกเลิกโดยผู้ใช้อื่นแล้ว';
  end if;

  insert into public.audit_log (user_id, action, entity, entity_id, detail_json)
  values (
    v_user_id,
    'void_order',
    'orders',
    p_order_id,
    jsonb_build_object(
      'order_no', v_order.order_no,
      'total', v_order.total,
      'reason', v_reason,
      'stock_restored', true
    )
  );
end;
$$;

revoke all on function public.void_order_owner(text, uuid, text) from public;
grant execute on function public.void_order_owner(text, uuid, text) to anon, authenticated;
