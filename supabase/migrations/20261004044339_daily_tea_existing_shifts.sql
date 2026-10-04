-- Existing shifts predating rollout can still close without tea reconciliation.
create or replace function private.daily_tea_action(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 staff public.users%rowtype; cfg public.daily_tea_config%rowtype; total public.daily_tea_totals%rowtype;
 d date:=coalesce((p_data->>'date')::date,(now() at time zone 'Asia/Bangkok')::date);
 used numeric; brewed numeric; waste numeric; grams numeric; delta numeric; row_data record; cash public.cash_sessions%rowtype;
 payload jsonb; result jsonb; saved private.daily_tea_close_requests%rowtype;
begin
 if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 select * into staff from public.users where id=public.pin_session_user(p_token) and is_active;
 if not found then raise exception 'PIN หมดอายุ'; end if;
 select * into cfg from public.daily_tea_config where id for update;
 if p_action='close' then
  select * into cash from public.cash_sessions where id=(p_data->>'session_id')::uuid for update;
  if not found or (cash.user_id<>staff.id and not(staff.role in ('owner','manager') and cash.branch_id is not distinct from staff.branch_id)) then raise exception 'ไม่มีสิทธิ์ปิดกะนี้'; end if;
  if cash.branch_id is distinct from staff.branch_id then raise exception 'กะนี้อยู่ต่างสาขา'; end if;
  payload:=p_data;
  select * into saved from private.daily_tea_close_requests where session_id=cash.id;
  if found then
   if saved.payload<>payload then raise exception 'กะปิดแล้วด้วยยอดอื่น กรุณารีเฟรช'; end if;
   return saved.result;
  end if;
  d:=(cash.opened_at at time zone 'Asia/Bangkok')::date;
 end if;
 if (p_action in ('load','revise') or p_data->>'brewed_ml' is not null) and (d<(cfg.started_at at time zone 'Asia/Bangkok')::date or d>(now() at time zone 'Asia/Bangkok')::date) then raise exception 'วันที่อยู่นอกช่วงสรุปชา'; end if;
 used:=private.daily_tea_used(staff.branch_id,d,cfg.brewed_id);
 select * into total from public.daily_tea_totals where branch_id is not distinct from staff.branch_id and business_date=d;
 if p_action='load' then
  return jsonb_build_object('date',d,'used_ml',used,'grams_per_spoon',cfg.grams_per_spoon,'started_at',cfg.started_at,'can_manage',staff.role='owner','total',to_jsonb(total),
   'history',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('current_used_ml',private.daily_tea_used(staff.branch_id,t.business_date,cfg.brewed_id)) order by t.business_date desc) from (select * from public.daily_tea_totals where branch_id is not distinct from staff.branch_id order by business_date desc limit 30) t),'[]'::jsonb));
 end if;
 if p_action='settings' then
  if staff.role<>'owner' then raise exception 'เฉพาะเจ้าของร้าน'; end if;
  grams:=(p_data->>'grams_per_spoon')::numeric;
  if grams is null or not(grams between 0.001 and 100) then raise exception 'ระบุน้ำหนัก 0.001–100 กรัมต่อช้อน'; end if;
  perform 1 from public.ingredients where id in(cfg.powder_id,cfg.brewed_id) order by id for update;
  update public.daily_tea_config set grams_per_spoon=grams where id;
  for row_data in select * from public.daily_tea_totals where powder_grams is null order by business_date,id for update loop
   delta:=round(row_data.spoons*grams,3);
   update public.ingredients set stock_qty=stock_qty-delta where id=cfg.powder_id;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(cfg.powder_id,'adjust',-delta,staff.id,'ผงชารายวัน '||row_data.business_date||' · ตัดยอดรอชั่ง');
   update public.daily_tea_totals set powder_grams=delta,updated_at=now() where id=row_data.id returning * into total;
   insert into private.daily_tea_audit(total_id,snapshot) values(total.id,to_jsonb(total));
  end loop;
  update public.ingredients set cost_per_unit=(select cost_per_unit from public.ingredients where id=cfg.powder_id)*grams/200 where id=cfg.brewed_id;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('close','revise') then raise exception 'ไม่รู้จักคำสั่ง'; end if;
 if p_action='revise' and staff.role<>'owner' then raise exception 'เฉพาะเจ้าของร้านแก้ไขสรุปชาได้'; end if;
 if p_action='revise' or p_data->>'brewed_ml' is not null then
  perform 1 from public.ingredients where id in(cfg.powder_id,cfg.brewed_id) order by id for update;
  used:=private.daily_tea_used(staff.branch_id,d,cfg.brewed_id);
  if used is distinct from (p_data->>'used_ml')::numeric then raise exception 'ยอดขายชาเปลี่ยนแล้ว กรุณารีเฟรชและตรวจอีกครั้ง'; end if;
  if coalesce(total.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'สรุปชาถูกบันทึกแล้ว กรุณารีเฟรช'; end if;
  brewed:=(p_data->>'brewed_ml')::numeric;
  if brewed is null or not(brewed between used and 1000000) or brewed<>round(brewed,3) then raise exception 'ยอดชงต้องไม่น้อยกว่ายอดใช้ และไม่เกิน 1,000,000 มล.'; end if;
  waste:=brewed-used;
  if total.id is not null and p_action='close' then raise exception 'วันนี้สรุปชาแล้ว เจ้าของร้านแก้ไขได้ในหน้าผลิตวัตถุดิบ'; end if;
  grams:=case when total.powder_grams is not null and total.spoons>0 then round(brewed/200*(total.powder_grams/total.spoons),3) when cfg.grams_per_spoon is null then null else round(brewed/200*cfg.grams_per_spoon,3) end;
  delta:=brewed-coalesce(total.brewed_ml,0);
  update public.ingredients set stock_qty=stock_qty+delta where id=cfg.brewed_id;
  insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(cfg.brewed_id,'adjust',delta,staff.id,'ชงชารายวัน '||d);
  delta:=waste-coalesce(total.waste_ml,0);
  update public.ingredients set stock_qty=stock_qty-delta where id=cfg.brewed_id;
  insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(cfg.brewed_id,'waste',-delta,staff.id,'ทิ้งชาเมื่อปิดร้าน '||d);
  if grams is not null then
   delta:=grams-coalesce(total.powder_grams,0);
   update public.ingredients set stock_qty=stock_qty-delta where id=cfg.powder_id;
   insert into public.stock_movements(ingredient_id,type,qty_delta,user_id,note) values(cfg.powder_id,'adjust',-delta,staff.id,'ผงชารายวัน '||d);
  end if;
  if total.id is null then
   insert into public.daily_tea_totals(branch_id,business_date,brewed_ml,used_ml,waste_ml,spoons,powder_grams,user_id)
   values(staff.branch_id,d,brewed,used,waste,brewed/200,grams,staff.id) returning * into total;
  else
   update public.daily_tea_totals set brewed_ml=brewed,used_ml=used,waste_ml=waste,spoons=brewed/200,powder_grams=grams,revision=revision+1,user_id=staff.id,updated_at=now() where id=total.id returning * into total;
  end if;
  insert into private.daily_tea_audit(total_id,snapshot) values(total.id,to_jsonb(total));
 end if;
 if p_action='close' then
  select to_jsonb(r) into result from public.close_cash_session_with_cups(p_token,cash.id,(p_data->>'counted_cash')::numeric,p_data->>'note',(p_data->>'cups_sold')::integer) r;
  insert into private.daily_tea_close_requests(session_id,payload,result) values(cash.id,payload,result);
  return result;
 end if;
 return to_jsonb(total);
end $$;
