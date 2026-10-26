-- Execute after this release's migration inside BEGIN/ROLLBACK.
do $$
declare b uuid; owner_id uuid; milk uuid; first_output uuid; second_output uuid; rid uuid:=gen_random_uuid();
 token text:=gen_random_uuid()::text; payload jsonb; rejected boolean; failure text;
begin
 assert not exists(select 1 from public.production_recipes where deduction_mode<>'sale'),'not all existing recipes use sale deduction';
 assert position('sale' in (select column_default from information_schema.columns where table_schema='public' and table_name='production_recipes' and column_name='deduction_mode'))>0,'database new-recipe default is not sale';
 assert private.prep_unit_key('ML')=private.prep_unit_key('มล.'),'ml aliases differ';
 assert private.prep_unit_key('kg')<>private.prep_unit_key('กรัม'),'kg collapsed into grams';
 assert private.prep_unit_key('ML')<>private.prep_unit_key('กรัม'),'volume collapsed into mass';
 insert into public.branches(name) values('Prep alias QA rollback') returning id into b;
 insert into public.users(name,role,branch_id) values('Prep alias QA owner','owner',b) returning id into owner_id;
 insert into public.pin_sessions(user_id,token_hash) values(owner_id,encode(extensions.digest(token,'sha256'),'hex'));
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA milk ML','ML',1000,0.05) returning id into milk;
 insert into public.ingredient_units(ingredient_id,name,factor_to_base,kind) values(milk,'ML',1,'usage');
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA new default','กรัม',0,0) returning id into first_output;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA legacy cream','กรัม',0,0) returning id into second_output;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 payload:=jsonb_build_object('id',rid,'revision',0,'name','QA default blend','output_id',first_output,'expected_qty',80,'items',jsonb_build_array(jsonb_build_object('ingredient_id',milk,'input_qty',80,'input_unit','มล.')));
 set local role authenticated;
 perform public.production_action(token,'save_recipe',payload);
 reset role;
 assert (select deduction_mode='sale' from public.production_recipes where id=rid),'new recipe without an explicit mode was not sale';
 assert (select stock_qty=1000 from public.ingredients where id=milk),'new recipe charged milk before sale';
 rid:=gen_random_uuid();
 payload:=payload||jsonb_build_object('id',rid,'output_id',second_output,'deduction_mode','produce');
 perform public.production_action(token,'save_recipe',payload);
 update public.ingredients set stock_qty=80 where id=second_output;
 -- Reproduce the real screenshot: legacy มล. stored against current ML.
 update public.production_recipe_inputs set input_unit='มล.',base_unit='มล.' where recipe_id=rid;
 payload:=payload||jsonb_build_object('revision',1,'deduction_mode','sale','mode_stock_qty',80,'items',jsonb_build_array(jsonb_build_object('ingredient_id',milk,'input_qty',80,'input_unit','ML')));
 set local role authenticated;
 perform public.production_action(token,'save_recipe',payload);
 reset role;
 assert (select stock_qty=1080 and cost_per_unit=0.05 from public.ingredients where id=milk),'alias transition changed quantity scale or raw cost';
 assert (select stock_qty=0 from public.ingredients where id=second_output),'legacy prepared stock was not transferred';
 assert (select deduction_mode='sale' from public.production_recipes where id=rid),'alias transition did not save';
 perform public.submit_order(gen_random_uuid(),b,owner_id,'dine_in',0,0,0,0,'alias QA','[]','[]',jsonb_build_array(jsonb_build_object('ingredient_id',second_output,'type','sale','qty_delta',-10)));
 assert (select stock_qty=1070 from public.ingredients where id=milk),'sale after alias transition did not use 10 ml';
 -- Genuine dimension mismatches remain blocked and identify the ingredient.
 payload:=payload||jsonb_build_object('revision',2,'deduction_mode','produce','mode_stock_qty',0,'opening_qty',0);
 perform public.production_action(token,'save_recipe',payload);
 update public.production_recipe_inputs set base_unit='กรัม' where recipe_id=rid;
 rejected:=false;
 begin perform public.production_action(token,'save_recipe',payload||jsonb_build_object('revision',3,'deduction_mode','sale')); exception when others then rejected:=true; failure:=sqlerrm; end;
 assert rejected and position('QA milk ML' in failure)>0,'real unit mismatch bypassed or omitted ingredient name';
 assert (select stock_qty=1070 from public.ingredients where id=milk),'failed validation changed stock';
 update public.production_recipe_inputs set base_unit='ML' where recipe_id=rid;
 update public.ingredients set is_active=false where id=milk;
 rejected:=false;
 begin perform public.production_action(token,'save_recipe',payload||jsonb_build_object('revision',3,'deduction_mode','sale')); exception when others then rejected:=true; failure:=sqlerrm; end;
 assert rejected and position('QA milk ML' in failure)>0,'inactive ingredient was silently accepted';
end $$;
select 'PASS: all existing/default recipes use sale, Thai/ML aliases, the screenshot transition, exact sale quantity, retained raw costs, real dimension mismatch rejection and inactive ingredient diagnostics.' result;
