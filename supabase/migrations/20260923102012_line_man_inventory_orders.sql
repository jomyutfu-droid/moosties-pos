-- LINE MAN is an operational order ticket, not a zero-value financial sale.
create table public.line_man_orders (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  branch_id uuid references public.branches(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  external_order_ref text not null check (external_order_ref ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'),
  order_no text not null unique,
  status text not null default 'received' check (status = 'received'),
  note text,
  receipt_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create unique index line_man_orders_branch_reference_unique
  on public.line_man_orders (coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),external_order_ref);
create index line_man_orders_history_idx on public.line_man_orders(branch_id,created_at desc);
alter table public.line_man_orders enable row level security;
revoke all on public.line_man_orders from public, anon, authenticated;

create table public.line_man_order_items (
  id uuid primary key default gen_random_uuid(),
  line_man_order_id uuid not null references public.line_man_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name_snapshot text not null,
  qty integer not null check (qty between 1 and 999),
  options_text text not null default '',
  recipe_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index line_man_order_items_order_idx on public.line_man_order_items(line_man_order_id);
alter table public.line_man_order_items enable row level security;
revoke all on public.line_man_order_items from public, anon, authenticated;

alter table public.stock_movements add column line_man_order_id uuid
  references public.line_man_orders(id) on delete set null;
create index stock_movements_line_man_order_idx on public.stock_movements(line_man_order_id)
  where line_man_order_id is not null;

-- Private privileged writer: requires both the logged-in app session and a live staff PIN session.
create function private.record_line_man_order(p_token text,p_order jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_branch uuid;
  v_order_id uuid;
  v_uuid uuid := (p_order->>'client_uuid')::uuid;
  v_ref text := upper(btrim(p_order->>'reference'));
  v_order_no text;
  v_existing public.line_man_orders%rowtype;
  v_item jsonb;
  v_move jsonb;
  v_receipt jsonb;
  v_now timestamptz := now();
  v_cups integer := 0;
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อนบันทึก LINE MAN'; end if;
  v_user := public.pin_session_user(p_token);
  if v_user is null then raise exception 'PIN session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'; end if;
  select u.branch_id into v_branch from public.users u where u.id=v_user and u.is_active;
  if not found then raise exception 'ไม่พบพนักงานที่ใช้งานอยู่'; end if;
  if v_uuid is null or v_ref is null or v_ref !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$' then raise exception 'กรุณากรอกเลข LINE MAN แบบเต็ม'; end if;
  if jsonb_typeof(p_order->'items') is distinct from 'array'
    or jsonb_array_length(p_order->'items')=0
    or jsonb_typeof(p_order->'stock_movements') is distinct from 'array'
    or (p_order ?| array['total','subtotal','discount','paid','change','unit_price','line_total','cogs_total']) then
    raise exception 'รายการออเดอร์ไม่ครบ หรือมีข้อมูลราคา';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uuid::text,17));
  select * into v_existing from public.line_man_orders where client_uuid=v_uuid;
  if found then
    if v_existing.external_order_ref is distinct from v_ref or v_existing.branch_id is distinct from v_branch or v_existing.user_id is distinct from v_user then raise exception 'รหัสรายการไม่ตรงกัน'; end if;
    return v_existing.receipt_snapshot;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(v_branch::text,'')||':'||v_ref,23));
  if exists(select 1 from public.line_man_orders where branch_id is not distinct from v_branch and external_order_ref=v_ref) then
    raise exception using errcode='23505',message='เลขคำสั่งซื้อ LINE MAN นี้ถูกบันทึกแล้ว';
  end if;
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    if v_item ?| array['unit_price','line_total','price','cogs_snapshot','cogs_total','subtotal','discount','total'] then raise exception 'LINE MAN ไม่รับข้อมูลราคา'; end if;
    if nullif(v_item->>'name_snapshot','') is null or (v_item->>'qty')::integer not between 1 and 999
      or jsonb_typeof(v_item->'recipe') is distinct from 'array' then raise exception 'รายการสินค้าไม่ถูกต้อง'; end if;
    v_cups := v_cups + (v_item->>'qty')::integer;
  end loop;
  for v_move in select * from jsonb_array_elements(p_order->'stock_movements') loop
    if v_move ?| array['unit_price','line_total','price','cost','cogs','total'] then raise exception 'LINE MAN ไม่รับข้อมูลราคา'; end if;
    if v_move->>'type' is distinct from 'sale' or (v_move->>'qty_delta')::numeric is null
      or (v_move->>'qty_delta')::numeric >= 0 or abs((v_move->>'qty_delta')::numeric)>100000 then raise exception 'รายการตัดสต็อกไม่ถูกต้อง'; end if;
    if not exists(select 1 from public.ingredients i where i.id=(v_move->>'ingredient_id')::uuid) then raise exception 'ไม่พบวัตถุดิบสำหรับตัดสต็อก'; end if;
  end loop;
  v_order_id := gen_random_uuid();
  v_order_no := 'LM-'||to_char(v_now at time zone 'Asia/Bangkok','YYYYMMDD')||'-'||upper(left(v_uuid::text,8));
  v_receipt := jsonb_build_object('source','line_man','orderNo',v_order_no,'lineManOrderId',v_ref,
    'createdAt',v_now,'totalCups',v_cups,'items',p_order->'items');
  insert into public.line_man_orders(id,client_uuid,branch_id,user_id,external_order_ref,order_no,note,receipt_snapshot,created_at)
    values(v_order_id,v_uuid,v_branch,v_user,v_ref,v_order_no,nullif(p_order->>'note',''),v_receipt,v_now);
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    insert into public.line_man_order_items(line_man_order_id,product_id,name_snapshot,qty,options_text,recipe_snapshot)
      values(v_order_id,nullif(v_item->>'product_id','')::uuid,v_item->>'name_snapshot',(v_item->>'qty')::integer,
        coalesce(v_item->>'options_text',''),v_item->'recipe');
  end loop;
  for v_move in select * from jsonb_array_elements(p_order->'stock_movements') loop
    insert into public.stock_movements(ingredient_id,type,qty_delta,ref_order_id,user_id,note,line_man_order_id)
      values((v_move->>'ingredient_id')::uuid,'sale',(v_move->>'qty_delta')::numeric,null,v_user,
        'LINE MAN '||v_ref||coalesce(': '||nullif(v_move->>'note',''),''),v_order_id);
    update public.ingredients set stock_qty=stock_qty+(v_move->>'qty_delta')::numeric where id=(v_move->>'ingredient_id')::uuid;
  end loop;
  return v_receipt;
