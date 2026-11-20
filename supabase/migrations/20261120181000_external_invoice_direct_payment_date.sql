-- Same single unique invoice import claim protects BOTH CSV and direct API paths.
-- No existing external imports existed when this migration was prepared.
alter table public.external_invoice_tripletex_imports
 drop constraint if exists external_invoice_tripletex_imports_status_check;
alter table public.external_invoice_tripletex_imports
 add constraint external_invoice_tripletex_imports_status_check
 check (status in ('prepared','processing','confirmed','needs_review'));
alter table public.external_invoice_tripletex_imports
 add column if not exists transfer_method text not null default 'csv'
 check (transfer_method in ('csv','api')),
 add column if not exists tripletex_invoice_number bigint,
 add column if not exists payment_status text not null default 'not_applicable'
 check (payment_status in ('not_applicable','pending','processing','confirmed','needs_review')),
 add column if not exists payment_date date,
 add column if not exists payment_type_id bigint,
 add column if not exists payment_confirmed_at timestamptz;
alter table public.external_invoice_tripletex_imports
 add constraint xit_api_payment_values check (
 (transfer_method='csv' and payment_status='not_applicable' and payment_date is null and payment_type_id is null)
 or (transfer_method='api' and (
  (snapshot_paid=false and payment_status='not_applicable' and payment_date is null and payment_type_id is null)
  or (snapshot_paid=true and payment_status<>'not_applicable' and payment_date is not null and payment_type_id>0)
 )));
create unique index if not exists xit_tripletex_invoice_id_unique
 on public.external_invoice_tripletex_imports(tripletex_invoice_id) where tripletex_invoice_id is not null;
comment on column public.external_invoice_tripletex_imports.payment_date is
'Original payment date from external_customer_invoices.paid_on, server-validated; never from a client-supplied payment-date field.';
