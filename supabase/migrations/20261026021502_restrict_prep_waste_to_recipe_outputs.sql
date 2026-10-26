CREATE OR REPLACE FUNCTION private.production_action_before_mode(p_token text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not exists(select 1 from public.production_recipes r where r.output_id=ing.id and r.is_active and r.branch_id is not distinct from staff.branch_id) then raise exception 'เลือกทิ้งได้เฉพาะผลผลิตที่มีสูตรผลิตเปิดใช้งานในสาขานี้'; end if;
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
end $function$;