end;
$$;
revoke all on function private.record_line_man_order(text,jsonb) from public,anon;
grant execute on function private.record_line_man_order(text,jsonb) to authenticated;

create function public.record_line_man_order(p_token text,p_order jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.record_line_man_order(p_token,p_order);
$$;
revoke all on function public.record_line_man_order(text,jsonb) from public,anon;
grant execute on function public.record_line_man_order(text,jsonb) to authenticated;

create function private.list_line_man_orders(p_token text,p_reference text default null)
returns table(id uuid,external_order_ref text,order_no text,status text,created_at timestamptz,receipt_snapshot jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_branch uuid;
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อนดูประวัติ'; end if;
  v_user:=public.pin_session_user(p_token);
  if v_user is null then raise exception 'PIN session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'; end if;
  select u.branch_id into v_branch from public.users u where u.id=v_user and u.is_active;
  if not found then raise exception 'ไม่พบพนักงานที่ใช้งานอยู่'; end if;
  return query select o.id,o.external_order_ref,o.order_no,o.status,o.created_at,o.receipt_snapshot
    from public.line_man_orders o where o.branch_id is not distinct from v_branch
      and (p_reference is null or o.external_order_ref=upper(btrim(p_reference)))
    order by o.created_at desc limit 50;
end;
$$;
revoke all on function private.list_line_man_orders(text,text) from public,anon;
grant execute on function private.list_line_man_orders(text,text) to authenticated;
create function public.list_line_man_orders(p_token text,p_reference text default null)
returns table(id uuid,external_order_ref text,order_no text,status text,created_at timestamptz,receipt_snapshot jsonb)
language sql security invoker set search_path = '' as $$
  select * from private.list_line_man_orders(p_token,p_reference);
$$;
revoke all on function public.list_line_man_orders(text,text) from public,anon;
grant execute on function public.list_line_man_orders(text,text) to authenticated;
