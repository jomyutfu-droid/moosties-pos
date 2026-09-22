-- Restrict privileged access to a PIN-verified, minimal staff lookup only.
create schema if not exists private;
grant usage on schema private to authenticated;
create function private.line_man_staff_context(p_token text)
returns table(user_id uuid, branch_id uuid, staff_role text)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อนขาย LINE MAN'; end if;
  v_user := public.pin_session_user(p_token);
  if v_user is null then raise exception 'PIN session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'; end if;
  return query select u.id, u.branch_id, u.role from public.users u where u.id = v_user and u.is_active;
end;
$$;
revoke all on function private.line_man_staff_context(text) from public, anon;
grant execute on function private.line_man_staff_context(text) to authenticated;

create or replace function public.submit_line_man_order(p_token text, p_sale jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid;
  v_branch uuid;
  v_role text;
  v_uuid uuid := (p_sale->>'client_uuid')::uuid;
  v_ref text := upper(btrim(p_sale->>'reference'));
  v_existing public.orders%rowtype;
  v_item jsonb;
  v_opt jsonb;
  v_move jsonb;
  v_base numeric;
  v_price numeric;
  v_qty numeric;
  v_expected numeric;
  v_subtotal numeric := 0;
  v_discount numeric := (p_sale->>'discount')::numeric;
  v_total numeric := (p_sale->>'total')::numeric;
  v_cap numeric;
  v_receipt jsonb;
  v_now timestamptz := now();
begin
  select user_id, branch_id, staff_role into v_user, v_branch, v_role from private.line_man_staff_context(p_token);
  if not found then raise exception 'ไม่พบพนักงานที่ใช้งานอยู่'; end if;
  if v_uuid is null or v_ref is null or v_ref !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$' then
    raise exception 'กรุณากรอกเลขคำสั่งซื้อ LINE MAN แบบเต็ม';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uuid::text, 17));
  select * into v_existing from public.orders where client_uuid = v_uuid;
  if found then
    if v_existing.checkout_source is distinct from 'line_man' or v_existing.external_order_ref is distinct from v_ref
      or v_existing.branch_id is distinct from v_branch or v_existing.user_id is distinct from v_user then
      raise exception 'รหัสรายการไม่ตรงกัน';
    end if;
    if v_existing.status <> 'paid' then raise exception 'บิลนี้ถูกยกเลิกแล้ว ตรวจสอบประวัติ'; end if;
    return v_existing.receipt_snapshot;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(v_branch::text, '') || ':' || v_ref, 23));
  if exists(select 1 from public.orders where checkout_source = 'line_man'
    and branch_id is not distinct from v_branch and external_order_ref = v_ref) then
    raise exception using errcode = '23505', message = 'เลขคำสั่งซื้อ LINE MAN นี้ถูกบันทึกแล้ว';
  end if;
  if jsonb_typeof(p_sale->'items') is distinct from 'array' or jsonb_array_length(p_sale->'items') = 0
    or jsonb_typeof(p_sale->'receipt'->'lines') is distinct from 'array'
    or jsonb_typeof(p_sale->'stock_movements') is distinct from 'array' then
    raise exception 'รายการขายไม่ครบถ้วน';
  end if;
  for v_item in select * from jsonb_array_elements(p_sale->'items') loop
    select line_man_price into v_base from public.products where id = (v_item->>'product_id')::uuid and is_active;
    if not found or v_base is null then raise exception 'เมนูยังไม่ตั้งราคา LINE MAN หรือปิดใช้งานแล้ว'; end if;
    v_expected := v_base;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty < 1 or v_qty > 999 or v_qty <> trunc(v_qty) then raise exception 'จำนวนแก้วไม่ถูกต้อง'; end if;
    for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options_json', '[]'::jsonb)) loop
      if v_opt->>'option_id' like 'sweetness:%' then
        if (v_opt->>'price_delta')::numeric is distinct from 0::numeric then raise exception 'ราคาความหวานไม่ถูกต้อง'; end if;
        continue;
      end if;
      select line_man_price into v_price from public.product_options
        where id = (v_opt->>'option_id')::uuid and product_id = (v_item->>'product_id')::uuid;
      if not found or v_price is null then raise exception 'ท็อปปิ้งยังไม่ตั้งราคา LINE MAN'; end if;
      if (v_opt->>'quantity')::numeric is null or (v_opt->>'quantity')::numeric not between 1 and 99
        or (v_opt->>'quantity')::numeric <> trunc((v_opt->>'quantity')::numeric) then raise exception 'จำนวนท็อปปิ้งไม่ถูกต้อง'; end if;
      v_price := round(v_price * (v_opt->>'quantity')::numeric, 2);
      if (v_opt->>'price_delta')::numeric is distinct from v_price then raise exception 'ราคาท็อปปิ้งเปลี่ยนแล้ว กรุณาเลือกเมนูใหม่'; end if;
      v_expected := v_expected + v_price;
    end loop;
    if (v_item->>'unit_price')::numeric is distinct from v_expected or
      (v_item->>'line_total')::numeric is distinct from round(v_expected * v_qty, 2) then
      raise exception 'ราคา LINE MAN เปลี่ยนแล้ว กรุณารีเฟรชและเลือกเมนูใหม่';
    end if;
    v_subtotal := v_subtotal + round(v_expected * v_qty, 2);
  end loop;
  if v_discount is null or v_discount < 0 or v_discount > v_subtotal or round(v_discount, 2) <> v_discount
    or v_total is distinct from round(v_subtotal - v_discount, 2)
    or (p_sale->>'subtotal')::numeric is distinct from v_subtotal then raise exception 'ยอดขายหรือส่วนลดไม่ถูกต้อง'; end if;
  if v_role not in ('owner', 'manager') then
    select (value #>> '{}')::numeric into v_cap from public.settings where key = 'staff_discount_limit';
    if v_discount > coalesce(v_cap, 0) then raise exception 'ส่วนลดเกินสิทธิ์พนักงาน'; end if;
  end if;
  for v_move in select * from jsonb_array_elements(p_sale->'stock_movements') loop
    if v_move->>'type' is distinct from 'sale' or (v_move->>'qty_delta')::numeric is null
      or (v_move->>'qty_delta')::numeric > 0 then raise exception 'รายการตัดสต็อกไม่ถูกต้อง'; end if;
  end loop;
  v_receipt := (p_sale->'receipt') || jsonb_build_object('source','line_man','lineManOrderId',v_ref,
    'total',v_total,'paid',v_total,'change',0,'discount',v_discount,'createdAt',v_now,
    'orderNo','LM-' || to_char(v_now at time zone 'Asia/Bangkok','YYYYMMDD') || '-' || upper(left(v_uuid::text,8)));
  -- The existing sale RPC and the unique-reference write share one transaction.
  -- Any error rolls back items, payment and stock together.
  perform public.submit_order(v_uuid, v_branch, v_user, 'delivery', v_subtotal, v_discount, v_total,
    (p_sale->>'cogs_total')::numeric, p_sale->>'note', p_sale->'items',
    jsonb_build_array(jsonb_build_object('method','other','amount',v_total,'ref','LINE MAN: ' || v_ref)), p_sale->'stock_movements');
  update public.orders set checkout_source = 'line_man', external_order_ref = v_ref, receipt_snapshot = v_receipt,
    order_no = v_receipt->>'orderNo', created_at = v_now
    where client_uuid = v_uuid;
  if not found then raise exception 'บันทึกคำสั่งซื้อไม่สำเร็จ'; end if;
  return v_receipt;
end;
$$;
revoke all on function public.submit_line_man_order(text,jsonb) from public, anon;
grant execute on function public.submit_line_man_order(text,jsonb) to authenticated;
