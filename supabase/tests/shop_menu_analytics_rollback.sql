begin;
do $$
declare actor public.users%rowtype; token text:=gen_random_uuid()::text; oid uuid:=gen_random_uuid(); excluded uuid:=gen_random_uuid();
begin
 select * into actor from public.users where role='owner' and is_active limit 1;
 insert into public.pin_sessions(user_id,token_hash) values(actor.id,encode(extensions.digest(token,'sha256'),'hex'));
 perform set_config('test.analytics_token',token,true);
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 insert into public.orders(id,branch_id,user_id,status,total,cogs_total,created_at) values(oid,actor.branch_id,actor.id,'paid',180,60,'2000-01-01T17:00:00Z'),(excluded,actor.branch_id,actor.id,'open',999,10,'2000-01-01T17:00:00Z');
 insert into public.order_items(order_id,name_snapshot,unit_price,qty,line_total,cogs_snapshot) values(oid,'TEST_ANALYTICS_A',50,2,100,10),(oid,'TEST_ANALYTICS_B',100,1,100,40),(excluded,'TEST_ANALYTICS_EXCLUDED',999,1,999,10);
end $$;
set local role authenticated;
do $$
declare r jsonb; a jsonb; b jsonb; denied boolean:=false;
begin
 r:=public.shop_menu_analytics(current_setting('test.analytics_token'),'2000-01-02','2000-01-02');
 select x into a from jsonb_array_elements(r->'rows') x where x->>'name'='TEST_ANALYTICS_A';
 select x into b from jsonb_array_elements(r->'rows') x where x->>'name'='TEST_ANALYTICS_B';
 if (a->>'qty')::numeric<>2 or (a->>'cost')::numeric<>20 or (a->>'revenue')::numeric<>90 or (a->>'profit')::numeric<>70 then raise exception 'Qty/snapshot cost/discount failed: %',a; end if;
 if (b->>'revenue')::numeric<>90 or (b->>'cost')::numeric<>40 then raise exception 'Discount allocation failed'; end if;
 if a is null or b is null then raise exception 'Missing fixtures'; end if;
 if exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'name'='TEST_ANALYTICS_EXCLUDED') then raise exception 'Included unpaid order'; end if;
 begin perform public.shop_menu_analytics('invalid','2000-01-02','2000-01-02'); exception when others then denied:=true; end;
 if not denied then raise exception 'Unauthenticated PIN allowed'; end if;
end $$;
rollback;
select 'PASS: Bangkok date, paid-only items, per-unit historical costs, proportional discount allocation, owner authorization; fixtures rolled back' as result;
