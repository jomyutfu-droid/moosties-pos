-- Canonical aliases preserve dimensions: ML and มล. are equal; kg and g are not.
create function private.prep_unit_key(unit_name text) returns text language sql immutable security invoker set search_path='' as $$
 select case lower(regexp_replace(btrim(coalesce(unit_name,'')),'[.[:space:]]','','g'))
 when 'ml' then 'volume_ml' when 'มล' then 'volume_ml' when 'มิลลิลิตร' then 'volume_ml'
 when 'g' then 'mass_g' when 'กรัม' then 'mass_g'
 when 'kg' then 'mass_kg' when 'กก' then 'mass_kg' when 'กิโลกรัม' then 'mass_kg'
 else 'label:'||lower(btrim(coalesce(unit_name,''))) end;
$$;
revoke all on function private.prep_unit_key(text) from public,anon,authenticated;

create function private.prep_unit_factor(ingredient uuid,unit_name text) returns numeric language plpgsql security invoker set search_path='' as $$
declare base text; lo numeric; hi numeric;
begin
 select unit into base from public.ingredients where id=ingredient;
 if not found then return null; end if;
 if private.prep_unit_key(base)=private.prep_unit_key(unit_name) then return 1; end if;
 select min(factor_to_base),max(factor_to_base) into lo,hi from public.ingredient_units where ingredient_id=ingredient and private.prep_unit_key(name)=private.prep_unit_key(unit_name);
 if lo is null or lo<>hi then return null; end if;
 return lo;
end $$;
revoke all on function private.prep_unit_factor(uuid,text) from public,anon,authenticated;

-- Evidence-backed label repairs: factor=1 usage and purchase ledger already store grams.
do $$ declare owner_id uuid; before_data jsonb;
begin
 select id into owner_id from public.users where role='owner' and is_active order by created_at limit 1;
 select jsonb_agg(to_jsonb(i)) into before_data from public.ingredients i where i.id in('efe57a82-2f45-4eab-bb05-cca68fec0fd6','96b4b209-f4d6-40e8-ad70-9bb95a2ace75');
 if exists(select 1 from public.ingredients where id='efe57a82-2f45-4eab-bb05-cca68fec0fd6' and unit='กิโลกรัม') then
  if not exists(select 1 from public.ingredient_units where ingredient_id='efe57a82-2f45-4eab-bb05-cca68fec0fd6' and name='กรัม' and factor_to_base=1 and is_default_usage) or not exists(select 1 from public.stock_movements where ingredient_id='efe57a82-2f45-4eab-bb05-cca68fec0fd6' and type='receive' and input_unit='กิโลกรัม' and conversion_factor=1000 and qty_delta=round(input_qty*1000,3)) then raise exception 'ตรวจหน่วยฐานแตงโมก่อนเปลี่ยน'; end if;
  update public.ingredients set unit='กรัม' where id='efe57a82-2f45-4eab-bb05-cca68fec0fd6';
  update public.production_recipe_inputs set base_unit='กรัม' where ingredient_id='efe57a82-2f45-4eab-bb05-cca68fec0fd6' and input_unit='กรัม' and factor=1;
 end if;
 if exists(select 1 from public.ingredients where id='96b4b209-f4d6-40e8-ad70-9bb95a2ace75' and unit='ถุง') then
  if not exists(select 1 from public.ingredient_units where ingredient_id='96b4b209-f4d6-40e8-ad70-9bb95a2ace75' and name='กรัม' and factor_to_base=1 and is_default_usage) or not exists(select 1 from public.recipe_items where ingredient_id='96b4b209-f4d6-40e8-ad70-9bb95a2ace75' and unit_name='กรัม' and unit_factor=1) then raise exception 'ตรวจหน่วยฐานอะโวคาโดก่อนเปลี่ยน'; end if;
  update public.ingredients set unit='กรัม' where id='96b4b209-f4d6-40e8-ad70-9bb95a2ace75';
  update public.production_recipes set output_unit='กรัม',revision=revision+1 where output_id='96b4b209-f4d6-40e8-ad70-9bb95a2ace75';
 end if;
 insert into public.audit_log(user_id,action,entity,detail_json) values(owner_id,'normalize_prep_unit_labels','ingredients',jsonb_build_object('before',before_data,'reason','หน่วยใช้งาน factor=1 และรายการรับ/จ่ายเดิมเก็บเป็นกรัมอยู่แล้ว แก้ชื่อหน่วยโดยไม่คูณจำนวนซ้ำ'));
 -- Normalize safe aliases in stored production units. No quantities/factors are changed.
 update public.production_recipe_inputs x set base_unit=i.unit,input_unit=case when x.factor=1 and private.prep_unit_key(x.input_unit)=private.prep_unit_key(i.unit) then i.unit else x.input_unit end from public.ingredients i where i.id=x.ingredient_id and private.prep_unit_key(x.base_unit)=private.prep_unit_key(i.unit);
