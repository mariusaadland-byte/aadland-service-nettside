-- REVIEWED ROLLBACK CANDIDATE, NOT A MIGRATION.
-- Use only after the matching S34/S36 rollout. First stop new imports and wait for in-flight requests.
-- Restore original preview and search; keep v2 fingerprint + dual-version activation
-- so already-created v2 previews remain valid. Never delete or reimport catalog rows.
begin;
set local lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.preview_material_import(p_supplier text, p_name text, p_filename text, p_owner text, p_products jsonb, p_skipped integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '30s'
AS $function$
declare v_id uuid; v_summary jsonb; v_old bigint; v_removed bigint; v_total bigint; v_new bigint; v_changed bigint; v_up bigint; v_down bigint; v_name text;
begin
 if p_supplier is null or p_supplier !~ '^[a-z0-9][a-z0-9-]{0,79}$' or p_supplier='egne-varer'
 or length(coalesce(p_name,'')) not between 1 and 120 or length(coalesce(p_filename,''))>240
 or length(coalesce(p_owner,'')) not between 1 and 200 or p_skipped is null or p_skipped<0
 or jsonb_typeof(p_products) is distinct from 'array' then raise exception 'S36_INVALID_IMPORT'; end if;
 v_total:=jsonb_array_length(p_products);
 if v_total not between 1 and 100000 or pg_column_size(p_products)>48000000 then raise exception 'S36_INVALID_SIZE'; end if;
 if exists(select 1 from jsonb_to_recordset(p_products) as x(supplier_sku text,name text,cost_ex_vat_ore bigint,unit text,category_code text,category_name text,ean text,module_number text)
 where length(coalesce(x.supplier_sku,'')) not between 1 and 160 or length(coalesce(x.name,'')) not between 1 and 500
 or x.cost_ex_vat_ore is null or x.cost_ex_vat_ore<0 or x.cost_ex_vat_ore>100000000000
 or length(coalesce(x.unit,'')) not between 1 and 40 or length(coalesce(x.category_code,''))>120
 or length(coalesce(x.category_name,''))>300 or length(coalesce(x.ean,''))>120 or length(coalesce(x.module_number,''))>120)
 or (select count(distinct x->>'supplier_sku') from jsonb_array_elements(p_products) x)<>v_total
 then raise exception 'S36_INVALID_OR_DUPLICATE_PRODUCTS'; end if;
 -- Hold consistent read snapshot across the current catalog and supplier metadata.
 perform set_config('lock_timeout','3s',true);
 lock table public.material_suppliers in share mode;
 lock table public.material_supplier_products in share mode;
 select coalesce((select name from public.material_suppliers where id=p_supplier),p_name) into v_name;
 select count(*) into v_old from public.material_supplier_products where supplier_id=p_supplier and active;
 with incoming as (select * from jsonb_to_recordset(p_products) as x(supplier_sku text,name text,cost_ex_vat_ore bigint,unit text,category_code text,category_name text,ean text,module_number text))
 select count(*) filter(where p.supplier_sku is null or not p.active),
 count(*) filter(where p.active and (p.name,p.cost_ex_vat_ore,p.unit,p.category_code,p.category_name,p.ean,p.module_number) is distinct from (i.name,i.cost_ex_vat_ore,i.unit,coalesce(i.category_code,''),coalesce(i.category_name,''),coalesce(i.ean,''),coalesce(i.module_number,''))),
 count(*) filter(where p.active and i.cost_ex_vat_ore>p.cost_ex_vat_ore),
 count(*) filter(where p.active and i.cost_ex_vat_ore<p.cost_ex_vat_ore)
 into v_new,v_changed,v_up,v_down from incoming i left join public.material_supplier_products p on p.supplier_id=p_supplier and p.supplier_sku=i.supplier_sku;
 select count(*) into v_removed from public.material_supplier_products p where p.supplier_id=p_supplier and p.active
 and not exists(select 1 from jsonb_to_recordset(p_products) as x(supplier_sku text) where x.supplier_sku=p.supplier_sku);
 v_summary:=jsonb_build_object('previous',v_old,'incoming',v_total,'newOrReactivated',v_new,'changed',v_changed,'priceUp',v_up,'priceDown',v_down,'removed',v_removed,'skipped',p_skipped,'largeRemoval',v_old>0 and v_removed*100>=v_old*20,'supplierName',v_name,'supplierId',p_supplier);
 delete from public.material_import_previews where applied_at is null and created_at<now()-interval '24 hours';
 insert into public.material_import_previews(supplier_id,supplier_name,source_filename,owner_id,base_fingerprint,products,summary)
 values(p_supplier,v_name,coalesce(p_filename,''),p_owner,public.s36_catalog_fingerprint(p_supplier),p_products,v_summary) returning id into v_id;
 return v_summary||jsonb_build_object('previewId',v_id,'expiresInMinutes',30);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_material_supplier_products(search_query text, supplier_filter text DEFAULT NULL::text, result_limit integer DEFAULT 20)
 RETURNS TABLE(supplier_id text, supplier_name text, supplier_is_primary boolean, supplier_sku text, product_name text, unit text, cost_ex_vat_ore bigint, category_code text, category_name text, ean text, module_number text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

revoke all on function public.preview_material_import(text,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.preview_material_import(text,text,text,text,jsonb,integer) to service_role;
revoke all on function public.search_material_supplier_products(text,text,integer) from public,anon,authenticated;
grant execute on function public.search_material_supplier_products(text,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
-- Separate maintenance step, NOT inside this transaction:
-- DROP INDEX CONCURRENTLY IF EXISTS public.s34_material_search_combined_trgm_idx;
-- Keep pg_trgm installed if other objects depend on it.
