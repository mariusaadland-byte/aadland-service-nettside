-- Leverandøruavhengig materialkatalog for pris- og materialkalkulator.
create table if not exists public.material_suppliers (
  id text primary key,
  name text not null,
  active boolean not null default true,
  is_primary boolean not null default false,
  default_markup_percent numeric(6,2) not null default 15.00
    check (default_markup_percent >= 0 and default_markup_percent <= 1000),
  last_import_at timestamptz,
  last_source_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists material_suppliers_one_primary_idx
  on public.material_suppliers ((is_primary))
  where is_primary = true;

insert into public.material_suppliers (id,name,active,is_primary,default_markup_percent)
values
  ('byggern','Bygger’n',true,true,15.00),
  ('ahlsell','Ahlsell',true,false,15.00),
  ('optimera','Optimera / MinOptimera',true,false,15.00),
  ('byggmakker','Byggmakker Proff',true,false,15.00),
  ('megaflis','Megaflis',true,false,15.00)
on conflict (id) do update
set name=excluded.name,
    active=excluded.active,
    updated_at=now();

create table if not exists public.material_supplier_products (
  supplier_id text not null references public.material_suppliers(id) on delete cascade,
  supplier_sku text not null,
  name text not null,
  cost_ex_vat_ore bigint not null check (cost_ex_vat_ore >= 0),
  unit text not null default 'STK',
  category_code text not null default '',
  category_name text not null default '',
  ean text not null default '',
  module_number text not null default '',
  active boolean not null default true,
  source_filename text not null default '',
  import_batch text not null default '',
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(supplier_sku,'') || ' ' ||
      coalesce(name,'') || ' ' ||
      coalesce(category_code,'') || ' ' ||
      coalesce(category_name,'') || ' ' ||
      coalesce(ean,'') || ' ' ||
      coalesce(module_number,'')
    )
  ) stored,
  primary key (supplier_id,supplier_sku)
);

create index if not exists material_supplier_products_supplier_active_idx
  on public.material_supplier_products (supplier_id,active,name);

create index if not exists material_supplier_products_ean_idx
  on public.material_supplier_products (ean)
  where ean <> '';

create index if not exists material_supplier_products_module_idx
  on public.material_supplier_products (module_number)
  where module_number <> '';

create index if not exists material_supplier_products_search_idx
  on public.material_supplier_products using gin (search_document);

alter table public.material_suppliers enable row level security;
alter table public.material_supplier_products enable row level security;

revoke all on table public.material_suppliers from anon, authenticated;
revoke all on table public.material_supplier_products from anon, authenticated;
grant select, insert, update, delete on table public.material_suppliers to service_role;
grant select, insert, update, delete on table public.material_supplier_products to service_role;

create or replace function public.search_material_supplier_products(
  search_query text,
  supplier_filter text default null,
  result_limit integer default 20
)
returns table (
  supplier_id text,
  supplier_name text,
  supplier_is_primary boolean,
  supplier_sku text,
  product_name text,
  unit text,
  cost_ex_vat_ore bigint,
  category_code text,
  category_name text,
  ean text,
  module_number text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.supplier_id,
    s.name,
    s.is_primary,
    p.supplier_sku,
    p.name,
    p.unit,
    p.cost_ex_vat_ore,
    p.category_code,
    p.category_name,
    p.ean,
    p.module_number
  from public.material_supplier_products p
  join public.material_suppliers s on s.id = p.supplier_id
  where p.active = true
    and s.active = true
    and (supplier_filter is null or supplier_filter = '' or p.supplier_id = supplier_filter)
    and nullif(btrim(search_query),'') is not null
    and (
      lower(p.supplier_sku) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.ean) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.module_number) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.name) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.category_name) like '%' || lower(btrim(search_query)) || '%'
      or p.search_document @@ plainto_tsquery('simple', btrim(search_query))
    )
  order by
    case
      when lower(p.supplier_sku) = lower(btrim(search_query)) then 0
      when p.ean <> '' and lower(p.ean) = lower(btrim(search_query)) then 1
      when p.module_number <> '' and lower(p.module_number) = lower(btrim(search_query)) then 2
      when lower(p.name) like lower(btrim(search_query)) || '%' then 3
      else 4
    end,
    s.is_primary desc,
    ts_rank_cd(p.search_document, plainto_tsquery('simple', btrim(search_query))) desc,
    p.name asc
  limit least(greatest(coalesce(result_limit,20),1),50);
$$;

revoke all on function public.search_material_supplier_products(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.search_material_supplier_products(text,text,integer)
  to service_role;
