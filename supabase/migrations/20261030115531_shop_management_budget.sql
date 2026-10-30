-- Owner-only management P&L. Operational checkout records remain unchanged.
create table private.shop_budget_entries (
 id uuid primary key,
 branch_id uuid references public.branches(id),
 entry_date date not null,
 kind text not null check(kind in ('expense','platform')),
 category text not null,
 amount numeric(14,2) not null default 0 check(amount >= 0 and amount < 1000000000000),
 fees numeric(14,2) not null default 0 check(fees >= 0 and fees < 1000000000000),
 cogs numeric(14,2) check(cogs >= 0 and cogs < 1000000000000),
 note text not null default '' check(length(note)<=1000),
 receipt text check(length(receipt)<=1400000 and receipt ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'),
 created_by uuid not null references public.users(id),
 updated_at timestamptz not null default now(),
 voided boolean not null default false,
 check ((kind='expense' and category in ('wages','rent','utilities','waste','other') and amount>0 and fees=0 and cogs is null)
   or (kind='platform' and category in ('grab','line_man')))
);
alter table private.shop_budget_entries enable row level security;
revoke all on private.shop_budget_entries from public,anon,authenticated;
create index shop_budget_entries_range_idx on private.shop_budget_entries(branch_id,entry_date);
create unique index shop_budget_platform_day_idx on private.shop_budget_entries(branch_id,entry_date,category) nulls not distinct where kind='platform' and not voided;

-- The private definer is required for PIN-role authorization: devices share anonymous Auth sessions.
create function private.shop_budget(p_token text,p_action text,p_from date,p_to date,p_entry jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_branch uuid; v_id uuid; v_old private.shop_budget_entries%rowtype; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 v_user:=public.pin_session_user(p_token);
 select u.branch_id into v_branch from public.users u where u.id=v_user and u.is_active and u.role='owner';
 if not found then raise exception 'เฉพาะเจ้าของร้านเท่านั้น กรุณาเข้าสู่ระบบด้วย PIN เจ้าของ'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'เลือกช่วงวันที่ไม่เกิน 367 วัน'; end if;
 if p_action in ('save','void','receipt') then
  v_id:=(p_entry->>'id')::uuid;
  if v_id is null then raise exception 'ไม่พบรหัสรายการ'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,71));
  select * into v_old from private.shop_budget_entries where id=v_id for update;
  if found and v_old.branch_id is distinct from v_branch then raise exception 'ไม่มีสิทธิ์เข้าถึงรายการนี้'; end if;
  if p_action='receipt' then
   if v_old.id is null then raise exception 'ไม่พบรายการ'; end if;
   return jsonb_build_object('receipt',v_old.receipt);
  end if;
  if p_action='void' then
   if v_old.id is null then raise exception 'ไม่พบรายการ'; end if;
   update private.shop_budget_entries set voided=true,updated_at=clock_timestamp() where id=v_id;
   return jsonb_build_object('id',v_id);
  end if;
  if v_old.id is not null and (v_old.voided or v_old.updated_at is distinct from (p_entry->>'updated_at')::timestamptz) then
   raise exception 'รายการนี้เปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนแก้ไข';
  end if;
  if (p_entry->>'entry_date')::date > (now() at time zone 'Asia/Bangkok')::date then raise exception 'ยังบันทึกยอดจริงของวันในอนาคตไม่ได้'; end if;
  insert into private.shop_budget_entries(id,branch_id,entry_date,kind,category,amount,fees,cogs,note,receipt,created_by)
  values(v_id,v_branch,(p_entry->>'entry_date')::date,p_entry->>'kind',p_entry->>'category',
   (p_entry->>'amount')::numeric,coalesce((p_entry->>'fees')::numeric,0),(p_entry->>'cogs')::numeric,
   coalesce(p_entry->>'note',''),p_entry->>'receipt',v_user)
  on conflict(id) do update set entry_date=excluded.entry_date,category=excluded.category,amount=excluded.amount,
   fees=excluded.fees,cogs=excluded.cogs,note=excluded.note,
   receipt=case when p_entry ? 'receipt' then excluded.receipt else private.shop_budget_entries.receipt end,
   updated_at=clock_timestamp()
  where private.shop_budget_entries.kind=excluded.kind;
  if not found then raise exception 'ไม่สามารถเปลี่ยนประเภทรายการ'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action <> 'read' then raise exception 'คำสั่งไม่ถูกต้อง'; end if;

 with sales as (
  select o.*,
   (o.created_at at time zone 'Asia/Bangkok')::date as day,
   case when o.checkout_source='line_man' or exists(select 1 from public.payments p where p.order_id=o.id and lower(coalesce(p.ref,'')) like 'line man%') then 'line_man'
   when o.checkout_source='grab' or exists(select 1 from public.payments p where p.order_id=o.id and lower(trim(p.ref))='grab') then 'grab'
   else 'store' end as source
  from public.orders o where o.status='paid' and o.branch_id is not distinct from v_branch
  and o.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok')
  and o.created_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok')
 ), daily as (
  select day,source,count(*) as bills,sum(total) as sales,sum(cogs_total) as cogs,
   count(*) filter(where coalesce(cogs_total,0)<=0) as missing_cost_bills
  from sales group by day,source
 ), lm as (
  select (o.created_at at time zone 'Asia/Bangkok')::date as day,count(*) as bills
  from public.line_man_orders o where o.branch_id is not distinct from v_branch
  and o.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok')
  and o.created_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok') group by 1
 )
 select jsonb_build_object(
  'sales',coalesce((select jsonb_agg(to_jsonb(d) order by day,source) from daily d),'[]'::jsonb),
  'line_man_days',coalesce((select jsonb_agg(to_jsonb(l) order by day) from lm l),'[]'::jsonb),
  'entries',coalesce((select jsonb_agg((to_jsonb(e)-'receipt')||jsonb_build_object('has_receipt',e.receipt is not null) order by entry_date desc,updated_at desc)
   from private.shop_budget_entries e where e.branch_id is not distinct from v_branch and not e.voided and e.entry_date between p_from and p_to),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function private.shop_budget(text,text,date,date,jsonb) from public,anon;
grant execute on function private.shop_budget(text,text,date,date,jsonb) to authenticated;
create function public.shop_budget(p_token text,p_action text,p_from date,p_to date,p_entry jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.shop_budget(p_token,p_action,p_from,p_to,p_entry);
$$;
revoke all on function public.shop_budget(text,text,date,date,jsonb) from public,anon;
grant execute on function public.shop_budget(text,text,date,date,jsonb) to authenticated;