end $$;
alter table public.production_recipes alter column deduction_mode set default 'sale';

CREATE OR REPLACE FUNCTION private.production_action_before_auto(p_token text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 staff public.users%rowtype; rec public.production_recipes%rowtype; batch public.production_batches%rowtype;
 ing public.ingredients%rowtype; output public.ingredients%rowtype;
 row_data jsonb; item record; rid uuid; bid uuid; n numeric; factor numeric; qty numeric;
 rounds numeric; actual numeric; total numeric:=0; new_cost numeric; snapshot jsonb:='[]'; result jsonb;
 page integer:=greatest(0,least(coalesce((p_data->>'page')::integer,0),1000000));
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 select * into staff from public.users where id=public.pin_session_user(p_token) and is_active;
 if not found then raise exception 'PIN หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'; end if;
 if p_action='load' then
  return jsonb_build_object('can_manage',staff.role='owner',
   'ingredients',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('units',coalesce((select jsonb_agg(u) from public.ingredient_units u where u.ingredient_id=i.id),'[]'::jsonb)) order by i.name) from public.ingredients i),'[]'::jsonb),
   'recipes',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('items',(select jsonb_agg(x order by x.ingredient_id) from public.production_recipe_inputs x where x.recipe_id=r.id)) order by r.name) from public.production_recipes r where r.branch_id is not distinct from staff.branch_id),'[]'::jsonb),
   'history',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('items',(select jsonb_agg(x order by x.name) from public.production_batch_inputs x where x.batch_id=b.id)) order by b.created_at desc,b.id) from (select * from public.production_batches where branch_id is not distinct from staff.branch_id order by created_at desc,id limit 21 offset page*20) b),'[]'::jsonb));
 end if;
 if p_action='save_recipe' then
  if staff.role<>'owner' then raise exception 'เฉพาะเจ้าของร้านที่จัดการสูตรได้'; end if;
  rid:=(p_data->>'id')::uuid;
  if rid is null then raise exception 'ไม่พบรหัสสูตร'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(rid::text,81));
  select * into rec from public.production_recipes where id=rid for update;
  if found then
   if rec.branch_id is distinct from staff.branch_id then raise exception 'สูตรนี้อยู่อีกสาขา'; end if;
   if rec.revision is distinct from (p_data->>'revision')::integer then raise exception 'สูตรถูกแก้ไขแล้ว กรุณาโหลดใหม่'; end if;
  elsif coalesce((p_data->>'revision')::integer,0)<>0 then raise exception 'ไม่พบสูตรเดิม'; end if;
  select * into output from public.ingredients where id=(p_data->>'output_id')::uuid and is_active;
  if not found then raise exception 'เลือกวัตถุดิบผลผลิตที่ใช้งานอยู่'; end if;
  n:=(p_data->>'expected_qty')::numeric;
  if n is null or not(n between 0.001 and 1000000) or n<>round(n,3) or nullif(btrim(p_data->>'name'),'') is null then raise exception 'ระบุชื่อสูตรและจำนวนผลผลิตให้ถูกต้อง (ทศนิยมไม่เกิน 3 ตำแหน่ง)'; end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 50 then raise exception 'เลือกส่วนผสม 1–50 รายการ'; end if;
  insert into public.production_recipes(id,branch_id,name,output_id,output_unit,expected_qty,instructions,is_active,revision,deduction_mode)
   values(rid,staff.branch_id,btrim(p_data->>'name'),output.id,output.unit,n,coalesce(p_data->>'instructions',''),coalesce((p_data->>'is_active')::boolean,true),coalesce(rec.revision,0)+1,coalesce(p_data->>'deduction_mode',rec.deduction_mode,'sale'))
   on conflict(id) do update set name=excluded.name,output_id=excluded.output_id,output_unit=excluded.output_unit,expected_qty=excluded.expected_qty,instructions=excluded.instructions,is_active=excluded.is_active,revision=excluded.revision,deduction_mode=excluded.deduction_mode;
  delete from public.production_recipe_inputs where recipe_id=rid;
  for row_data in select * from jsonb_array_elements(p_data->'items') loop
   select * into ing from public.ingredients where id=(row_data->>'ingredient_id')::uuid and is_active;
   if not found or ing.id=output.id then raise exception 'ส่วนผสมต้องใช้งานอยู่และเป็นคนละรายการกับผลผลิต'; end if;
   n:=(row_data->>'input_qty')::numeric;
   if n is null or not(n between 0.001 and 1000000) or n<>round(n,3) then raise exception 'จำนวนส่วนผสมไม่ถูกต้อง'; end if;
   factor:=null;
   factor:=private.prep_unit_factor(ing.id,row_data->>'input_unit');
   if factor is null or round(n*factor,3)<=0 or n*factor>1000000 then raise exception 'ตรวจหน่วยและปริมาณส่วนผสม'; end if;
   insert into public.production_recipe_inputs values(rid,ing.id,n,row_data->>'input_unit',factor,ing.unit);
  end loop;
  return jsonb_build_object('id',rid);
 end if;
 if p_action='produce' then
  bid:=(p_data->>'id')::uuid;
  if bid is null then raise exception 'ไม่พบรหัสการผลิต'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(bid::text,82));
  select * into batch from public.production_batches where id=bid;
  if found then
   if batch.branch_id is distinct from staff.branch_id or batch.user_id<>staff.id or batch.recipe_id is distinct from (p_data->>'recipe_id')::uuid or batch.rounds is distinct from (p_data->>'rounds')::numeric or batch.actual_qty is distinct from (p_data->>'actual_qty')::numeric then raise exception 'รหัสการผลิตนี้ถูกใช้แล้ว'; end if;
   return to_jsonb(batch);
  end if;
  select * into rec from public.production_recipes where id=(p_data->>'recipe_id')::uuid and branch_id is not distinct from staff.branch_id and is_active for share;
  if not found then raise exception 'ไม่พบสูตรที่ใช้งาน'; end if;
  if rec.revision is distinct from (p_data->>'revision')::integer then raise exception 'สูตรมีการเปลี่ยนแปลง กรุณาโหลดใหม่'; end if;
  rounds:=(p_data->>'rounds')::numeric; actual:=(p_data->>'actual_qty')::numeric;
  if rounds is null or actual is null or not(rounds between 0.001 and 1000) or not(actual between 0.001 and 1000000) or rounds<>round(rounds,3) or actual<>round(actual,3) then raise exception 'จำนวนรอบและผลผลิตจริงต้องมากกว่า 0 (ทศนิยมไม่เกิน 3 ตำแหน่ง)'; end if;
  -- Stable lock order protects against concurrent production/sales updating the same stock.
  perform id from public.ingredients where id=rec.output_id or id in(select ingredient_id from public.production_recipe_inputs where recipe_id=rec.id) order by id for update;
  select * into output from public.ingredients where id=rec.output_id;
  if not output.is_active or private.prep_unit_key(output.unit)<>private.prep_unit_key(rec.output_unit) or output.stock_qty<0 then raise exception 'ตรวจผลผลิต: ปิดใช้งาน เปลี่ยนหน่วย หรือสต็อกติดลบ'; end if;
  for item in select x.*,i.name,i.stock_qty,i.cost_per_unit,i.unit,i.is_active from public.production_recipe_inputs x join public.ingredients i on i.id=x.ingredient_id where x.recipe_id=rec.id order by x.ingredient_id loop
   qty:=round(item.input_qty*item.factor*rounds,3);
   if not item.is_active or private.prep_unit_key(item.base_unit)<>private.prep_unit_key(item.unit) or qty<=0 or qty>1000000 then raise exception 'ตรวจสูตรส่วนผสม %',item.name; end if;
   if private.prep_unit_factor(item.ingredient_id,item.input_unit) is distinct from item.factor then raise exception 'หน่วยของ % เปลี่ยนแล้ว กรุณาแก้สูตร',item.name; end if;
   if item.stock_qty<qty then raise exception 'วัตถุดิบ % ไม่พอ: ขาด % %',item.name,qty-item.stock_qty,item.unit; end if;
   total:=total+qty*item.cost_per_unit;
   snapshot:=snapshot||jsonb_build_array(jsonb_build_object('ingredient_id',item.ingredient_id,'name',item.name,'qty',qty,'unit',item.unit,'unit_cost',item.cost_per_unit));
  end loop;
  if jsonb_array_length(snapshot)=0 then raise exception 'สูตรยังไม่มีส่วนผสม'; end if;
  new_cost:=round((output.stock_qty*output.cost_per_unit+total)/(output.stock_qty+actual),4);
  insert into public.production_batches(id,branch_id,user_id,user_name,recipe_id,recipe_name,recipe_revision,output_id,output_name,output_unit,rounds,expected_qty,actual_qty,total_cost,batch_unit_cost,previous_output_cost,output_cost_after,output_stock_after,note)
   values(bid,staff.branch_id,staff.id,staff.name,rec.id,rec.name,rec.revision,output.id,output.name,output.unit,rounds,round(rec.expected_qty*rounds,3),actual,round(total,4),total/actual,output.cost_per_unit,new_cost,output.stock_qty+actual,coalesce(p_data->>'note','')) returning * into batch;
  for row_data in select * from jsonb_array_elements(snapshot) loop
   insert into public.production_batch_inputs values(bid,(row_data->>'ingredient_id')::uuid,row_data->>'name',(row_data->>'qty')::numeric,row_data->>'unit',(row_data->>'unit_cost')::numeric);
   update public.ingredients set stock_qty=stock_qty-(row_data->>'qty')::numeric where id=(row_data->>'ingredient_id')::uuid;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,production_batch_id) values((row_data->>'ingredient_id')::uuid,'adjust',-(row_data->>'qty')::numeric,staff.id,'ผลิต: '||rec.name||' · ใช้ส่วนผสม',bid);
  end loop;
  update public.ingredients set stock_qty=stock_qty+actual,cost_per_unit=new_cost where id=output.id;
  insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,production_batch_id) values(output.id,'adjust',actual,staff.id,'ผลิต: '||rec.name||' · รับผลผลิต',bid);
  return to_jsonb(batch);
 end if;
 if p_action='cancel' then
  if staff.role<>'owner' then raise exception 'เฉพาะเจ้าของร้านที่ยกเลิกการผลิตได้'; end if;
  if nullif(btrim(p_data->>'reason'),'') is null then raise exception 'ระบุเหตุผลยกเลิก'; end if;
  select * into batch from public.production_batches where id=(p_data->>'id')::uuid and branch_id is not distinct from staff.branch_id for update;
  if not found then raise exception 'ไม่พบการผลิต'; end if;
  if batch.status='cancelled' then return to_jsonb(batch); end if;
  perform id from public.ingredients where id=batch.output_id or id in(select ingredient_id from public.production_batch_inputs where batch_id=batch.id) order by id for update;
  select * into output from public.ingredients where id=batch.output_id;
  if private.prep_unit_key(output.unit)<>private.prep_unit_key(batch.output_unit) or output.stock_qty<>batch.output_stock_after or output.cost_per_unit<>batch.output_cost_after or exists(select 1 from public.stock_movements where ingredient_id=output.id and production_batch_id is distinct from batch.id and created_at>=batch.created_at) then raise exception 'ผลผลิตมีการใช้หรือปรับสต็อก/ต้นทุนภายหลังแล้ว ยกเลิกอัตโนมัติไม่ได้ กรุณาตรวจสต็อกก่อน'; end if;
  for item in select * from public.production_batch_inputs where batch_id=batch.id order by ingredient_id loop
   select * into ing from public.ingredients where id=item.ingredient_id;
   if private.prep_unit_key(ing.unit)<>private.prep_unit_key(item.unit) or ing.stock_qty<0 then raise exception 'ตรวจสต็อก/หน่วยของ % ก่อนยกเลิก',ing.name; end if;
   update public.ingredients set cost_per_unit=round((stock_qty*cost_per_unit+item.qty*item.unit_cost)/(stock_qty+item.qty),4),stock_qty=stock_qty+item.qty where id=ing.id;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,production_batch_id) values(ing.id,'adjust',item.qty,staff.id,'ยกเลิกผลิต: '||batch.recipe_name||' · '||btrim(p_data->>'reason'),batch.id);
  end loop;
  update public.ingredients set stock_qty=stock_qty-batch.actual_qty,cost_per_unit=batch.previous_output_cost where id=output.id;
  insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note,production_batch_id) values(output.id,'adjust',-batch.actual_qty,staff.id,'ยกเลิกผลิต: '||batch.recipe_name,batch.id);
  update public.production_batches set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=staff.id,cancel_reason=btrim(p_data->>'reason') where id=batch.id returning to_jsonb(production_batches.*) into result;
  return result;
 end if;
 raise exception 'ไม่รองรับรายการนี้';
