-- Automatic prep deductions; raw ledger snapshots make retries/voids reversible.
alter table public.production_recipes add column deduction_mode text not null default 'produce' check(deduction_mode in ('produce','sale'));
alter table public.stock_movements add column prep_source_qty numeric(14,3);
create unique index production_auto_output_idx on public.production_recipes(output_id) where deduction_mode='sale';
create table private.prep_waste (
 id uuid primary key, branch_id uuid references public.branches(id), user_id uuid not null references public.users(id),
 user_name text not null, ingredient_id uuid not null references public.ingredients(id), ingredient_name text not null,
 qty numeric(14,3) not null check(qty>0), unit text not null, business_date date not null, reason text not null,
 request jsonb not null, items jsonb not null, total_cost numeric(18,4) not null,
 status text not null default 'completed' check(status in ('completed','cancelled')),
 created_at timestamptz not null default clock_timestamp(),cancelled_at timestamptz,cancel_reason text
);
alter table private.prep_waste enable row level security;
revoke all on private.prep_waste from public,anon,authenticated;
create index prep_waste_branch_date_idx on private.prep_waste(branch_id,created_at desc);
alter table public.stock_movements add column prep_waste_id uuid references private.prep_waste(id);
create index stock_movements_prep_waste_idx on public.stock_movements(prep_waste_id) where prep_waste_id is not null;

create function private.expand_prep_movements(moves jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m jsonb; r public.production_recipes%rowtype; x record; result jsonb:='[]'; q numeric;
begin
 for m in select * from jsonb_array_elements(moves) loop
  select * into r from public.production_recipes where output_id=(m->>'ingredient_id')::uuid and deduction_mode='sale';
  if not found then result:=result||jsonb_build_array(m); continue; end if;
  if not r.is_active or r.expected_qty<=0 then raise exception 'สูตร % ปิดใช้งานหรือปริมาณไม่ถูกต้อง',r.name; end if;
  if (m->>'qty_delta')::numeric>=0 or m->>'type' not in ('sale','waste') then raise exception 'สูตรอัตโนมัติรองรับการขายและทิ้งเท่านั้น'; end if;
  if not exists(select 1 from public.production_recipe_inputs where recipe_id=r.id) then raise exception 'สูตร % ไม่มีส่วนผสม',r.name; end if;
  result:=result||jsonb_build_array(m||jsonb_build_object('qty_delta',0,'prep_source_qty',-(m->>'qty_delta')::numeric));
  for x in select a.*,i.unit,i.is_active from public.production_recipe_inputs a join public.ingredients i on i.id=a.ingredient_id where a.recipe_id=r.id order by a.ingredient_id loop
   if not x.is_active or x.unit<>x.base_unit or exists(select 1 from public.production_recipes where output_id=x.ingredient_id and deduction_mode='sale') then raise exception 'ตรวจส่วนผสมและหน่วยของสูตร %',r.name; end if;
   if x.input_unit<>x.unit and not exists(select 1 from public.ingredient_units where ingredient_id=x.ingredient_id and name=x.input_unit and factor_to_base=x.factor) then raise exception 'หน่วยส่วนผสมเปลี่ยนแล้ว กรุณาตรวจสูตร %',r.name; end if;
   q:=round((m->>'qty_delta')::numeric*x.input_qty*x.factor/r.expected_qty,3);
   if q<>0 then result:=result||jsonb_build_array(jsonb_build_object('ingredient_id',x.ingredient_id,'qty_delta',q,'type',m->>'type','note',coalesce(m->>'note','')||' · ผ่านสูตร '||r.name)); end if;
  end loop;
 end loop;
 return result;
end $$;
revoke all on function private.expand_prep_movements(jsonb) from public,anon,authenticated;

create function public.get_auto_prep_recipes() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('items',(select jsonb_agg(x) from public.production_recipe_inputs x where x.recipe_id=r.id))) from public.production_recipes r where deduction_mode='sale'),'[]'::jsonb);
end $$;
revoke all on function public.get_auto_prep_recipes() from public,anon;
grant execute on function public.get_auto_prep_recipes() to authenticated;

