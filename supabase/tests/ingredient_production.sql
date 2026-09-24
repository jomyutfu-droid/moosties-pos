-- Transaction-scoped fixtures only. This test leaves no users, orders or stock changes.
begin;
do $$
declare
 branch uuid; owner_id uuid; staff_id uuid; other_id uuid;
 a uuid; b uuid; c uuid; d uuid; recipe_id uuid:=gen_random_uuid(); batch_id uuid:=gen_random_uuid();
 owner_token text:=gen_random_uuid()::text; staff_token text:=gen_random_uuid()::text; other_token text:=gen_random_uuid()::text;
 recipe jsonb; payload jsonb; first_result jsonb; second_result jsonb; listing jsonb;
 rejected boolean; sales_count bigint;
begin
 insert into public.branches(name) values('Production QA rollback') returning id into branch;
 insert into public.users(name,role,branch_id) values('Production QA owner','owner',branch) returning id into owner_id;
 insert into public.users(name,role,branch_id) values('Production QA staff','staff',branch) returning id into staff_id;
 insert into public.users(name,role,branch_id) values('Production QA other','owner',null) returning id into other_id;
 -- users may get a default branch from existing triggers: create an explicit other branch.
 update public.users set branch_id=null where id=other_id;
 insert into public.pin_sessions(user_id,token_hash) values
  (owner_id,encode(extensions.digest(owner_token,'sha256'),'hex')),
  (staff_id,encode(extensions.digest(staff_token,'sha256'),'hex')),
  (other_id,encode(extensions.digest(other_token,'sha256'),'hex'));
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA milk','g',1000,0.2) returning id into a;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA cheese A','g',1000,0.3) returning id into b;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA cheese B','g',1000,0.4) returning id into c;
 insert into public.ingredients(name,unit,stock_qty,cost_per_unit) values('QA mixed cheese','g',100,1) returning id into d;
 insert into public.ingredient_units(ingredient_id,name,factor_to_base,kind) values(b,'pack',100,'both');
 recipe:=jsonb_build_object('id',recipe_id,'revision',0,'name','QA mixed cheese','output_id',d,'expected_qty',140,'items',jsonb_build_array(
  jsonb_build_object('ingredient_id',a,'input_qty',80,'input_unit','g'),
  jsonb_build_object('ingredient_id',b,'input_qty',0.5,'input_unit','pack'),
  jsonb_build_object('ingredient_id',c,'input_qty',12.5,'input_unit','g')));
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 select count(*) into sales_count from public.orders;
 set local role authenticated;
 rejected:=false;
 begin perform public.production_action(staff_token,'save_recipe',recipe); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'staff edited recipe'; end if;
 perform public.production_action(owner_token,'save_recipe',recipe);
 listing:=public.production_action(owner_token,'load');
 if not (listing->>'can_manage')::boolean or not exists(select 1 from jsonb_array_elements(listing->'recipes') r where r->>'id'=recipe_id::text) then raise exception 'recipe missing from load'; end if;
 listing:=public.production_action(other_token,'load');
 if exists(select 1 from jsonb_array_elements(listing->'recipes') r where r->>'id'=recipe_id::text) then raise exception 'cross branch recipe leak'; end if;
 rejected:=false;
 begin perform public.production_action(owner_token,'save_recipe',recipe); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'stale recipe update accepted'; end if;
 payload:=jsonb_build_object('id',batch_id,'recipe_id',recipe_id,'revision',1,'rounds',1,'actual_qty',130,'note','QA');
 rejected:=false;
 begin perform public.production_action(other_token,'produce',payload); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'cross branch produced'; end if;
 first_result:=public.production_action(staff_token,'produce',payload);
 second_result:=public.production_action(staff_token,'produce',payload);
 if first_result<>second_result then raise exception 'retry changed result'; end if;
 reset role;
 if (select stock_qty from public.ingredients where id=a)<>920 or (select stock_qty from public.ingredients where id=b)<>950 or (select stock_qty from public.ingredients where id=c)<>987.5 then raise exception 'wrong input stock / unit conversion'; end if;
 if (select stock_qty from public.ingredients where id=d)<>230 or (select cost_per_unit from public.ingredients where id=d)<>0.5913 then raise exception 'wrong output stock or weighted cost'; end if;
 if (select total_cost from public.production_batches where id=batch_id)<>36 then raise exception 'wrong total cost'; end if;
 if (select count(*) from public.stock_movements where production_batch_id=batch_id)<>4 then raise exception 'duplicate stock movement'; end if;
 if (select count(*) from public.orders)<>sales_count then raise exception 'production created a sale'; end if;
 set local role authenticated;
 rejected:=false;
 begin perform public.production_action(staff_token,'cancel',jsonb_build_object('id',batch_id,'reason','QA')); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'staff cancelled production'; end if;
 rejected:=false;
 begin perform public.production_action(owner_token,'produce',payload||jsonb_build_object('id',gen_random_uuid(),'rounds',100)); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'shortage accepted'; end if;
 rejected:=false;
 begin perform public.production_action('invalid','load'); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'invalid PIN accepted'; end if;
 rejected:=false;
 begin perform public.production_action(owner_token,'produce',payload||jsonb_build_object('id',gen_random_uuid(),'actual_qty',0)); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'zero yield accepted'; end if;
 reset role;
 if (select count(*) from public.production_batches where id=batch_id)<>1 then raise exception 'batch missing'; end if;
 if (select stock_qty from public.ingredients where id=a)<>920 then raise exception 'failed request changed stock'; end if;
 -- A later output adjustment prevents automatic reversal. Roll back the simulation in a subtransaction.
 begin
  update public.ingredients set stock_qty=stock_qty-1 where id=d;
  rejected:=false;
  begin perform public.production_action(owner_token,'cancel',jsonb_build_object('id',batch_id,'reason','QA')); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'used output cancellation accepted'; end if;
  raise exception using errcode='ZX001',message='undo simulated consumption';
 exception when sqlstate 'ZX001' then null; end;
 set local role authenticated;
 first_result:=public.production_action(owner_token,'cancel',jsonb_build_object('id',batch_id,'reason','QA incorrect entry'));
 second_result:=public.production_action(owner_token,'cancel',jsonb_build_object('id',batch_id,'reason','retry'));
 if first_result<>second_result then raise exception 'cancel retry changed result'; end if;
 reset role;
 if (select stock_qty from public.ingredients where id=a)<>1000 or (select stock_qty from public.ingredients where id=b)<>1000 or (select stock_qty from public.ingredients where id=c)<>1000 or (select stock_qty from public.ingredients where id=d)<>100 then raise exception 'cancellation stock mismatch'; end if;
 if (select cost_per_unit from public.ingredients where id=d)<>1 then raise exception 'cancellation cost mismatch'; end if;
 if (select count(*) from public.stock_movements where production_batch_id=batch_id)<>8 then raise exception 'cancel retry duplicated stock'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;
 begin perform public.production_action(owner_token,'load'); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'missing auth accepted'; end if;
end;
$$;
rollback;
select 'PASS: units, actual yield, WAC, idempotency, shortage rollback, owner/staff/branch permissions, cancellation and auth. Fixtures rolled back.' as result;