end;
$function$;

CREATE OR REPLACE FUNCTION private.production_action(p_token text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 mode:=coalesce(p_data->>'deduction_mode',old.deduction_mode,'sale');
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
   (select jsonb_agg(jsonb_build_object('ingredient_id',a->>'ingredient_id','input_qty',(a->>'input_qty')::numeric,'input_unit',private.prep_unit_key(a->>'input_unit')) order by a->>'ingredient_id') from jsonb_array_elements(p_data->'items') a)
   is distinct from
   (select jsonb_agg(jsonb_build_object('ingredient_id',a.ingredient_id,'input_qty',a.input_qty,'input_unit',private.prep_unit_key(a.input_unit)) order by a.ingredient_id::text) from public.production_recipe_inputs a where a.recipe_id=old.id)
  then raise exception 'กรุณาบันทึกส่วนผสมและปริมาณสูตรเดิมก่อน แล้วค่อยเปลี่ยนวิธีตัดแยกอีกครั้ง'; end if;
  perform id from public.ingredients where id=old.output_id or id in(select ingredient_id from public.production_recipe_inputs where recipe_id=old.id) order by id for update;
  select * into output from public.ingredients where id=old.output_id;
  if private.prep_unit_key(output.unit)<>private.prep_unit_key(old.output_unit) then raise exception 'หน่วยผลผลิตเปลี่ยนแล้ว กรุณาตรวจสูตรก่อน'; end if;
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
   if not component.is_active then raise exception 'ส่วนผสม % ปิดใช้งาน กรุณาเลือกส่วนผสมที่ใช้งานอยู่ก่อนย้ายสต๊อก',(select name from public.ingredients where id=component.ingredient_id); end if;
   if private.prep_unit_key(component.unit)<>private.prep_unit_key(component.base_unit) then raise exception 'หน่วยฐานของ % ไม่ตรงกัน: สูตร % / สต๊อก %',(select name from public.ingredients where id=component.ingredient_id),component.base_unit,component.unit; end if;
   if private.prep_unit_factor(component.ingredient_id,component.input_unit) is distinct from component.factor then raise exception 'หน่วยส่วนผสมเปลี่ยนแล้ว กรุณาบันทึกสูตรให้ถูกต้องก่อนเปลี่ยนวิธี'; end if;
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
    -- Representation transfer, not a new purchase: retain the raw ingredients' unit costs.
    update public.ingredients set stock_qty=stock_qty+q where id=ing.id;
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
end $function$;

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
  for x in select a.*,i.unit,i.name,i.is_active from public.production_recipe_inputs a join public.ingredients i on i.id=a.ingredient_id where a.recipe_id=r.id order by a.ingredient_id loop
   if not x.is_active or private.prep_unit_key(x.unit)<>private.prep_unit_key(x.base_unit) or exists(select 1 from public.production_recipes where output_id=x.ingredient_id and deduction_mode='sale') then raise exception 'ตรวจส่วนผสมและหน่วยของสูตร %',r.name; end if;
   if private.prep_unit_factor(x.ingredient_id,x.input_unit) is distinct from x.factor then raise exception 'หน่วยส่วนผสมเปลี่ยนแล้ว กรุณาตรวจสูตร %',r.name; end if;
   q:=round((m->>'qty_delta')::numeric*x.input_qty*x.factor/r.expected_qty,3);
   if q<>0 then result:=result||jsonb_build_array(jsonb_build_object('ingredient_id',x.ingredient_id,'qty_delta',q,'type',m->>'type','note',coalesce(m->>'note','')||' · ผ่านสูตร '||r.name)); end if;
  end loop;
 end loop;
 return result;
end $function$;

-- All current production formulas switch together; no fabricated PIN/session is needed for this authorized migration.
do $$ declare r public.production_recipes%rowtype; output public.ingredients%rowtype; part record; actor uuid; q numeric; items jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(261026,1);
 select id into actor from public.users where role='owner' and is_active order by created_at limit 1;
 perform id from public.ingredients order by id for update;
 for r in select * from public.production_recipes where deduction_mode='produce' order by id for update loop
  select * into output from public.ingredients where id=r.output_id;
  if output.stock_qty<0 or private.prep_unit_key(output.unit)<>private.prep_unit_key(r.output_unit) then raise exception 'ตรวจยอดและหน่วยผลผลิต % ก่อนเปลี่ยนทั้งหมด',r.name; end if;
  if exists(select 1 from public.production_recipes where output_id=r.output_id and id<>r.id) or exists(select 1 from public.production_recipe_inputs x join public.production_recipes parent on parent.id=x.recipe_id where x.ingredient_id=r.output_id and parent.id<>r.id) then raise exception 'ตรวจสูตรซ้อนของ % ก่อนเปลี่ยนทั้งหมด',r.name; end if;
  items:='[]';
  for part in select x.*,i.name,i.unit,i.is_active,i.cost_per_unit from public.production_recipe_inputs x join public.ingredients i on i.id=x.ingredient_id where x.recipe_id=r.id order by x.ingredient_id loop
   if not part.is_active or private.prep_unit_key(part.unit)<>private.prep_unit_key(part.base_unit) or private.prep_unit_factor(part.ingredient_id,part.input_unit) is distinct from part.factor then raise exception 'ตรวจหน่วยและสถานะ % ในสูตร %',part.name,r.name; end if;
   q:=round(output.stock_qty*part.input_qty*part.factor/r.expected_qty,3);
   if q<>0 then
    update public.ingredients set stock_qty=stock_qty+q where id=part.ingredient_id;
    insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(part.ingredient_id,'adjust',q,actor,'เปลี่ยนค่าเริ่มต้นเป็นตัดเมื่อขาย: '||r.name||' · ย้ายยอดผลผลิตเป็นยอดต้นทาง');
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('ingredient_id',part.ingredient_id,'qty_delta',q,'unit',part.unit,'unit_cost',part.cost_per_unit));
  end loop;
  if jsonb_array_length(items)=0 then raise exception 'สูตร % ไม่มีส่วนผสม',r.name; end if;
  if output.stock_qty<>0 then
   update public.ingredients set stock_qty=0 where id=output.id;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(output.id,'adjust',-output.stock_qty,actor,'เปลี่ยนค่าเริ่มต้นเป็นตัดเมื่อขาย: '||r.name||' · ปิดยอดผลผลิตเดิม');
  end if;
  update public.ingredients set daily_prep=true where id=output.id;
  update public.production_recipes set deduction_mode='sale',revision=revision+1 where id=r.id;
  insert into public.audit_log(user_id,action,entity,entity_id,detail_json) values(actor,'change_deduction_mode','production_recipes',r.id,jsonb_build_object('from','produce','to','sale','previous_stock',output.stock_qty,'previous_unit_cost',output.cost_per_unit,'components',items,'bulk_default_sale',true,'note','ย้ายยอดจำนวน ไม่เปลี่ยนต้นทุนต่อหน่วยต้นทาง และไม่ตัดซ้ำ'));
 end loop;
 perform private.refresh_auto_prep_costs();
end $$;
