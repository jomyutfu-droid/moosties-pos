-- Only generated test fixtures; every row and stock change is rolled back.
begin;
do $$
declare
  v_branch uuid;
  v_user uuid;
  v_product uuid;
  v_option uuid;
  v_ing uuid;
  v_uuid uuid := gen_random_uuid();
  v_token text := gen_random_uuid()::text;
  v_sale jsonb;
  v_first jsonb;
  v_second jsonb;
  v_rejected boolean;
begin
  insert into public.branches(name) values ('LINE MAN QA rollback') returning id into v_branch;
  insert into public.users(name,role,branch_id) values ('LINE MAN QA rollback','owner',v_branch) returning id into v_user;
  insert into public.pin_sessions(user_id,token_hash) values(v_user,encode(extensions.digest(v_token,'sha256'),'hex'));
  insert into public.ingredients(name,unit,stock_qty,pack_price,pack_qty) values ('LINE MAN QA rollback','g',100,10,100) returning id into v_ing;
  insert into public.products(name,price,line_man_price) values ('LINE MAN QA rollback',50,75.5) returning id into v_product;
  insert into public.product_options(product_id,name,price_delta,line_man_price) values(v_product,'QA topping',10,15) returning id into v_option;
  v_sale := jsonb_build_object('client_uuid',v_uuid,'reference','QA-' || v_uuid::text,
    'subtotal',211,'discount',10.25,'total',200.75,'cogs_total',12,'receipt',jsonb_build_object('lines','[]'::jsonb),
    'items',jsonb_build_array(jsonb_build_object('product_id',v_product,'name_snapshot','QA',
      'unit_price',105.5,'qty',2,'line_total',211,'cogs_snapshot',6,
      'options_json',jsonb_build_array(jsonb_build_object('option_id',v_option,'quantity',2,'price_delta',30)))),
    'stock_movements',jsonb_build_array(jsonb_build_object('ingredient_id',v_ing,'type','sale','qty_delta',-20)));
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  set local role authenticated;
  v_first := public.submit_line_man_order(v_token,v_sale);
  v_second := public.submit_line_man_order(v_token,v_sale);
  if v_first is distinct from v_second then raise exception 'retry receipt differs'; end if;
  if (select count(*) from public.orders where client_uuid = v_uuid) <> 1 then raise exception 'duplicate retry'; end if;
  if (select stock_qty from public.ingredients where id = v_ing) <> 80 then raise exception 'stock deducted twice'; end if;
  if (select count(*) from public.stock_movements where ingredient_id = v_ing) <> 1 then raise exception 'duplicate movement'; end if;
  if (select total from public.orders where client_uuid=v_uuid) <> 200.75 then raise exception 'satang lost'; end if;
  if (select count(*) from public.payments p join public.orders o on o.id=p.order_id where o.client_uuid=v_uuid and p.method='other' and p.amount=200.75) <> 1 then raise exception 'wrong payment'; end if;
  v_rejected := false;
  begin
    perform public.submit_line_man_order(v_token,v_sale || jsonb_build_object('client_uuid',gen_random_uuid()));
  exception when unique_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'duplicate external reference accepted'; end if;
  v_rejected := false;
  begin
    perform public.submit_line_man_order(v_token,v_sale || jsonb_build_object('client_uuid',gen_random_uuid(),'reference','   '));
  exception when raise_exception then v_rejected := true;
  end;
  if not v_rejected then raise exception 'blank reference accepted'; end if;
  v_rejected := false;
  begin
    perform public.submit_line_man_order('not-a-session',v_sale);
  exception when raise_exception then v_rejected := true;
  end;
  if not v_rejected then raise exception 'invalid session accepted'; end if;
  -- Invalid item prices must fail without making an order or changing stock.
  v_rejected := false;
  begin
    perform public.submit_line_man_order(v_token,jsonb_set(v_sale || jsonb_build_object('client_uuid',gen_random_uuid(),'reference','QA-BAD-PRICE'),'{items,0,unit_price}','1'));
  exception when raise_exception then v_rejected := true;
  end;
  if not v_rejected then raise exception 'wrong price accepted'; end if;
  if (select stock_qty from public.ingredients where id = v_ing) <> 80 then raise exception 'rejection changed stock'; end if;
  reset role;
end;
$$;
rollback;
select 'PASS: authenticated sale, retry, duplicate ref, stock once, exact totals, invalid session/ref/price; all fixtures rolled back' as result;
