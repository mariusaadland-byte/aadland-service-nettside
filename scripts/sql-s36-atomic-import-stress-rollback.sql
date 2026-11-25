-- Run only inside a transaction containing the draft schema, then ROLLBACK.
create function pg_temp.s36_fail_after_catalog() returns trigger language plpgsql as $$
begin
 if NEW.owner_id='s36-test-failure' and NEW.applied_at is not null then
  raise exception 'S36_INJECTED_FAILURE';
 end if;
 return NEW;
end;
$$;
create trigger s36_test_failure before update on public.material_import_previews
 for each row execute function pg_temp.s36_fail_after_catalog();
create temp table s36_test_metrics(result jsonb);
DO $test$
declare sid text:='s36-test-'||left(gen_random_uuid()::text,8); rows jsonb; a jsonb; p uuid; stale uuid; old_fingerprint text; started timestamptz; preview_ms bigint; activation_ms bigint;
begin
 insert into public.material_suppliers(id,name,default_markup_percent) values(sid,'Synthetic S36 bulk',17);
 insert into public.material_supplier_products(supplier_id,supplier_sku,name,cost_ex_vat_ore,unit,sale_ex_vat_ore)
 select sid,'SKU-'||i,'Synthetic item '||i,10000,'STK',13000 from generate_series(1,8991) i;
 select jsonb_agg(jsonb_build_object('supplier_sku','SKU-'||i,'name','Synthetic item '||i,'cost_ex_vat_ore',case when i<=100 then 11000 when i<=200 then 9000 else 10000 end,'unit','STK') order by i) into rows from generate_series(1,8991) i;
 old_fingerprint:=public.s36_catalog_fingerprint(sid);
 started:=clock_timestamp();
 a:=public.preview_material_import(sid,'Synthetic','synthetic.csv','s36-test-failure',rows,0);
 preview_ms:=round(extract(epoch from clock_timestamp()-started)*1000);
 p:=(a->>'previewId')::uuid;
 if (a->>'previous')::int<>8991 or (a->>'incoming')::int<>8991 or (a->>'priceUp')::int<>100 or (a->>'priceDown')::int<>100 or (a->>'changed')::int<>200 then raise exception 'S36_BULK_DIFF';end if;
 begin
  perform public.activate_material_import(p,'s36-test-failure','GODKJENN PRISIMPORT');
  raise exception 'S36_EXPECTED_FAILURE_MISSING';
 exception when others then
  if SQLERRM<>'S36_INJECTED_FAILURE' then raise;end if;
 end;
 if public.s36_catalog_fingerprint(sid)<>old_fingerprint or (select applied_at from public.material_import_previews where id=p) is not null then raise exception 'S36_ROLLBACK_FAILED';end if;
 a:=public.preview_material_import(sid,'Synthetic','synthetic.csv','s36-test-owner',rows,0);
 p:=(a->>'previewId')::uuid;
 a:=public.preview_material_import(sid,'Synthetic','synthetic.csv','s36-test-owner',rows,0);
 stale:=(a->>'previewId')::uuid;
 started:=clock_timestamp();
 a:=public.activate_material_import(p,'s36-test-owner','GODKJENN PRISIMPORT');
 activation_ms:=round(extract(epoch from clock_timestamp()-started)*1000);
 if (select count(*) from public.material_supplier_products where supplier_id=sid and active)<>8991 or (select count(*) from public.material_supplier_products where supplier_id=sid and cost_ex_vat_ore=11000)<>100 or (select count(*) from public.material_supplier_products where supplier_id=sid and cost_ex_vat_ore=9000)<>100 or (select count(*) from public.material_supplier_products where supplier_id=sid and sale_ex_vat_ore=13000)<>8991 then raise exception 'S36_BULK_APPLY';end if;
 begin
  perform public.activate_material_import(stale,'s36-test-owner','GODKJENN PRISIMPORT');
  raise exception 'S36_EXPECTED_STALE_MISSING';
 exception when others then
  if SQLERRM<>'S36_CATALOG_CHANGED' then raise;end if;
 end;
 insert into s36_test_metrics values(jsonb_build_object('rows',8991,'preview_ms',preview_ms,'activation_ms',activation_ms,'late_failure_rolled_back',true,'stale_preview_rejected',true,'sale_prices_preserved',true));
end $test$;
select result from s36_test_metrics;