CREATE OR REPLACE FUNCTION public.submit_order(p_client_uuid uuid, p_branch_id uuid, p_user_id uuid, p_channel text, p_subtotal numeric, p_discount numeric, p_total numeric, p_cogs_total numeric, p_note text, p_items jsonb, p_payments jsonb, p_stock_movements jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_payment  jsonb;
  v_movement jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_uuid::text,17));
  if exists (select 1 from public.orders where client_uuid = p_client_uuid) then
    return;
  end if;
  insert into public.orders (
    client_uuid, branch_id, user_id, channel,
    subtotal, discount, total, cogs_total, note,
    status, closed_at
  ) values (
    p_client_uuid, p_branch_id, p_user_id, p_channel,
    p_subtotal, p_discount, p_total, p_cogs_total, p_note,
    'paid', now()
  ) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items (
      order_id, product_id, name_snapshot,
      unit_price, qty, options_json, line_total, cogs_snapshot
    ) values (
      v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'unit_price')::numeric,
      (v_item->>'qty')::numeric,
      v_item->'options_json',
      (v_item->>'line_total')::numeric,
      (v_item->>'cogs_snapshot')::numeric
    );
  end loop;
  for v_payment in select * from jsonb_array_elements(p_payments) loop
    insert into public.payments (order_id, method, amount, ref)
    values (
      v_order_id,
      v_payment->>'method',
      (v_payment->>'amount')::numeric,
      v_payment->>'ref'
    );
  end loop;
  for v_movement in select * from jsonb_array_elements(private.expand_prep_movements(p_stock_movements)) loop
    insert into public.stock_movements (
      ingredient_id, type, qty_delta, ref_order_id, user_id, note, prep_source_qty
    ) values (
      (v_movement->>'ingredient_id')::uuid,
      v_movement->>'type',
      (v_movement->>'qty_delta')::numeric,
      v_order_id,
      p_user_id,
      v_movement->>'note',
      (v_movement->>'prep_source_qty')::numeric
    );
    update public.ingredients
    set stock_qty = stock_qty + (v_movement->>'qty_delta')::numeric
    where id = (v_movement->>'ingredient_id')::uuid;
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION private.record_line_man_order(p_token text, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items')=0
    or jsonb_typeof(p_order->'stock_movements') is distinct from 'array' then raise exception 'รายการออเดอร์ไม่ครบ'; end if;
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
  for v_move in select * from jsonb_array_elements(private.expand_prep_movements(p_order->'stock_movements')) loop
    insert into public.stock_movements(ingredient_id,type,qty_delta,ref_order_id,user_id,note,line_man_order_id,prep_source_qty)
      values((v_move->>'ingredient_id')::uuid,'sale',(v_move->>'qty_delta')::numeric,null,v_user,
        'LINE MAN '||v_ref||coalesce(': '||nullif(v_move->>'note',''),''),v_order_id,(v_move->>'prep_source_qty')::numeric);
    update public.ingredients set stock_qty=stock_qty+(v_move->>'qty_delta')::numeric where id=(v_move->>'ingredient_id')::uuid;
  end loop;
  return v_receipt;
end;
$function$;


CREATE OR REPLACE FUNCTION private.daily_tea_used(p_branch uuid, p_date date, p_ingredient uuid)
 RETURNS numeric
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select coalesce(sum(coalesce(m.prep_source_qty,-m.qty_delta)),0) from public.stock_movements m
 left join public.orders o on o.id=m.ref_order_id
 left join public.line_man_orders l on l.id=m.line_man_order_id
 where m.ingredient_id=p_ingredient and m.type='sale' and
 ((o.status='paid' and o.branch_id is not distinct from p_branch and (o.created_at at time zone 'Asia/Bangkok')::date=p_date)
 or (l.status='received' and l.branch_id is not distinct from p_branch and (l.created_at at time zone 'Asia/Bangkok')::date=p_date));
$function$;


alter function private.production_action(text,text,jsonb) rename to production_action_before_auto;
create function private.production_action(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.users%rowtype; w private.prep_waste%rowtype; ing public.ingredients%rowtype; rec public.production_recipes%rowtype;
 result jsonb; expanded jsonb; snapshots jsonb:='[]'; m jsonb; amount numeric; total numeric:=0;
 d date; page integer:=greatest(0,least(coalesce((p_data->>'page')::integer,0),1000000));
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 select * into staff from public.users where id=public.pin_session_user(p_token) and is_active;
 if not found then raise exception 'PIN หมดอายุ'; end if;
 if p_action='load' then
  result:=private.production_action_before_auto(p_token,p_action,p_data);
  return result||jsonb_build_object('waste_history',coalesce((select jsonb_agg(to_jsonb(t) order by created_at desc,id) from (select * from private.prep_waste where branch_id is not distinct from staff.branch_id order by created_at desc,id limit 21 offset page*20) t),'[]'::jsonb));
 end if;
 if p_action='produce' and exists(select 1 from public.production_recipes where id=(p_data->>'recipe_id')::uuid and deduction_mode='sale') then raise exception 'สูตรนี้ตัดวัตถุดิบตอนขายแล้ว ไม่ต้องกดผลิต'; end if;
 if p_action='save_recipe' then
  select * into rec from public.production_recipes where id=(p_data->>'id')::uuid and deduction_mode='sale';
  if found then
   if rec.output_id is distinct from (p_data->>'output_id')::uuid then raise exception 'สูตรอัตโนมัติเปลี่ยนวัตถุดิบผลผลิตไม่ได้'; end if;
   if exists(select 1 from jsonb_array_elements(p_data->'items') x join public.production_recipes r on r.output_id=(x->>'ingredient_id')::uuid where r.deduction_mode='sale') then raise exception 'ยังไม่รองรับสูตรอัตโนมัติซ้อนกัน'; end if;
  end if;
 end if;
 if p_action='waste' then
  if (p_data->>'id')::uuid is null then raise exception 'ไม่พบรหัสรายการ'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_data->>'id',93));
  select * into w from private.prep_waste where id=(p_data->>'id')::uuid for update;
  if found then
   if w.request<>p_data or w.user_id<>staff.id or w.branch_id is distinct from staff.branch_id then raise exception 'รหัสรายการนี้ถูกใช้แล้ว'; end if;
   return to_jsonb(w);
  end if;
  amount:=(p_data->>'qty')::numeric; d:=(p_data->>'business_date')::date;
  if amount is null or not(amount between 0.001 and 1000000) or amount<>round(amount,3) or d is null or d>(now() at time zone 'Asia/Bangkok')::date or d<'2020-01-01' or nullif(btrim(p_data->>'reason'),'') is null or length(p_data->>'reason')>500 then raise exception 'ระบุจำนวน วันที่ และเหตุผลทิ้งให้ถูกต้อง'; end if;
  select * into ing from public.ingredients where id=(p_data->>'ingredient_id')::uuid and is_active;
  if not found or ing.unit is distinct from p_data->>'unit' then raise exception 'วัตถุดิบหรือหน่วยเปลี่ยนแล้ว กรุณาโหลดใหม่'; end if;
  expanded:=private.expand_prep_movements(jsonb_build_array(jsonb_build_object('ingredient_id',ing.id,'qty_delta',-amount,'type','waste','note','ทิ้ง: '||btrim(p_data->>'reason'))));
  perform id from public.ingredients where id in(select (x->>'ingredient_id')::uuid from jsonb_array_elements(expanded) x) order by id for update;
  for m in select * from jsonb_array_elements(expanded) loop
   select snapshots||jsonb_build_array(m||jsonb_build_object('name',i.name,'unit',i.unit,'unit_cost',i.cost_per_unit)) into snapshots from public.ingredients i where i.id=(m->>'ingredient_id')::uuid;
   total:=total+coalesce((select cost_per_unit from public.ingredients where id=(m->>'ingredient_id')::uuid),0)*-(m->>'qty_delta')::numeric;
  end loop;
  insert into private.prep_waste(id,branch_id,user_id,user_name,ingredient_id,ingredient_name,qty,unit,business_date,reason,request,items,total_cost)
   values((p_data->>'id')::uuid,staff.branch_id,staff.id,staff.name,ing.id,ing.name,amount,ing.unit,d,btrim(p_data->>'reason'),p_data,snapshots,round(total,4)) returning * into w;
  for m in select * from jsonb_array_elements(snapshots) loop
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,prep_waste_id,prep_source_qty)
    values((m->>'ingredient_id')::uuid,'waste',(m->>'qty_delta')::numeric,staff.id,m->>'note',w.id,(m->>'prep_source_qty')::numeric);
   update public.ingredients set stock_qty=stock_qty+(m->>'qty_delta')::numeric where id=(m->>'ingredient_id')::uuid;
  end loop;
  return to_jsonb(w);
 end if;
 if p_action='cancel_waste' then
  if staff.role<>'owner' or nullif(btrim(p_data->>'reason'),'') is null then raise exception 'เฉพาะเจ้าของร้าน ระบุเหตุผลยกเลิก'; end if;
  select * into w from private.prep_waste where id=(p_data->>'id')::uuid and branch_id is not distinct from staff.branch_id for update;
  if not found then raise exception 'ไม่พบรายการทิ้ง'; end if;
  if w.status='cancelled' then return to_jsonb(w); end if;
  perform id from public.ingredients where id in(select (x->>'ingredient_id')::uuid from jsonb_array_elements(w.items) x) order by id for update;
  for m in select * from jsonb_array_elements(w.items) loop
   if (select unit from public.ingredients where id=(m->>'ingredient_id')::uuid) is distinct from m->>'unit' then raise exception 'หน่วยเปลี่ยนแล้ว กรุณาตรวจสต็อกก่อน'; end if;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,prep_waste_id) values((m->>'ingredient_id')::uuid,'adjust',-(m->>'qty_delta')::numeric,staff.id,'ยกเลิกทิ้ง: '||(p_data->>'reason'),w.id);
   update public.ingredients set stock_qty=stock_qty-(m->>'qty_delta')::numeric where id=(m->>'ingredient_id')::uuid;
  end loop;
  update private.prep_waste set status='cancelled',cancelled_at=clock_timestamp(),cancel_reason=p_data->>'reason' where id=w.id returning * into w;
  return to_jsonb(w);
 end if;
 result:=private.production_action_before_auto(p_token,p_action,p_data);
 if p_action='save_recipe' then perform private.refresh_auto_prep_costs(); end if;
 return result;
