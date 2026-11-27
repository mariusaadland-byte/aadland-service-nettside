do $$
declare x uuid; a uuid:=gen_random_uuid(); q uuid:=gen_random_uuid();
begin
 select id into x from public.vat_purchase_documents where supplier_document_number='A1';
 if public.draft_purchase_cost_classify(x,0,'rental','Demo classification',a,q)<>'recorded' then raise exception 'classification not saved';end if;
 if public.draft_purchase_cost_classify(x,0,'rental','Demo classification',a,q)<>'existing' then raise exception 'replay';end if;
 if public.draft_purchase_cost_classify(x,0,'service','Stale correction',a,gen_random_uuid())<>'review' then raise exception 'stale accepted';end if;
 if public.draft_purchase_cost_classify(x,1,'shared','Demo correction',a,gen_random_uuid())<>'recorded' then raise exception 'correction missing';end if;
 if (select cost_unit from public.vat_purchase_documents where id=x) is not null then raise exception 'original modified';end if;
 if not exists(select 1 from public.vat_purchase_cost_effective where id=x and cost_unit='shared' and cost_revision=2 and base_ore=10000 and vat_ore=2500) then raise exception 'effective category wrong';end if;
 if (select count(*) from public.vat_purchase_cost_history where document_id=x)<>2 then raise exception 'history lost';end if;
 if has_function_privilege('authenticated','public.draft_purchase_cost_classify(uuid,integer,text,text,uuid,uuid)','EXECUTE') then raise exception 'client grant';end if;
end $$;
