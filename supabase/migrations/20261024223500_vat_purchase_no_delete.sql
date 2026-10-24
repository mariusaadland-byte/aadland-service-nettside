-- Keep audit history for all manually confirmed supplier VAT entries.
-- Owner can void a wrong record with reason, never silently delete it.
create or replace function public.prevent_vat_purchase_document_delete()
returns trigger language plpgsql set search_path=pg_catalog,public as $body$
begin
 raise exception 'Godkjente MVA-bilag kan ikke slettes. Opphev registreringen med begrunnelse.';
end;$body$;
revoke all on function public.prevent_vat_purchase_document_delete() from public,anon,authenticated;
drop trigger if exists prevent_vat_purchase_document_delete on public.vat_purchase_documents;
create trigger prevent_vat_purchase_document_delete before delete on public.vat_purchase_documents
for each row execute function public.prevent_vat_purchase_document_delete();
