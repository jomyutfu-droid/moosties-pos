begin;

-- The existing ingredients.unit remains the base unit. All stock quantities,
-- recipe quantities, and costs continue to be stored in that base unit.
create table if not exists public.ingredient_units (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  factor_to_base numeric(20,6) not null check (factor_to_base > 0),
  kind text not null default 'usage' check (kind in ('purchase', 'usage', 'both')),
  is_default_purchase boolean not null default false,
  is_default_usage boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_id, name)
);

create index if not exists ingredient_units_ingredient_id_idx
  on public.ingredient_units(ingredient_id);

alter table public.ingredient_units enable row level security;
drop policy if exists ingredient_units_authenticated_all on public.ingredient_units;
create policy ingredient_units_authenticated_all
  on public.ingredient_units
  for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.ingredient_units to authenticated;

-- Preserve the old model for existing ingredients:
--   ingredients.unit      -> one base/usage unit
--   ingredients.pack_qty  -> one legacy pack converted to the base unit
insert into public.ingredient_units (
  ingredient_id, name, factor_to_base, kind, is_default_usage
)
select id, unit, 1, 'usage', true
from public.ingredients
on conflict (ingredient_id, name) do nothing;

insert into public.ingredient_units (
  ingredient_id, name, factor_to_base, kind, is_default_purchase
)
select id, 'แพ็ก', pack_qty, 'purchase', true
from public.ingredients
on conflict (ingredient_id, name) do nothing;

alter table public.recipe_items
  add column if not exists unit_name text,
  add column if not exists unit_factor numeric(20,6) not null default 1;

alter table public.recipe_items
  drop constraint if exists recipe_items_unit_factor_positive;

alter table public.recipe_items
  add constraint recipe_items_unit_factor_positive check (unit_factor > 0);

alter table public.stock_movements
  add column if not exists input_qty numeric(20,6),
  add column if not exists input_unit text,
  add column if not exists conversion_factor numeric(20,6) not null default 1;

alter table public.stock_movements
  drop constraint if exists stock_movements_conversion_factor_positive;

alter table public.stock_movements
  add constraint stock_movements_conversion_factor_positive check (conversion_factor > 0);

-- New receive/adjust RPC. The old record_stock_movement function remains in
-- place so an older open tab can continue working during deployment.
create or replace function public.record_stock_movement_with_unit(
  p_ingredient_id uuid,
  p_type text,
  p_qty_delta numeric,
  p_user_id uuid default null,
  p_note text default null,
  p_price_per_input_unit numeric default null,
  p_input_qty numeric default null,
  p_input_unit text default null,
  p_conversion_factor numeric default 1
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old_qty numeric;
  v_old_cost numeric;
  v_new_cost numeric;
  v_price_per_base numeric;
begin
  if p_type not in ('receive', 'adjust', 'waste') then
    raise exception 'invalid stock movement type';
  end if;
  if p_qty_delta = 0 then
    raise exception 'qty_delta must not be zero';
  end if;
  if p_conversion_factor is null or p_conversion_factor <= 0 then
    raise exception 'conversion_factor must be greater than zero';
  end if;
  if p_input_qty is not null and p_input_qty <= 0 then
    raise exception 'input_qty must be greater than zero';
  end if;

  insert into public.stock_movements (
    ingredient_id, type, qty_delta, user_id, note,
    input_qty, input_unit, conversion_factor
  ) values (
    p_ingredient_id, p_type, p_qty_delta, p_user_id, p_note,
    p_input_qty, p_input_unit, p_conversion_factor
  );

  update public.ingredients
  set stock_qty = stock_qty + p_qty_delta
  where id = p_ingredient_id;

  if not found then
    raise exception 'ingredient not found';
  end if;

  -- The price entered by the user is per purchase/input unit. Convert it to
  -- the base-unit cost before applying weighted-average costing.
  if p_type = 'receive'
     and p_price_per_input_unit is not null
     and p_price_per_input_unit > 0 then
    v_price_per_base := p_price_per_input_unit / p_conversion_factor;
    select stock_qty - p_qty_delta, cost_per_unit
      into v_old_qty, v_old_cost
      from public.ingredients
      where id = p_ingredient_id;

    if v_old_qty <= 0 then
      v_new_cost := v_price_per_base;
    else
      v_new_cost := (v_old_qty * v_old_cost + p_qty_delta * v_price_per_base)
                    / (v_old_qty + p_qty_delta);
    end if;

    update public.ingredients
    set cost_per_unit = round(v_new_cost::numeric, 4)
    where id = p_ingredient_id;
  end if;
end;
$$;

revoke all on function public.record_stock_movement_with_unit(
  uuid, text, numeric, uuid, text, numeric, numeric, text, numeric
) from public;
grant execute on function public.record_stock_movement_with_unit(
  uuid, text, numeric, uuid, text, numeric, numeric, text, numeric
) to authenticated;

commit;
