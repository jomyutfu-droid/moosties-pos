begin;
do $$
declare actor public.users%rowtype; staff_id uuid; token text:=gen_random_uuid()::text; staff_token text:=gen_random_uuid()::text;
begin
 select * into actor from public.users where role='owner' and is_active limit 1;
 if actor.id is null then raise exception 'No owner fixture'; end if;
 insert into public.pin_sessions(user_id,token_hash) values(actor.id,encode(extensions.digest(token,'sha256'),'hex'));
 perform set_config('test.budget_token',token,true);
 select id into staff_id from public.users where role='staff' and is_active limit 1;
 if staff_id is not null then
  insert into public.pin_sessions(user_id,token_hash) values(staff_id,encode(extensions.digest(staff_token,'sha256'),'hex'));
 end if;
 perform set_config('test.budget_staff_token',staff_token,true);
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 insert into public.orders(branch_id,user_id,status,total,cogs_total,created_at)
 values(actor.branch_id,actor.id,'paid',123.45,40,'2000-01-01T17:00:00Z'),
       (actor.branch_id,actor.id,'open',9999,40,'2000-01-02T01:00:00Z');
end $$;
set local role authenticated;
do $$
declare token text:=current_setting('test.budget_token'); result jsonb; eid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid(); item jsonb; denied boolean:=false;
begin
 if has_table_privilege('authenticated','private.shop_budget_entries','SELECT') then raise exception 'Ledger exposed'; end if;
 begin perform public.shop_budget(current_setting('test.budget_staff_token'),'read','2000-01-02','2000-01-02'); exception when others then denied:=true; end;
 if not denied then raise exception 'Staff access allowed'; end if;
 result:=public.shop_budget(token,'read','2000-01-02','2000-01-02');
 if not exists(select 1 from jsonb_array_elements(result->'sales') s where s->>'day'='2000-01-02' and (s->>'sales')::numeric=123.45 and (s->>'cogs')::numeric=40) then raise exception 'Bangkok sales aggregation failed: %',result; end if;
 perform public.shop_budget(token,'save','2000-01-02','2000-01-02',jsonb_build_object('id',eid,'entry_date','2000-01-02','kind','expense','category','wages','amount',100,'receipt','data:image/png;base64,YQ=='));
 result:=public.shop_budget(token,'read','2000-01-02','2000-01-02');
 select e into item from jsonb_array_elements(result->'entries') e where e->>'id'=eid::text;
 if item is null or item ? 'receipt' or not (item->>'has_receipt')::boolean then raise exception 'Expense read/receipt isolation failed'; end if;
 perform public.shop_budget(token,'save','2000-01-02','2000-01-02',item||jsonb_build_object('amount',120));
 denied:=false;
 begin perform public.shop_budget(token,'save','2000-01-02','2000-01-02',item||jsonb_build_object('amount',130)); exception when others then denied:=true; end;
 if not denied then raise exception 'Stale edit was accepted'; end if;
 result:=public.shop_budget(token,'receipt','2000-01-02','2000-01-02',jsonb_build_object('id',eid));
 if result->>'receipt'<>'data:image/png;base64,YQ==' then raise exception 'Receipt retrieval failed'; end if;
 perform public.shop_budget(token,'save','2000-01-02','2000-01-02',jsonb_build_object('id',pid,'entry_date','2000-01-02','kind','platform','category','grab','amount',250,'fees',75));
 denied:=false;
 begin perform public.shop_budget(token,'save','2000-01-02','2000-01-02',jsonb_build_object('id',gen_random_uuid(),'entry_date','2000-01-02','kind','platform','category','grab','amount',250,'fees',75)); exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'Duplicate platform allowed'; end if;
 perform public.shop_budget(token,'void','2000-01-02','2000-01-02',jsonb_build_object('id',eid));
 result:=public.shop_budget(token,'read','2000-01-02','2000-01-02');
 if exists(select 1 from jsonb_array_elements(result->'entries') e where e->>'id'=eid::text) then raise exception 'Void failed'; end if;
end $$;
rollback;
select 'PASS: owner access, staff denial, Bangkok day, paid sales only, expense save/edit/void, stale edit rejection, receipt isolation, unique platform day; fixtures rolled back' as result;
