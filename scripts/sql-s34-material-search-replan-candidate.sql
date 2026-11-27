-- CANDIDATE ONLY, NOT A MIGRATION. Build index and switch function separately.
-- Full S36 activation and rollback in isolated database are required before deployment.
create extension if not exists pg_trgm with schema extensions;
create index s34_material_search_combined_trgm_idx
 on public.material_supplier_products using gin ((lower(supplier_sku) || ' ' || lower(ean) || ' ' || lower(module_number) || ' ' || lower(name) || ' ' || lower(category_name)) extensions.gin_trgm_ops);

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
language plpgsql stable security invoker set search_path = pg_catalog, pg_temp
as $func$
begin
 -- Preserve short/wildcard/escape behavior. All user values passed with USING.
 if length(btrim(search_query))<3 or position('%' in search_query)>0 or position('_' in search_query)>0 or position(chr(92) in search_query)>0 then
  return query execute $sql$
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
    and ($2 is null or $2 = '' or p.supplier_id = $2)
    and nullif(btrim($1),'') is not null
    and (
      lower(p.supplier_sku) like '%' || lower(btrim($1)) || '%'
      or lower(p.ean) like '%' || lower(btrim($1)) || '%'
      or lower(p.module_number) like '%' || lower(btrim($1)) || '%'
      or lower(p.name) like '%' || lower(btrim($1)) || '%'
      or lower(p.category_name) like '%' || lower(btrim($1)) || '%'
      or p.search_document @@ plainto_tsquery('simple', btrim($1))
    )
  order by
    case
      when lower(p.supplier_sku) = lower(btrim($1)) then 0
      when p.ean <> '' and lower(p.ean) = lower(btrim($1)) then 1
      when p.module_number <> '' and lower(p.module_number) = lower(btrim($1)) then 2
      when lower(p.name) like lower(btrim($1)) || '%' then 3
      else 4
    end,
    s.is_primary desc,
    ts_rank_cd(p.search_document, plainto_tsquery('simple', btrim($1))) desc,
    p.name asc
  limit least(greatest(coalesce($3,20),1),50);
$sql$ using search_query,supplier_filter,result_limit;
 else
  -- Parameter-specific replanning lets the planner use the two GIN indexes.
  return query execute $sql$
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
    and ($2 is null or $2 = '' or p.supplier_id = $2)
    and nullif(btrim($1),'') is not null
    -- Short and wildcard/escape searches keep original behavior.
    and (
      (lower(p.supplier_sku) || ' ' || lower(p.ean) || ' ' || lower(p.module_number) || ' ' || lower(p.name) || ' ' || lower(p.category_name)) like '%' || lower(btrim($1)) || '%'
      or p.search_document @@ plainto_tsquery('simple', btrim($1))
    )
    and (
      lower(p.supplier_sku) like '%' || lower(btrim($1)) || '%'
      or lower(p.ean) like '%' || lower(btrim($1)) || '%'
      or lower(p.module_number) like '%' || lower(btrim($1)) || '%'
      or lower(p.name) like '%' || lower(btrim($1)) || '%'
      or lower(p.category_name) like '%' || lower(btrim($1)) || '%'
      or p.search_document @@ plainto_tsquery('simple', btrim($1))
    )
  order by
    case
      when lower(p.supplier_sku) = lower(btrim($1)) then 0
      when p.ean <> '' and lower(p.ean) = lower(btrim($1)) then 1
      when p.module_number <> '' and lower(p.module_number) = lower(btrim($1)) then 2
      when lower(p.name) like lower(btrim($1)) || '%' then 3
      else 4
    end,
    s.is_primary desc,
    ts_rank_cd(p.search_document, plainto_tsquery('simple', btrim($1))) desc,
    p.name asc
  limit least(greatest(coalesce($3,20),1),50);
$sql$ using search_query,supplier_filter,result_limit;
 end if;
end;
$func$;
revoke all on function public.search_material_supplier_products(text,text,integer) from public,anon,authenticated;
grant execute on function public.search_material_supplier_products(text,text,integer) to service_role;
