-- Original PDFs for already imported external customer invoices.
-- Does not create invoices, payments or postings. One irreversible upload attempt
-- per external invoice; ambiguous results require manual review.
create table if not exists public.external_invoice_tripletex_pdf_attachments (
 external_invoice_id uuid primary key
  references public.external_customer_invoices(id) on delete restrict,
 tripletex_invoice_id bigint not null check (tripletex_invoice_id > 0),
 voucher_id bigint not null check (voucher_id > 0),
 original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null check (status in ('uploading','confirmed','needs_review')),
 uploaded_by uuid not null,
 started_at timestamptz not null default now(),
 confirmed_at timestamptz,
 constraint original_pdf_status_confirmed check (
  (status='confirmed' and confirmed_at is not null)
  or (status<>'confirmed' and confirmed_at is null)
 )
);
alter table public.external_invoice_tripletex_pdf_attachments enable row level security;
revoke all on public.external_invoice_tripletex_pdf_attachments from public,anon,authenticated;
grant select,insert,update on public.external_invoice_tripletex_pdf_attachments to service_role;
comment on table public.external_invoice_tripletex_pdf_attachments is
 'Immutable one-attempt lock for a private original PDF attached to an already booked external invoice voucher in Tripletex. Never automatically retry uncertain uploads.';
