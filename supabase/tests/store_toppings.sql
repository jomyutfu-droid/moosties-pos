-- All fixtures and changes roll back; no real recipe, stock or order is changed.
begin;
do $$
declare
 owner_id uuid; staff_id uuid; owner_token text:=gen_random_uuid()::text; staff_token text:=gen_random_uuid()::text;
 rid uuid:=gen_random_uuid(); payload jsonb; result jsonb; rejected boolean; count_before integer;
begin
 select count(*) into count_before from public.store_toppings;
 insert into public.users(name,role) values('Toppings QA owner','owner') returning id into owner_id;
 insert into public.users(name,role) values('Toppings QA staff','staff') returning id into staff_id;
 insert into public.pin_sessions(user_id,token_hash) values
 (owner_id,encode(extensions.digest(owner_token,'sha256'),'hex')),
 (staff_id,encode(extensions.digest(staff_token,'sha256'),'hex'));
 payload:=jsonb_build_object('id',rid,'name','QA toppings rollback','revision',0,'price_delta',5,'qty_delta',0,'sort_order',1,'is_active',true,'is_available',true);
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 set local role authenticated;
 if (select count(*) from public.store_toppings)<>count_before then raise exception 'catalog read failed'; end if;
 rejected:=false;
 begin insert into public.store_toppings(name) values('QA direct denied'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'direct insert allowed'; end if;
 rejected:=false;
 begin update public.store_toppings set name='QA direct update'; exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'direct update allowed'; end if;
 rejected:=false;
 begin delete from public.store_toppings; exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'direct delete allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(staff_token,payload); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'staff mutation allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping('invalid',payload); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'invalid PIN allowed'; end if;
 result:=public.save_store_topping(owner_token,payload);
 if (result->>'revision')::integer<>1 or (result->>'price_delta')::numeric<>5 then raise exception 'owner save failed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'stale or duplicate mutation allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload||jsonb_build_object('id',gen_random_uuid())); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'duplicate name allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload||jsonb_build_object('revision',1,'price_delta',-1)); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'negative price allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload||jsonb_build_object('revision',1,'qty_delta',1)); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'stock without ingredient allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload||jsonb_build_object('revision',1,'name','หวานน้อย')); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'sweetness converted to shared topping'; end if;
 result:=public.save_store_topping(owner_token,payload||jsonb_build_object('revision',1,'is_available',false));
 if (result->>'is_available')::boolean or (result->>'revision')::integer<>2 then raise exception 'temporary unavailability failed'; end if;
 result:=public.save_store_topping(owner_token,payload||jsonb_build_object('revision',2,'is_active',false));
 if (result->>'is_active')::boolean then raise exception 'disable failed'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'missing auth allowed'; end if;
 reset role;
 set local role anon;
 rejected:=false;
 begin perform count(*) from public.store_toppings; exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'anon catalog access allowed'; end if;
 rejected:=false;
 begin perform public.save_store_topping(owner_token,payload); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'anon save allowed'; end if;
 reset role;
end $$;
rollback;
select 'PASS: catalog, owner-only RPC, auth/PIN, direct-write denial, revisions, duplicate names, validation and availability; all fixtures rolled back' as result;
