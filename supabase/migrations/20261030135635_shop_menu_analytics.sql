create function private.shop_menu_analytics(p_token text,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_branch uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 v_user:=public.pin_session_user(p_token);
 select branch_id into v_branch from public.users where id=v_user and is_active and role='owner';
 if not found then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
 with sales as (
  select o.id,o.total,case
   when o.checkout_source='line_man' or exists(select 1 from public.payments p where p.order_id=o.id and lower(coalesce(p.ref,'')) like 'line man%') then 'line_man'
   when o.checkout_source='grab' or exists(select 1 from public.payments p where p.order_id=o.id and lower(trim(p.ref))='grab') then 'grab' else 'store' end as source
  from public.orders o where o.status='paid' and o.branch_id is not distinct from v_branch
   and o.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok') and o.created_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok')
 ), lines as (
  select i.*,s.source,s.total,sum(i.line_total) over(partition by i.order_id) as line_sum
  from public.order_items i join sales s on s.id=i.order_id where i.qty>0
 ), financial as (
  select coalesce(product_id::text,'deleted:'||name_snapshot) as key,product_id,name_snapshot,source,qty,
   case when line_sum>0 then total*line_total/line_sum when total=0 then 0 else null end as revenue,
   case when cogs_snapshot>0 then cogs_snapshot*qty else null end as cost from lines
 ), operational as (
  select coalesce(i.product_id::text,'deleted:'||i.name_snapshot) as key,i.product_id,i.name_snapshot,'line_man'::text as source,i.qty::numeric,null::numeric as revenue,null::numeric as cost
  from public.line_man_order_items i join public.line_man_orders o on o.id=i.line_man_order_id
  where o.branch_id is not distinct from v_branch
   and o.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok') and o.created_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok')
   and not exists(select 1 from public.orders old where old.branch_id is not distinct from o.branch_id and old.status='paid' and old.checkout_source='line_man' and old.external_order_ref=o.external_order_ref)
 ), combined as (select * from financial union all select * from operational), grouped as (
  select key,product_id,max(name_snapshot) as name,source,sum(qty) as qty,
   coalesce(sum(revenue),0) as revenue,coalesce(sum(cost),0) as cost,
   coalesce(sum(qty) filter(where revenue is not null),0) as revenue_qty,
   coalesce(sum(qty) filter(where cost is not null),0) as cost_qty,
   coalesce(sum(qty) filter(where revenue is not null and cost is not null),0) as complete_qty,
   coalesce(sum(revenue-cost) filter(where revenue is not null and cost is not null),0) as profit
  from combined group by key,product_id,source
 ) select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(g)) from grouped g),'[]'::jsonb),
  'catalog',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'active',p.is_active and coalesce(c.is_active,true),'created',(p.created_at at time zone 'Asia/Bangkok')::date)) from public.products p left join public.categories c on c.id=p.category_id),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function private.shop_menu_analytics(text,date,date) from public,anon;
grant execute on function private.shop_menu_analytics(text,date,date) to authenticated;
create function public.shop_menu_analytics(p_token text,p_from date,p_to date)
returns jsonb language sql security invoker set search_path='' as $$ select private.shop_menu_analytics(p_token,p_from,p_to); $$;
revoke all on function public.shop_menu_analytics(text,date,date) from public,anon;
grant execute on function public.shop_menu_analytics(text,date,date) to authenticated;
