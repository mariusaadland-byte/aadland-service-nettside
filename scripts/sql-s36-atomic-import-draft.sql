-- S36 draft: private staged full-catalog replacement. No existing prices changed by DDL.
create table public.material_import_previews (
 id uuid primary key default gen_random_uuid(),
 supplier_id text not null,
 supplier_name text not null,
 source_filename text not null,
 owner_id text not null,
 base_fingerprint text not null,
 products jsonb,
 summary jsonb not null,
 created_at timestamptz not null default now(),
 applied_at timestamptz
);
alter table public.material_import_previews enable row level security;
revoke all on public.material_import_previews from public,anon,authenticated;
grant select,insert,update,delete on public.material_import_previews to service_role;
create index s36_previews_expiry_idx on public.material_import_previews(created_at) where applied_at is null;

create function public.s36_catalog_fingerprint(p_supplier text)
returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'supplier',(select to_jsonb(s) from public.material_suppliers s where s.id=p_supplier),
  'rows',(select coalesce(jsonb_agg(to_jsonb(p) order by p.supplier_sku),'[]'::jsonb) from public.material_supplier_products p where p.supplier_id=p_supplier)
 )::text,'UTF8')),'hex');
$$;
revoke all on function public.s36_catalog_fingerprint(text) from public,anon,authenticated;
grant execute on function public.s36_catalog_fingerprint(text) to service_role;

create function public.preview_material_import(p_supplier text,p_name text,p_filename text,p_owner text,p_products jsonb,p_skipped integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_summary jsonb; v_old bigint; v_removed bigint; v_total bigint; v_new bigint; v_changed bigint; v_up bigint; v_down bigint; v_name text;
begin
 if p_supplier is null or p_supplier !~ '^[a-z0-9][a-z0-9-]{0,79}$' or p_supplier='egne-varer'
 or length(coalesce(p_name,'')) not between 1 and 120 or length(coalesce(p_filename,''))>240
 or length(coalesce(p_owner,'')) not between 1 and 200 or p_skipped is null or p_skipped<0
 or jsonb_typeof(p_products) is distinct from 'array' then raise exception 'S36_INVALID_IMPORT'; end if;
 v_total:=jsonb_array_length(p_products);
 if v_total not between 1 and 50000 or pg_column_size(p_products)>24000000 then raise exception 'S36_INVALID_SIZE'; end if;
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

create function public.activate_material_import(p_id uuid,p_owner text,p_phrase text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.material_import_previews%rowtype; v_time timestamptz:=now();
begin
 perform set_config('lock_timeout','3s',true);
 -- Same lock order as preview: catalog tables first, then preview row.
 lock table public.material_suppliers in share row exclusive mode;
 lock table public.material_supplier_products in share row exclusive mode;
 select * into v from public.material_import_previews where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'S36_PREVIEW_NOT_FOUND';end if;
 if v.applied_at is not null then return v.summary||jsonb_build_object('alreadyApplied',true,'imported',(v.summary->>'incoming')::integer);end if;
 if v.created_at<now()-interval '30 minutes' or v.products is null then raise exception 'S36_PREVIEW_EXPIRED';end if;
 if p_phrase is distinct from (case when (v.summary->>'largeRemoval')::boolean then 'GODKJENN STOR REDUKSJON' else 'GODKJENN PRISIMPORT' end) then raise exception 'S36_APPROVAL_REQUIRED';end if;
 -- Catalog locks serialize writers; readers remain available.
 if public.s36_catalog_fingerprint(v.supplier_id)<>v.base_fingerprint then raise exception 'S36_CATALOG_CHANGED';end if;
 insert into public.material_suppliers(id,name,active,is_primary,default_markup_percent)
 values(v.supplier_id,v.supplier_name,true,false,null) on conflict(id) do nothing;
 insert into public.material_supplier_products(supplier_id,supplier_sku,name,cost_ex_vat_ore,unit,category_code,category_name,ean,module_number,active,source_filename,import_batch,imported_at,updated_at)
 select v.supplier_id,x.supplier_sku,x.name,x.cost_ex_vat_ore,x.unit,coalesce(x.category_code,''),coalesce(x.category_name,''),coalesce(x.ean,''),coalesce(x.module_number,''),true,v.source_filename,v.id::text,v_time,v_time
 from jsonb_to_recordset(v.products) as x(supplier_sku text,name text,cost_ex_vat_ore bigint,unit text,category_code text,category_name text,ean text,module_number text)
 on conflict(supplier_id,supplier_sku) do update set name=excluded.name,cost_ex_vat_ore=excluded.cost_ex_vat_ore,unit=excluded.unit,category_code=excluded.category_code,category_name=excluded.category_name,ean=excluded.ean,module_number=excluded.module_number,active=true,source_filename=excluded.source_filename,import_batch=excluded.import_batch,imported_at=excluded.imported_at,updated_at=excluded.updated_at;
 update public.material_supplier_products set active=false,updated_at=v_time where supplier_id=v.supplier_id and active and import_batch<>v.id::text;
 update public.material_suppliers set active=true,last_import_at=v_time,last_source_filename=v.source_filename,updated_at=v_time where id=v.supplier_id;
 update public.material_import_previews set applied_at=v_time,products=null where id=v.id;
 return v.summary||jsonb_build_object('alreadyApplied',false,'imported',(v.summary->>'incoming')::integer);
end;
$$;
revoke all on function public.activate_material_import(uuid,text,text) from public,anon,authenticated;
grant execute on function public.activate_material_import(uuid,text,text) to service_role;
