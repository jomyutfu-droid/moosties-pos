-- Transaction-only fixtures; leaves no waste records or inventory changes.
do $$
declare b uuid; other_b uuid; staff_id uuid; raw_id uuid; auto_id uuid; manual_id uuid; inactive_id uuid; other_id uuid;
 token text:=gen_random_uuid()::text; recipe_id uuid:=gen_random_uuid(); payload jsonb; rejected boolean; first_result jsonb;
begin
 insert into public.branches(name) values('Waste choices QA') returning id into b;
 insert into public.branches(name) values('Waste choices other') returning id into other_b;
 insert into public.users(name,role,branch_id) values('Waste QA staff','staff',b) returning id into staff_id;
 insert into public.pin_sessions(user_id,token_hash) values(staff_id,encode(extensions.digest(token,'sha256'),'hex'));
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA raw only','g',1000,1) returning id into raw_id;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA automatic output','g',0,1) returning id into auto_id;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA manual output','g',100,1) returning id into manual_id;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA inactive recipe output','g',100,1) returning id into inactive_id;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA other branch output','g',100,1) returning id into other_id;
 insert into public.production_recipes(id,branch_id,name,output_id,output_unit,expected_qty,deduction_mode) values(recipe_id,b,'QA automatic',auto_id,'g',100,'sale');
 insert into public.production_recipe_inputs values(recipe_id,raw_id,100,'g',1,'g');
 insert into public.production_recipes(id,branch_id,name,output_id,output_unit,expected_qty,deduction_mode,is_active) values
  (gen_random_uuid(),b,'QA manual',manual_id,'g',100,'produce',true),
  (gen_random_uuid(),b,'QA inactive',inactive_id,'g',100,'produce',false),
  (gen_random_uuid(),other_b,'QA other branch',other_id,'g',100,'produce',true);
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 payload:=jsonb_build_object('id',gen_random_uuid(),'ingredient_id',raw_id,'unit','g','qty',10,'business_date',(now() at time zone 'Asia/Bangkok')::date,'reason','QA');
 set local role authenticated;
 rejected:=false;
 begin perform public.production_action(token,'waste',payload); exception when others then rejected:=true; end;
 assert rejected,'raw ingredient without an output recipe accepted';
 rejected:=false;
 begin perform public.production_action(token,'waste',payload||jsonb_build_object('id',gen_random_uuid(),'ingredient_id',inactive_id)); exception when others then rejected:=true; end;
 assert rejected,'inactive recipe output accepted';
 rejected:=false;
 begin perform public.production_action(token,'waste',payload||jsonb_build_object('id',gen_random_uuid(),'ingredient_id',other_id)); exception when others then rejected:=true; end;
 assert rejected,'other branch output accepted';
 payload:=payload||jsonb_build_object('id',gen_random_uuid(),'ingredient_id',auto_id);
 first_result:=public.production_action(token,'waste',payload);
 assert first_result=public.production_action(token,'waste',payload),'valid automatic waste retry changed result';
 perform public.production_action(token,'waste',payload||jsonb_build_object('id',gen_random_uuid(),'ingredient_id',manual_id));
 reset role;
 assert (select stock_qty=990 from public.ingredients where id=raw_id),'invalid attempts or retry changed raw stock';
 assert (select stock_qty=90 from public.ingredients where id=manual_id),'manual output not deducted';
 assert (select stock_qty=100 from public.ingredients where id=inactive_id),'rejected inactive output changed stock';
 update public.production_recipes set is_active=false where id=recipe_id;
 set local role authenticated;
 assert first_result=public.production_action(token,'waste',payload),'retry lost its original result after recipe deactivation';
 reset role;
end $$;
select 'PASS: waste limited to active recipe outputs in the staff branch; both deduction modes work, raw materials blocked, retries remain idempotent.' result;
