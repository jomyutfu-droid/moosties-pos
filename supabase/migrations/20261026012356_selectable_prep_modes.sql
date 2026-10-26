-- Owner-selectable prep deductions. Mode transitions transfer existing stock atomically.
alter table public.stock_movements add column prep_return_inputs jsonb;
-- Shared lock keeps a recipe switch from racing a sale or a production transaction.

CREATE OR REPLACE FUNCTION private.expand_prep_movements(moves jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m jsonb; r public.production_recipes%rowtype; x record; result jsonb:='[]'; q numeric;
begin
 perform pg_catalog.pg_advisory_xact_lock(261026,1);
 for m in select * from jsonb_array_elements(moves) loop
  select * into r from public.production_recipes where output_id=(m->>'ingredient_id')::uuid order by case when deduction_mode='sale' then 0 else 1 end,id limit 1;
  if not found then result:=result||jsonb_build_array(m); continue; end if;
  if r.deduction_mode='produce' then
   -- Freeze how to restore a prepared sale if the owner later switches it to automatic.
   result:=result||jsonb_build_array(m||jsonb_build_object('prep_return_inputs',(
    select jsonb_agg(jsonb_build_object('ingredient_id',a.ingredient_id,'qty',round(-(m->>'qty_delta')::numeric*a.input_qty*a.factor/r.expected_qty,3)))
    from public.production_recipe_inputs a where a.recipe_id=r.id)));
   continue;
  end if;
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
end $function$;

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
      ingredient_id, type, qty_delta, ref_order_id, user_id, note, prep_source_qty, prep_return_inputs
    ) values (
      (v_movement->>'ingredient_id')::uuid,
      v_movement->>'type',
      (v_movement->>'qty_delta')::numeric,
      v_order_id,
      p_user_id,
      v_movement->>'note',
      (v_movement->>'prep_source_qty')::numeric, v_movement->'prep_return_inputs'
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
    insert into public.stock_movements(ingredient_id,type,qty_delta,ref_order_id,user_id,note,line_man_order_id,prep_source_qty,prep_return_inputs)
      values((v_move->>'ingredient_id')::uuid,'sale',(v_move->>'qty_delta')::numeric,null,v_user,
        'LINE MAN '||v_ref||coalesce(': '||nullif(v_move->>'note',''),''),v_order_id,(v_move->>'prep_source_qty')::numeric,v_move->'prep_return_inputs');
    update public.ingredients set stock_qty=stock_qty+(v_move->>'qty_delta')::numeric where id=(v_move->>'ingredient_id')::uuid;
  end loop;
  return v_receipt;
end;
$function$;

alter function private.production_action(text,text,jsonb) rename to production_action_before_mode;
create function private.production_action(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.users%rowtype; old public.production_recipes%rowtype; saved public.production_recipes%rowtype;
 output public.ingredients%rowtype; ing public.ingredients%rowtype; component record; result jsonb; mode text;
 changing boolean; opening numeric; amount numeric; q numeric; total numeric:=0; old_total numeric:=0; credit_cost numeric; changes jsonb:='[]'; w private.prep_waste%rowtype; m jsonb; c jsonb; returns jsonb;
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 select * into staff from public.users where id=public.pin_session_user(p_token) and is_active;
 if not found then raise exception 'PIN หมดอายุ'; end if;
 if p_action<>'load' then perform pg_catalog.pg_advisory_xact_lock(261026,1); end if;
 if p_action='cancel_waste' then
  select * into w from private.prep_waste where id=(p_data->>'id')::uuid and branch_id is not distinct from staff.branch_id for update;
  result:=private.production_action_before_mode(p_token,p_action,p_data);
  if w.id is not null and w.status='completed' then
   for m in select * from jsonb_array_elements(w.items) loop
    if (m->>'qty_delta')::numeric<0 and exists(select 1 from public.production_recipes where output_id=(m->>'ingredient_id')::uuid and deduction_mode='sale') then
     returns:=m->'prep_return_inputs';
     if returns is null or jsonb_typeof(returns)<>'array' then
      select jsonb_agg(jsonb_build_object('ingredient_id',x->>'ingredient_id','qty',-(x->>'qty_delta')::numeric)) into returns from jsonb_array_elements(private.expand_prep_movements(jsonb_build_array(m||jsonb_build_object('type','waste')))) x where (x->>'qty_delta')::numeric<>0;
     end if;
     update public.ingredients set stock_qty=stock_qty+(m->>'qty_delta')::numeric where id=(m->>'ingredient_id')::uuid;
     insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,prep_waste_id) values((m->>'ingredient_id')::uuid,'adjust',(m->>'qty_delta')::numeric,staff.id,'ยกเลิกทิ้งหลังเปลี่ยนวิธี · ย้ายคืนเป็นต้นทาง',w.id);
     for c in select * from jsonb_array_elements(returns) loop
      update public.ingredients set stock_qty=stock_qty+(c->>'qty')::numeric where id=(c->>'ingredient_id')::uuid;
      insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,prep_waste_id) values((c->>'ingredient_id')::uuid,'adjust',(c->>'qty')::numeric,staff.id,'ยกเลิกทิ้งหลังเปลี่ยนวิธี · คืนวัตถุดิบต้นทาง',w.id);
     end loop;
    end if;
   end loop;
  end if;
  return result;
 end if;
 if p_action<>'save_recipe' then return private.production_action_before_mode(p_token,p_action,p_data); end if;
 if staff.role<>'owner' then raise exception 'เฉพาะเจ้าของร้านที่เลือกวิธีตัดวัตถุดิบได้'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_data->>'id',81));
 select * into old from public.production_recipes where id=(p_data->>'id')::uuid for update;
 if found and old.branch_id is distinct from staff.branch_id then raise exception 'สูตรนี้อยู่อีกสาขา'; end if;
 if old.id is not null and old.revision is distinct from (p_data->>'revision')::integer then raise exception 'สูตรถูกแก้ไขแล้ว กรุณาโหลดใหม่'; end if;
 mode:=coalesce(p_data->>'deduction_mode',old.deduction_mode,'produce');
 if mode not in ('produce','sale') then raise exception 'เลือกวิธีตัดเมื่อผลิตหรือตัดเมื่อขาย'; end if;
 changing:=old.id is not null and old.deduction_mode<>mode;
 if changing and old.output_id is distinct from (p_data->>'output_id')::uuid then raise exception 'เปลี่ยนวิธีตัดและเปลี่ยนผลผลิตพร้อมกันไม่ได้ กรุณาบันทึกแยกครั้ง'; end if;
 if exists(select 1 from public.production_recipes where output_id=(p_data->>'output_id')::uuid and deduction_mode='sale' and id<>(p_data->>'id')::uuid) then raise exception 'ผลผลิตนี้มีสูตรตัดเมื่อขายอยู่แล้ว กรุณาเลือกผลผลิตอื่น'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'items') x join public.production_recipes r on r.output_id=(x->>'ingredient_id')::uuid where r.deduction_mode='sale' and r.id<>(p_data->>'id')::uuid) then raise exception 'ยังไม่รองรับการใช้สูตรตัดเมื่อขายเป็นส่วนผสมสูตรผลิตอื่น'; end if;
 if mode='sale' and old.id is null and exists(select 1 from public.ingredients where id=(p_data->>'output_id')::uuid and stock_qty<>0) then raise exception 'สูตรตัดเมื่อขายใหม่ต้องเลือกผลผลิตที่สต๊อกเป็น 0 หากมีของคงเหลือให้บันทึกสูตรตัดเมื่อผลิตก่อน แล้วเปลี่ยนวิธี'; end if;
 if mode='sale' then
  if exists(select 1 from public.production_recipes where output_id=(p_data->>'output_id')::uuid and id<>(p_data->>'id')::uuid) then raise exception 'ผลผลิตนี้มีหลายสูตร กรุณาใช้ผลผลิตแยกสำหรับสูตรตัดเมื่อขาย'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'items') x join public.production_recipes r on r.output_id=(x->>'ingredient_id')::uuid where r.deduction_mode='sale' and r.id<>(p_data->>'id')::uuid) then raise exception 'ยังไม่รองรับสูตรตัดเมื่อขายซ้อนกัน ให้ส่วนผสมสูตรย่อยตัดเมื่อผลิตก่อน'; end if;
  if exists(select 1 from public.production_recipe_inputs a join public.production_recipes r on r.id=a.recipe_id where a.ingredient_id=(p_data->>'output_id')::uuid and r.id<>(p_data->>'id')::uuid and r.is_active) then raise exception 'ผลผลิตนี้เป็นส่วนผสมของสูตรผลิตอื่น ต้องคงตัดเมื่อผลิตเพื่อให้สูตรอื่นเบิกใช้ได้'; end if;
 end if;
 if changing then
  if (p_data->>'expected_qty')::numeric is distinct from old.expected_qty or
   (select jsonb_agg(jsonb_build_object('ingredient_id',a->>'ingredient_id','input_qty',(a->>'input_qty')::numeric,'input_unit',a->>'input_unit') order by a->>'ingredient_id') from jsonb_array_elements(p_data->'items') a)
   is distinct from
   (select jsonb_agg(jsonb_build_object('ingredient_id',a.ingredient_id,'input_qty',a.input_qty,'input_unit',a.input_unit) order by a.ingredient_id::text) from public.production_recipe_inputs a where a.recipe_id=old.id)
  then raise exception 'กรุณาบันทึกส่วนผสมและปริมาณสูตรเดิมก่อน แล้วค่อยเปลี่ยนวิธีตัดแยกอีกครั้ง'; end if;
  perform id from public.ingredients where id=old.output_id or id in(select ingredient_id from public.production_recipe_inputs where recipe_id=old.id) order by id for update;
  select * into output from public.ingredients where id=old.output_id;
  if output.unit<>old.output_unit then raise exception 'หน่วยผลผลิตเปลี่ยนแล้ว กรุณาตรวจสูตรก่อน'; end if;
  if (p_data->>'mode_stock_qty')::numeric is distinct from output.stock_qty then raise exception 'สต๊อกเปลี่ยนแล้ว กรุณาปิดหน้าต่างแล้วเปิดสูตรใหม่เพื่อตรวจยอด'; end if;
  if mode='sale' then
   if output.stock_qty<0 then raise exception 'สต๊อกผลผลิตติดลบ กรุณาตรวจนับก่อนเปลี่ยนเป็นตัดเมื่อขาย'; end if;
   amount:=output.stock_qty;
  else
   if output.stock_qty>0 then raise exception 'สูตรอัตโนมัติมียอดผลผลิตค้าง กรุณาตรวจสต๊อกก่อนเปลี่ยน'; end if;
   opening:=(p_data->>'opening_qty')::numeric;
   if opening is null or not(opening between 0 and 1000000) or opening<>round(opening,3) then raise exception 'ระบุจำนวนที่ผสมไว้คงเหลือจริง ใส่ 0 หากไม่มี'; end if;
   amount:=opening;
  end if;
  for component in select a.*,i.unit,i.is_active,i.cost_per_unit from public.production_recipe_inputs a join public.ingredients i on i.id=a.ingredient_id where a.recipe_id=old.id loop
   if component.unit<>component.base_unit or not component.is_active then raise exception 'ตรวจหน่วยและสถานะส่วนผสมก่อนย้ายสต๊อก'; end if;
   if component.input_unit<>component.unit and not exists(select 1 from public.ingredient_units where ingredient_id=component.ingredient_id and name=component.input_unit and factor_to_base=component.factor) then raise exception 'หน่วยส่วนผสมเปลี่ยนแล้ว กรุณาบันทึกสูตรให้ถูกต้องก่อนเปลี่ยนวิธี'; end if;
   old_total:=old_total+component.input_qty*component.factor*component.cost_per_unit;
  end loop;
  for component in select * from public.production_recipe_inputs where recipe_id=old.id order by ingredient_id loop
   q:=round(amount*component.input_qty*component.factor/old.expected_qty,3);
   if q=0 then continue; end if;
   select * into ing from public.ingredients where id=component.ingredient_id;
   if mode='produce' then
    if ing.stock_qty<q then raise exception 'วัตถุดิบ % ไม่พอสำหรับจำนวนที่ผสมไว้ กรุณาตรวจยอด',ing.name; end if;
    total:=total+q*ing.cost_per_unit;
    q:=-q;
    update public.ingredients set stock_qty=stock_qty+q where id=ing.id;
   else
    -- Preserve the value of existing manufactured stock rather than charging it again.
    credit_cost:=case when old_total>0 then amount*output.cost_per_unit*(component.input_qty*component.factor*ing.cost_per_unit/old_total)/q else output.cost_per_unit*old.expected_qty/(select sum(a.input_qty*a.factor) from public.production_recipe_inputs a where a.recipe_id=old.id) end;
    update public.ingredients set stock_qty=stock_qty+q,cost_per_unit=case when stock_qty>0 then round((stock_qty*cost_per_unit+q*credit_cost)/(stock_qty+q),4) else round(credit_cost,4) end where id=ing.id;
   end if;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(ing.id,'adjust',q,staff.id,'เปลี่ยนวิธีตัด: '||old.name||case when mode='sale' then ' · ย้ายเป็นยอดต้นทาง' else ' · ตั้งยอดที่ผสมไว้' end);
   changes:=changes||jsonb_build_array(jsonb_build_object('ingredient_id',ing.id,'qty_delta',q,'unit',ing.unit));
  end loop;
  q:=case when mode='sale' then -output.stock_qty else opening-output.stock_qty end;
  if q<>0 then
   update public.ingredients set stock_qty=stock_qty+q where id=output.id;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(output.id,'adjust',q,staff.id,'เปลี่ยนวิธีตัด: '||old.name||' · ปิดยอดวิธีเดิมและตั้งยอดวิธีใหม่');
  end if;
  if mode='produce' and opening>0 then update public.ingredients set cost_per_unit=round(total/opening,4) where id=output.id; end if;
 end if;
 -- The earlier wrapper validates all existing fields/units and enforces the revision.
 result:=private.production_action_before_mode(p_token,'save_recipe',p_data);
 update public.production_recipes set deduction_mode=mode where id=(p_data->>'id')::uuid returning * into saved;
 update public.ingredients set daily_prep=(mode='sale') where id=saved.output_id;
 perform private.refresh_auto_prep_costs();
 if changing then
  insert into public.audit_log(user_id,action,entity,entity_id,detail_json) values(staff.id,'change_deduction_mode','production_recipes',saved.id,jsonb_build_object('from',old.deduction_mode,'to',mode,'previous_stock',output.stock_qty,'opening_qty',opening,'components',changes));
 end if;
 return result;
