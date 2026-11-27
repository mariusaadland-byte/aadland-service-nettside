do $$
begin
 if current_database()<>'aadland_restore_test' then raise exception 'WRONG DATABASE';end if;
 if not exists(select 1 from public.vat_purchase_cost_effective where supplier_document_number='A1' and cost_unit='shared' and cost_revision=2 and base_ore=10000 and vat_ore=2500) then raise exception 'Service purchase and classification missing';end if;
 if not exists(select 1 from public.rental_group_tripletex_payment_transfers where state='confirmed') then raise exception 'Rental payment history missing';end if;
 if not exists(select 1 from public.aadland_signing_evidence) then raise exception 'Rental signature missing';end if;
 if not exists(select 1 from public.rental_vipps_bank_matches where proof_digest=encode(sha256(image_bytes),'hex')) then raise exception 'Rental bank evidence missing';end if;
 if has_function_privilege('authenticated','public.draft_purchase_cost_classify(uuid,integer,text,text,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.draft_group_finance_snapshot()','EXECUTE') then raise exception 'Unsafe restored function access';end if;
 if has_table_privilege('anon','public.vat_purchase_cost_history','SELECT') or has_table_privilege('authenticated','public.rental_vipps_bank_matches','SELECT') then raise exception 'Unsafe restored table access';end if;
end $$;
