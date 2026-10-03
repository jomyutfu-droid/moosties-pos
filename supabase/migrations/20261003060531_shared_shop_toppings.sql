-- Legacy rows and historical order snapshots remain intact. Only toppings become shared.
create table public.store_toppings (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 100),
 price_delta numeric(12,2) not null default 0 check(price_delta between 0 and 1000000),
 linked_ingredient_id uuid references public.ingredients(id),
 qty_delta numeric(14,3) not null default 0 check(qty_delta between 0 and 1000000),
 sort_order integer not null default 0 check(sort_order between 0 and 1000000),
 is_active boolean not null default true,
 is_available boolean not null default true,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((linked_ingredient_id is null and qty_delta=0) or (linked_ingredient_id is not null and qty_delta>0))
);
create unique index store_toppings_name_idx on public.store_toppings(lower(regexp_replace(name,'\s','','g')));
create index store_toppings_ingredient_idx on public.store_toppings(linked_ingredient_id);
alter table public.store_toppings enable row level security;
revoke all on public.store_toppings from public, anon, authenticated;
grant select on public.store_toppings to authenticated;
create policy store_toppings_catalog on public.store_toppings for select to authenticated using(true);

-- Fail instead of choosing a price/quantity when the same name has conflicting recipes.
do $$ begin
 if exists (
  select lower(regexp_replace(name,'\s','','g')) from public.product_options
  where regexp_replace(name,'\s','','g') not in ('ไม่เพิ่ม','หวานน้อย','ลดหวาน','เพิ่มหวาน','เพิ่มหวานมาก','หวานมาก','หวานปกติ','ปกติ')
  group by 1 having count(distinct (price_delta,linked_ingredient_id,qty_delta))>1
 ) then raise exception 'Conflicting legacy toppings require an explicit canonical recipe'; end if;
end $$;
insert into public.store_toppings(name,price_delta,linked_ingredient_id,qty_delta,sort_order)
 select distinct on(lower(regexp_replace(name,'\s','','g')))
 btrim(name),price_delta,linked_ingredient_id,qty_delta,sort_order
 from public.product_options
 where regexp_replace(name,'\s','','g') not in ('ไม่เพิ่ม','หวานน้อย','ลดหวาน','เพิ่มหวาน','เพิ่มหวานมาก','หวานมาก','หวานปกติ','ปกติ')
 order by lower(regexp_replace(name,'\s','','g')),sort_order,id;
insert into public.audit_log(action,entity,detail_json)
 values('migrate_store_toppings','store_toppings',jsonb_build_object('count',(select count(*) from public.store_toppings),'legacy_preserved',true));

-- The app uses anonymous device auth + a server-issued PIN session for owner actions.
create function private.save_store_topping(p_token text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 staff public.users%rowtype; old public.store_toppings%rowtype; saved public.store_toppings%rowtype;
 rid uuid; ingredient uuid; n text; price numeric; qty numeric; position integer; active boolean; available boolean;
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 select * into staff from public.users where id=public.pin_session_user(p_token) and is_active;
 if not found then raise exception 'PIN หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'; end if;
 if staff.role<>'owner' then raise exception 'เฉพาะเจ้าของร้านที่จัดการท็อปปิ้งได้'; end if;
 rid:=(p_data->>'id')::uuid;
 if rid is null then raise exception 'ไม่พบรหัสท็อปปิ้ง'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(rid::text,83));
 select * into old from public.store_toppings where id=rid for update;
 if found then
  if old.revision is distinct from (p_data->>'revision')::integer then raise exception 'รายการถูกแก้ไขแล้ว กรุณาปิดและโหลดใหม่'; end if;
 elsif coalesce((p_data->>'revision')::integer,0)<>0 then raise exception 'ไม่พบรายการเดิม'; end if;
 n:=btrim(p_data->>'name'); price:=(p_data->>'price_delta')::numeric; qty:=(p_data->>'qty_delta')::numeric;
 ingredient:=nullif(p_data->>'linked_ingredient_id','')::uuid;
 if (p_data->>'sort_order')::numeric is null or (p_data->>'sort_order')::numeric<>trunc((p_data->>'sort_order')::numeric) then raise exception 'ลำดับต้องเป็นจำนวนเต็ม'; end if;
 position:=(p_data->>'sort_order')::integer;
 active:=coalesce((p_data->>'is_active')::boolean,true); available:=coalesce((p_data->>'is_available')::boolean,true);
 if n is null or length(n) not between 1 and 100 or regexp_replace(n,'\s','','g') in ('ไม่เพิ่ม','หวานน้อย','ลดหวาน','เพิ่มหวาน','เพิ่มหวานมาก','หวานมาก','หวานปกติ','ปกติ') then raise exception 'ระบุชื่อท็อปปิ้ง ไม่ใช้ชื่อระดับความหวาน'; end if;
 if price is null or not(price between 0 and 1000000) or price<>round(price,2) then raise exception 'ราคาไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)'; end if;
 if qty is null or not(qty between 0 and 1000000) or qty<>round(qty,3) or position not between 0 and 1000000 then raise exception 'ปริมาณหรือลำดับไม่ถูกต้อง'; end if;
 if (ingredient is null and qty<>0) or (ingredient is not null and qty<=0) then raise exception 'เลือกวัตถุดิบและปริมาณต่อส่วนให้ถูกต้อง'; end if;
 if ingredient is not null and not exists(select 1 from public.ingredients where id=ingredient and (not active or is_active)) then raise exception 'วัตถุดิบไม่พร้อมใช้งาน'; end if;
 if exists(select 1 from public.store_toppings t where t.id<>rid and lower(regexp_replace(t.name,'\s','','g'))=lower(regexp_replace(n,'\s','','g'))) then raise exception 'ชื่อท็อปปิ้งนี้มีแล้ว กรุณาแก้รายการเดิม'; end if;
 insert into public.store_toppings(id,name,price_delta,linked_ingredient_id,qty_delta,sort_order,is_active,is_available,revision)
 values(rid,n,price,ingredient,qty,position,active,available,coalesce(old.revision,0)+1)
 on conflict(id) do update set name=excluded.name,price_delta=excluded.price_delta,linked_ingredient_id=excluded.linked_ingredient_id,
 qty_delta=excluded.qty_delta,sort_order=excluded.sort_order,is_active=excluded.is_active,is_available=excluded.is_available,
 revision=excluded.revision,updated_at=clock_timestamp()
 returning * into saved;
 insert into public.audit_log(user_id,action,entity,entity_id,detail_json)
 values(staff.id,'save_store_topping','store_toppings',rid,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(saved)));
 return to_jsonb(saved);
end $$;
revoke all on function private.save_store_topping(text,jsonb) from public, anon;
grant execute on function private.save_store_topping(text,jsonb) to authenticated;
create function public.save_store_topping(p_token text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.save_store_topping(p_token,p_data); $$;
revoke all on function public.save_store_topping(text,jsonb) from public, anon;
grant execute on function public.save_store_topping(text,jsonb) to authenticated;