end $$;
revoke all on function private.production_action_before_mode(text,text,jsonb) from public,anon,authenticated;
revoke all on function private.production_action(text,text,jsonb) from public,anon;
grant execute on function private.production_action(text,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_status text; v_mov record; recipes jsonb; r jsonb; x jsonb; returns jsonb; m jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(261026,1);
 select status into v_status from public.orders where id=p_order_id for update;
 if v_status is null then raise exception 'ไม่พบบิล %',p_order_id; end if;
 if v_status='void' then return; end if;
 recipes:=public.get_auto_prep_recipes();
 for v_mov in select ingredient_id,qty_delta,prep_source_qty,prep_return_inputs from public.stock_movements where ref_order_id=p_order_id and type='sale' loop
  if v_mov.qty_delta=0 then continue; end if;
  returns:=jsonb_build_array(jsonb_build_object('ingredient_id',v_mov.ingredient_id,'qty',-v_mov.qty_delta));
  if v_mov.prep_source_qty is null then
   select a into r from jsonb_array_elements(recipes) a where a->>'output_id'=v_mov.ingredient_id::text;
   if r is not null then
    returns:='[]';
    if v_mov.prep_return_inputs is not null and jsonb_typeof(v_mov.prep_return_inputs)='array' then
     returns:=v_mov.prep_return_inputs;
    else
    for x in select * from jsonb_array_elements(r->'items') loop
     returns:=returns||jsonb_build_array(jsonb_build_object('ingredient_id',x->>'ingredient_id','qty',round(-v_mov.qty_delta*(x->>'input_qty')::numeric*(x->>'factor')::numeric/(r->>'expected_qty')::numeric,3)));
    end loop;
    end if;
   end if;
  end if;
  for m in select * from jsonb_array_elements(returns) loop
   insert into public.stock_movements(ingredient_id,type,qty_delta,ref_order_id,user_id,note)
    values((m->>'ingredient_id')::uuid,'adjust',(m->>'qty')::numeric,p_order_id,p_user_id,'คืนสต็อกจากการยกเลิกบิล');
   update public.ingredients set stock_qty=stock_qty+(m->>'qty')::numeric where id=(m->>'ingredient_id')::uuid;
  end loop;
 end loop;
 update public.orders set status='void',updated_at=now() where id=p_order_id;
end $function$;

create or replace function private.daily_tea_action(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare mode text;
begin
 if p_action='load' then
  select r.deduction_mode into mode from public.production_recipes r join public.daily_tea_config c on c.brewed_id=r.output_id where c.id order by r.id limit 1;
  return private.daily_tea_action_before_auto(p_token,p_action,p_data)||jsonb_build_object('deduction_mode',coalesce(mode,'produce'));
 end if;
 if p_action='close' then
  if p_data ? 'brewed_ml' then raise exception 'ใช้วิธีตัดตามสูตรแล้ว กรุณารีเฟรชและบันทึกของเหลือในหน้าทิ้งสินค้า'; end if;
  return private.daily_tea_action_before_auto(p_token,p_action,p_data);
 end if;
 raise exception 'เลือกวิธีตัดและสัดส่วนได้ในสูตรผลิต และบันทึกของเหลือในหน้าทิ้งสินค้า';
end $$;
