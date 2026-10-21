
create function public.update_invoice_customer_contact(p_id uuid,p_expected_updated_at timestamptz,p_name text,p_email text,p_phone text,p_address text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare previous public.admin_customer_contacts%rowtype; updated public.admin_customer_contacts%rowtype;
begin
 select * into previous from public.admin_customer_contacts where id=p_id for update;
 if not found then raise exception 'Kunden ble ikke funnet.'; end if;
 if previous.updated_at is distinct from p_expected_updated_at then raise exception 'Kundekortet er endret. Last inn på nytt.'; end if;
 if btrim(coalesce(p_name,''))='' then raise exception 'Kundenavn mangler.'; end if;
 update public.admin_customer_contacts set name=p_name,email=nullif(lower(p_email),''),phone=nullif(p_phone,''),address=nullif(p_address,''),updated_at=now() where id=p_id returning * into updated;
 update public.invoice_drafts set customer=customer||jsonb_build_object('contactId',updated.id,'name',updated.name,'email',coalesce(updated.email,''),'phone',coalesce(updated.phone,''),'address',coalesce(updated.address,'')),updated_at=now()
 where status='draft' and (customer->>'contactId'=p_id::text or (coalesce(previous.email,'')<>'' and lower(customer->>'email')=lower(previous.email)));
 return to_jsonb(updated);
end; $$;
revoke all on function public.update_invoice_customer_contact(uuid,timestamptz,text,text,text,text) from public,anon,authenticated;
grant execute on function public.update_invoice_customer_contact(uuid,timestamptz,text,text,text,text) to service_role;
