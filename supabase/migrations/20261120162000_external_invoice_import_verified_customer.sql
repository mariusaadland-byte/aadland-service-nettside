-- Preserve a verified Tripletex customer identity throughout CSV import.
-- This project has no prepared external invoices at migration time.
alter table public.external_invoice_tripletex_imports
 add column if not exists snapshot_contact_id uuid references public.admin_customer_contacts(id),
 add column if not exists tripletex_customer_id bigint,
 add column if not exists tripletex_customer_number bigint,
 add column if not exists snapshot_customer_name text;
alter table public.external_invoice_tripletex_imports
 add constraint xit_verified_customer check (
  snapshot_contact_id is not null and
  tripletex_customer_id > 0 and
  tripletex_customer_number > 0 and
  length(btrim(snapshot_customer_name)) between 1 and 180
 );
comment on column public.external_invoice_tripletex_imports.tripletex_customer_number is
'Customer number verified by a read-only GET /customer/{id} immediately before preparing CSV. Not a guessed local customer number.';
