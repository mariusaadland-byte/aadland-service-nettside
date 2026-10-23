-- Full shared customer card settings for quotes and invoices.
-- Existing customers receive safe defaults; no issued invoices are changed.
alter table public.admin_customer_contacts
 add column if not exists customer_type text not null default 'private'
   check(customer_type in ('private','business')),
 add column if not exists organization_number text
   check(organization_number is null or organization_number ~ '^[0-9]{9}$'),
 add column if not exists contact_person text,
 add column if not exists internal_note text,
 add column if not exists preferred_payment_method text not null default 'bank'
   check(preferred_payment_method in ('bank','vipps'));

-- Keep the old RPC for backwards compatibility with other admin workflows.
-- The new function updates contact data/linked *drafts* atomically, then
-- persists extended internal preferences on the same customer card.
create or replace function public.update_invoice_customer_card_v2(
 p_id uuid,
 p_expected_updated_at timestamptz,
 p_name text,
 p_email text,
 p_phone text,
 p_address text,
 p_payment_terms_days integer,
 p_customer_type text,
 p_organization_number text,
 p_contact_person text,
 p_internal_note text,
 p_preferred_payment_method text
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if p_customer_type not in ('private','business') then
  raise exception 'Ugyldig kundetype.';
 end if;
 if p_organization_number is not null
    and p_organization_number !~ '^[0-9]{9}$' then
  raise exception 'Organisasjonsnummer må være 9 sifre.';
 end if;
 if p_preferred_payment_method not in ('bank','vipps') then
  raise exception 'Ugyldig betalingsmåte.';
 end if;
 if length(coalesce(p_contact_person,''))>180 or length(coalesce(p_internal_note,''))>1000 then
  raise exception 'Kundeopplysningene er for lange.';
 end if;
 result:=public.update_invoice_customer_contact_terms(
  p_id,p_expected_updated_at,p_name,p_email,p_phone,p_address,p_payment_terms_days
 );
 update public.admin_customer_contacts
 set customer_type=p_customer_type,
     organization_number=nullif(p_organization_number,''),
     contact_person=nullif(p_contact_person,''),
     internal_note=nullif(p_internal_note,''),
     preferred_payment_method=p_preferred_payment_method
 where id=p_id
 returning to_jsonb(admin_customer_contacts.*) into result;
 if result is null then raise exception 'Kundekortet finnes ikke.'; end if;
 return result;
end $$;

revoke all on function public.update_invoice_customer_card_v2(uuid,timestamptz,text,text,text,text,integer,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.update_invoice_customer_card_v2(uuid,timestamptz,text,text,text,text,integer,text,text,text,text,text)
 to service_role;
