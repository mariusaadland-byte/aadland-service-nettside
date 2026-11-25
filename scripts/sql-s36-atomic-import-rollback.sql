DO $test$
declare sid text:='s36-test-'||left(gen_random_uuid()::text,8); a jsonb; b jsonb; p uuid; stale uuid; rows jsonb; 
begin
 if has_table_privilege('anon','public.material_import_previews','SELECT') or has_function_privilege('authenticated','public.activate_material_import(uuid,text,text)','EXECUTE') then raise exception 'S36_ACCESS';end if;
 insert into public.material_suppliers(id,name,default_markup_percent) values(sid,'Synthetic',17);
 insert into public.material_supplier_products(supplier_id,supplier_sku,name,cost_ex_vat_ore,sale_ex_vat_ore) values(sid,'A','Old A',100,130),(sid,'B','Old B',200,260);
 rows:='[{"supplier_sku":"A","name":"New A","cost_ex_vat_ore":120,"unit":"STK"}]'::jsonb;
 a:=public.preview_material_import(sid,'Synthetic','test.csv','owner-a',rows,0);p:=(a->>'previewId')::uuid;
 if (a->>'removed')::int<>1 or (a->>'priceUp')::int<>1 or not (a->>'largeRemoval')::boolean then raise exception 'S36_DIFF';end if;
 if (select cost_ex_vat_ore from public.material_supplier_products where supplier_id=sid and supplier_sku='A')<>100 then raise exception 'S36_PREVIEW_MUTATED';end if;
 begin perform public.activate_material_import(p,'owner-a','GODKJENN PRISIMPORT');raise exception 'S36_TEST_APPROVAL_NOT_BLOCKED';exception when others then if SQLERRM<>'S36_APPROVAL_REQUIRED' then raise;end if;end;
 begin perform public.activate_material_import(p,'owner-b','GODKJENN STOR REDUKSJON');raise exception 'S36_TEST_OWNER_NOT_BLOCKED';exception when others then if SQLERRM<>'S36_PREVIEW_NOT_FOUND' then raise;end if;end;
 b:=public.preview_material_import(sid,'Synthetic','test.csv','owner-a',rows,0);stale:=(b->>'previewId')::uuid;
 b:=public.activate_material_import(p,'owner-a','GODKJENN STOR REDUKSJON');
 if (select count(*) from public.material_supplier_products where supplier_id=sid and active)<>1 or (select cost_ex_vat_ore from public.material_supplier_products where supplier_id=sid and supplier_sku='A')<>120 or (select sale_ex_vat_ore from public.material_supplier_products where supplier_id=sid and supplier_sku='A')<>130 or (select default_markup_percent from public.material_suppliers where id=sid)<>17 then raise exception 'S36_ACTIVATION';end if;
 b:=public.activate_material_import(p,'owner-a','GODKJENN STOR REDUKSJON');if not (b->>'alreadyApplied')::boolean then raise exception 'S36_RETRY';end if;
 begin perform public.activate_material_import(stale,'owner-a','GODKJENN STOR REDUKSJON');raise exception 'S36_TEST_STALE_NOT_BLOCKED';exception when others then if SQLERRM<>'S36_CATALOG_CHANGED' then raise;end if;end;
end $test$;
