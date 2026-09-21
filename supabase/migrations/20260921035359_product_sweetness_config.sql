-- Applied to the linked Supabase project; filename matches its migration history.
alter table public.products add column if not exists sweetness_config jsonb;
alter table public.products add constraint products_sweetness_config_array
  check (sweetness_config is null or jsonb_typeof(sweetness_config) = 'array');
comment on column public.products.sweetness_config is
  'Per-ingredient absolute less/more quantities in base units. Normal uses BOM. Null imports valid legacy options; empty array disables customization.';
