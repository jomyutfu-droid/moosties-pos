-- PIN-authorized production: ingredients remain the existing shared stock ledger.
create table public.production_recipes (
 id uuid primary key, branch_id uuid references public.branches(id),
 name text not null, output_id uuid not null references public.ingredients(id),
 output_unit text not null, expected_qty numeric(14,3) not null check(expected_qty>0),
 instructions text not null default '', is_active boolean not null default true,
 revision integer not null default 1, created_at timestamptz not null default now()
);
create table public.production_recipe_inputs (
 recipe_id uuid not null references public.production_recipes(id) on delete cascade,
 ingredient_id uuid not null references public.ingredients(id),
 input_qty numeric(14,3) not null check(input_qty>0), input_unit text not null,
 factor numeric(16,6) not null check(factor>0), base_unit text not null,
 primary key(recipe_id,ingredient_id)
);
create table public.production_batches (
 id uuid primary key, branch_id uuid references public.branches(id),
 user_id uuid not null references public.users(id), user_name text not null,
 recipe_id uuid not null references public.production_recipes(id), recipe_name text not null,
 recipe_revision integer not null, output_id uuid not null references public.ingredients(id),
 output_name text not null, output_unit text not null,
 rounds numeric(14,3) not null, expected_qty numeric(14,3) not null, actual_qty numeric(14,3) not null,
 total_cost numeric(18,4) not null, batch_unit_cost numeric(18,6) not null,
 previous_output_cost numeric(18,4) not null, output_cost_after numeric(18,4) not null,
 output_stock_after numeric(14,3) not null,
 note text not null default '', status text not null default 'completed' check(status in ('completed','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 cancelled_at timestamptz, cancelled_by uuid references public.users(id), cancel_reason text
);
create table public.production_batch_inputs (
 batch_id uuid not null references public.production_batches(id),
 ingredient_id uuid not null references public.ingredients(id), name text not null,
 qty numeric(14,3) not null, unit text not null, unit_cost numeric(18,4) not null,
 primary key(batch_id,ingredient_id)
);
alter table public.stock_movements add column production_batch_id uuid references public.production_batches(id);
create index production_movements_batch_idx on public.stock_movements(production_batch_id) where production_batch_id is not null;
create index production_recipes_branch_idx on public.production_recipes(branch_id);
create index production_batches_branch_date_idx on public.production_batches(branch_id,created_at desc,id);
create index production_recipe_input_ingredient_idx on public.production_recipe_inputs(ingredient_id);
create index production_batch_input_ingredient_idx on public.production_batch_inputs(ingredient_id);
alter table public.production_recipes enable row level security;
alter table public.production_recipe_inputs enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_inputs enable row level security;
revoke all on public.production_recipes,public.production_recipe_inputs,public.production_batches,public.production_batch_inputs from public,anon,authenticated;

-- Privileged access is limited to this private function; every action verifies auth + live PIN.
create function private.production_action(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  insert into public.production_recipes(id,branch_id,name,output_id,output_unit,expected_qty,instructions,is_active,revision)
   values(rid,staff.branch_id,btrim(p_data->>'name'),output.id,output.unit,n,coalesce(p_data->>'instructions',''),coalesce((p_data->>'is_active')::boolean,true),coalesce(rec.revision,0)+1)
   on conflict(id) do update set name=excluded.name,output_id=excluded.output_id,output_unit=excluded.output_unit,expected_qty=excluded.expected_qty,instructions=excluded.instructions,is_active=excluded.is_active,revision=excluded.revision;
  delete from public.production_recipe_inputs where recipe_id=rid;
  for row_data in select * from jsonb_array_elements(p_data->'items') loop
   select * into ing from public.ingredients where id=(row_data->>'ingredient_id')::uuid and is_active;
   if not found or ing.id=output.id then raise exception 'ส่วนผสมต้องใช้งานอยู่และเป็นคนละรายการกับผลผลิต'; end if;
   n:=(row_data->>'input_qty')::numeric;
   if n is null or not(n between 0.001 and 1000000) or n<>round(n,3) then raise exception 'จำนวนส่วนผสมไม่ถูกต้อง'; end if;
   factor:=null;
   if row_data->>'input_unit'=ing.unit then factor:=1;
   else select factor_to_base into factor from public.ingredient_units where ingredient_id=ing.id and name=row_data->>'input_unit'; end if;
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
  if not output.is_active or output.unit<>rec.output_unit or output.stock_qty<0 then raise exception 'ตรวจผลผลิต: ปิดใช้งาน เปลี่ยนหน่วย หรือสต็อกติดลบ'; end if;
  for item in select x.*,i.name,i.stock_qty,i.cost_per_unit,i.unit,i.is_active from public.production_recipe_inputs x join public.ingredients i on i.id=x.ingredient_id where x.recipe_id=rec.id order by x.ingredient_id loop
   qty:=round(item.input_qty*item.factor*rounds,3);
   if not item.is_active or item.base_unit<>item.unit or qty<=0 or qty>1000000 then raise exception 'ตรวจสูตรส่วนผสม %',item.name; end if;
   if item.input_unit<>item.unit and not exists(select 1 from public.ingredient_units where ingredient_id=item.ingredient_id and name=item.input_unit and factor_to_base=item.factor) then raise exception 'หน่วยของ % เปลี่ยนแล้ว กรุณาแก้สูตร',item.name; end if;
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
  if output.unit<>batch.output_unit or output.stock_qty<>batch.output_stock_after or output.cost_per_unit<>batch.output_cost_after or exists(select 1 from public.stock_movements where ingredient_id=output.id and production_batch_id is distinct from batch.id and created_at>=batch.created_at) then raise exception 'ผลผลิตมีการใช้หรือปรับสต็อก/ต้นทุนภายหลังแล้ว ยกเลิกอัตโนมัติไม่ได้ กรุณาตรวจสต็อกก่อน'; end if;
  for item in select * from public.production_batch_inputs where batch_id=batch.id order by ingredient_id loop
   select * into ing from public.ingredients where id=item.ingredient_id;
   if ing.unit<>item.unit or ing.stock_qty<0 then raise exception 'ตรวจสต็อก/หน่วยของ % ก่อนยกเลิก',ing.name; end if;
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
$$;
revoke all on function private.production_action(text,text,jsonb) from public,anon;
grant execute on function private.production_action(text,text,jsonb) to authenticated;
create function public.production_action(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.production_action(p_token,p_action,p_data); $$;
revoke all on function public.production_action(text,text,jsonb) from public,anon;
grant execute on function public.production_action(text,text,jsonb) to authenticated;
