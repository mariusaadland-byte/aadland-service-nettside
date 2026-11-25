-- Draft: private staging of large supplier files. Nothing changes in active catalogs until S36 activation.
create table public.material_import_chunks (
 upload_id uuid not null, owner_id text not null, chunk_number integer not null check(chunk_number between 0 and 99),
 products jsonb not null check(jsonb_typeof(products)='array' and jsonb_array_length(products) between 1 and 5000),
 created_at timestamptz not null default now(),
 primary key(upload_id,chunk_number)
);
alter table public.material_import_chunks enable row level security;
revoke all on public.material_import_chunks from public,anon,authenticated;
grant select,insert,delete on public.material_import_chunks to service_role;
create index material_import_chunks_expiry_idx on public.material_import_chunks(created_at);
create or replace function public.preview_material_import(p_supplier text,p_name text,p_filename text,p_owner text,p_products jsonb,p_skipped integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
$$;
revoke all on function public.preview_material_import(text,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.preview_material_import(text,text,text,text,jsonb,integer) to service_role;


create function public.finish_large_material_import(p_upload uuid,p_owner text,p_supplier text,p_name text,p_filename text,p_chunks integer,p_count integer,p_skipped integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_count integer; v_min integer; v_max integer; v_total bigint; v_products jsonb; v_result jsonb;
begin
 if p_chunks not between 1 and 20 or p_count not between 1 and 100000 then raise exception 'S36_INVALID_SIZE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_upload::text,0));
 select count(*),min(chunk_number),max(chunk_number),sum(jsonb_array_length(products)) into v_count,v_min,v_max,v_total from public.material_import_chunks where upload_id=p_upload and owner_id=p_owner;
 if v_count<>p_chunks or v_min<>0 or v_max<>p_chunks-1 or v_total<>p_count then raise exception 'S36_INCOMPLETE_UPLOAD';end if;
 select jsonb_agg(x.value order by c.chunk_number,x.ordinality) into v_products from public.material_import_chunks c cross join lateral jsonb_array_elements(c.products) with ordinality x(value,ordinality) where c.upload_id=p_upload and c.owner_id=p_owner;
 v_result:=public.preview_material_import(p_supplier,p_name,p_filename,p_owner,v_products,p_skipped);
 delete from public.material_import_chunks where upload_id=p_upload and owner_id=p_owner;
 return v_result;
end;
$$;
revoke all on function public.finish_large_material_import(uuid,text,text,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.finish_large_material_import(uuid,text,text,text,text,integer,integer,integer) to service_role;