end $$;
revoke all on function private.production_action(text,text,jsonb) from public,anon;
grant execute on function private.production_action(text,text,jsonb) to authenticated;

alter function private.daily_tea_action(text,text,jsonb) rename to daily_tea_action_before_auto;
create function private.daily_tea_action(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_action='load' then return private.daily_tea_action_before_auto(p_token,p_action,p_data)||jsonb_build_object('deduction_mode','sale'); end if;
 if p_action='close' then
  if p_data ? 'brewed_ml' then raise exception 'เปลี่ยนเป็นตัดชาตอนขายแล้ว กรุณารีเฟรช และบันทึกชาที่ทิ้งในหน้าทิ้งสินค้า'; end if;
  return private.daily_tea_action_before_auto(p_token,p_action,p_data);
 end if;
 raise exception 'ตัดผงชาตอนขายแล้ว ตั้งสัดส่วนได้ในสูตรผลิต และบันทึกของเหลือในหน้าทิ้งสินค้า';
end $$;
revoke all on function private.daily_tea_action(text,text,jsonb) from public,anon;
grant execute on function private.daily_tea_action(text,text,jsonb) to authenticated;

update public.production_recipes set deduction_mode='sale' where id in ('393d4d27-bdf9-46b9-9d8f-f1f36c918988','df5e0f3b-3102-4eeb-8a3d-019862486475');
-- Convert remaining manufactured protein back into component-equivalent inventory once.
do $$ declare r public.production_recipes%rowtype; o public.ingredients%rowtype; x record; q numeric;
begin
 select * into r from public.production_recipes where id='393d4d27-bdf9-46b9-9d8f-f1f36c918988';
 perform id from public.ingredients where id=r.output_id or id in(select ingredient_id from public.production_recipe_inputs where recipe_id=r.id) order by id for update;
 select * into o from public.ingredients where id=r.output_id;
 if o.stock_qty<0 then raise exception 'ตรวจสต็อกโปรตีนผสมก่อนเปลี่ยนระบบ'; end if;
 for x in select * from public.production_recipe_inputs where recipe_id=r.id loop
  q:=round(o.stock_qty*x.input_qty*x.factor/r.expected_qty,3);
  if q>0 then
   update public.ingredients set stock_qty=stock_qty+q where id=x.ingredient_id;
   insert into public.stock_movements(ingredient_id,type,qty_delta,note) values(x.ingredient_id,'adjust',q,'เปลี่ยนระบบ: ย้ายโปรตีนผสมคงเหลือเป็นยอดวัตถุดิบเทียบเท่า');
  end if;
 end loop;
 if o.stock_qty<>0 then
  update public.ingredients set stock_qty=0 where id=o.id;
  insert into public.stock_movements(ingredient_id,type,qty_delta,note) values(o.id,'adjust',-o.stock_qty,'เปลี่ยนระบบ: ย้ายโปรตีนผสมคงเหลือเป็นยอดวัตถุดิบเทียบเท่า');
 end if;
end $$;
update public.ingredients set daily_prep=true where id in(select output_id from public.production_recipes where deduction_mode='sale');
-- Remove only the unused, packaging-only duplicate explicitly identified by the owner.
do $$ begin
 if exists(select 1 from public.products where id='95210e65-545e-4898-8884-ff786c31a323') then
  if exists(select 1 from public.order_items where product_id='95210e65-545e-4898-8884-ff786c31a323') or exists(select 1 from public.line_man_order_items where product_id='95210e65-545e-4898-8884-ff786c31a323') or exists(select 1 from public.recipe_items r join public.ingredients i on i.id=r.ingredient_id where r.product_id='95210e65-545e-4898-8884-ff786c31a323' and i.name not in ('แก้ว Pet ทรงต่ำ','หลอดใหญ่')) then raise exception 'รายการซ้ำมีการเปลี่ยนแปลง กรุณาตรวจใหม่ก่อนลบ'; end if;
  delete from public.products where id='95210e65-545e-4898-8884-ff786c31a323';
 end if;
end $$;

create function private.refresh_auto_prep_costs() returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.ingredients i set cost_per_unit=t.cost from (
  select r.output_id,round(sum(x.input_qty*x.factor*a.cost_per_unit)/r.expected_qty,4) cost
  from public.production_recipes r join public.production_recipe_inputs x on x.recipe_id=r.id
  join public.ingredients a on a.id=x.ingredient_id where r.deduction_mode='sale'
  group by r.output_id,r.expected_qty
 ) t where i.id=t.output_id and i.cost_per_unit is distinct from t.cost;
 update public.products p set cost_cached=t.cost from (
  select x.product_id,round(sum(x.qty*i.cost_per_unit),2) cost from public.recipe_items x
  join public.ingredients i on i.id=x.ingredient_id
  where x.product_id in(select z.product_id from public.recipe_items z join public.production_recipes r on r.output_id=z.ingredient_id where r.deduction_mode='sale')
  group by x.product_id
 ) t where p.id=t.product_id and p.cost_cached is distinct from t.cost;
end $$;
revoke all on function private.refresh_auto_prep_costs() from public,anon,authenticated;
-- Existing ingredient writes use both direct authenticated access and trusted RPCs.
create function private.auto_prep_cost_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null and session_user not in ('postgres','supabase_admin') then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 if pg_trigger_depth()<2 then perform private.refresh_auto_prep_costs(); end if;
 return new;
end $$;
revoke all on function private.auto_prep_cost_changed() from public,anon,authenticated;
create trigger auto_prep_cost_changed after update of cost_per_unit on public.ingredients
for each row when(old.cost_per_unit is distinct from new.cost_per_unit) execute function private.auto_prep_cost_changed();
select private.refresh_auto_prep_costs();

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid,p_user_id uuid default null)
returns void language plpgsql set search_path='public', 'pg_temp' as $$
declare v_status text; v_mov record; recipes jsonb; r jsonb; x jsonb; returns jsonb; m jsonb;
begin
 select status into v_status from public.orders where id=p_order_id for update;
 if v_status is null then raise exception 'ไม่พบบิล %',p_order_id; end if;
 if v_status='void' then return; end if;
 recipes:=public.get_auto_prep_recipes();
 for v_mov in select ingredient_id,qty_delta,prep_source_qty from public.stock_movements where ref_order_id=p_order_id and type='sale' loop
  if v_mov.qty_delta=0 then continue; end if;
  returns:=jsonb_build_array(jsonb_build_object('ingredient_id',v_mov.ingredient_id,'qty',-v_mov.qty_delta));
  if v_mov.prep_source_qty is null and v_mov.ingredient_id='b4818050-b5b4-4320-9189-b6330d5cc11e'::uuid then
   select a into r from jsonb_array_elements(recipes) a where a->>'output_id'=v_mov.ingredient_id::text;
   if r is not null then
    returns:='[]';
    for x in select * from jsonb_array_elements(r->'items') loop
     returns:=returns||jsonb_build_array(jsonb_build_object('ingredient_id',x->>'ingredient_id','qty',round(-v_mov.qty_delta*(x->>'input_qty')::numeric*(x->>'factor')::numeric/(r->>'expected_qty')::numeric,3)));
    end loop;
   end if;
  end if;
  for m in select * from jsonb_array_elements(returns) loop
   insert into public.stock_movements(ingredient_id,type,qty_delta,ref_order_id,user_id,note)
    values((m->>'ingredient_id')::uuid,'adjust',(m->>'qty')::numeric,p_order_id,p_user_id,'คืนสต็อกจากการยกเลิกบิล');
   update public.ingredients set stock_qty=stock_qty+(m->>'qty')::numeric where id=(m->>'ingredient_id')::uuid;
  end loop;
 end loop;
 update public.orders set status='void',updated_at=now() where id=p_order_id;
end $$;
-- Legacy implementations are now callable only by the validated wrappers.
revoke all on function private.production_action_before_auto(text,text,jsonb) from public,anon,authenticated;
revoke all on function private.daily_tea_action_before_auto(text,text,jsonb) from public,anon,authenticated;
