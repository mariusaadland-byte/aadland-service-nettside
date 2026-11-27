-- Run against the actual legacy migration in the isolated CI service.
do $$
declare x uuid; y uuid;
begin
 insert into public.vat_purchase_documents(supplier_name,supplier_document_number,document_date,kind,evidence_reference,business_purpose,vat_groups,deduction_percent,base_ore,vat_ore,deductible_vat_ore,confirmed_by)
 values('Demo AS','A1',current_date,'purchase','demo original','Demo purchase','{"25":{"baseOre":10000,"vatOre":2500}}',100,10000,2500,2500,gen_random_uuid()) returning id into x;
 if (select cost_unit from public.vat_purchase_documents where id=x) is not null then raise exception 'legacy category invented';end if;
 insert into public.vat_purchase_documents(supplier_name,supplier_document_number,document_date,kind,evidence_reference,business_purpose,vat_groups,deduction_percent,base_ore,vat_ore,deductible_vat_ore,confirmed_by,cost_unit)
 values('Demo AS','A2',current_date,'purchase','demo original','Demo purchase','{"25":{"baseOre":10000,"vatOre":2500}}',100,10000,2500,2500,gen_random_uuid(),'rental') returning id into y;
 begin
  update public.vat_purchase_documents set cost_unit='service',voided_at=now(),void_reason='Demo correction',voided_by=gen_random_uuid() where id=y;
  raise exception 'classification changed';
 exception when others then if sqlerrm='classification changed' then raise;end if;end;
 if (select cost_unit from public.vat_purchase_documents where id=y)<>'rental' then raise exception 'classification not retained';end if;
end $$;
