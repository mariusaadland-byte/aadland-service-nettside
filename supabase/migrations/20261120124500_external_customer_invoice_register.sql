-- External issued invoice archive: a TRACKING REGISTER only.
-- These records never join native invoice issuance, MVA totals or Tripletex exports.
create table if not exists public.external_customer_invoices (
 id uuid primary key default gen_random_uuid(),
 source_system text not null check (length(btrim(source_system)) between 1 and 100),
 invoice_number text not null check (length(btrim(invoice_number)) between 1 and 90),
 customer_name text not null check (length(btrim(customer_name)) between 1 and 160),
 issued_on date not null,
 due_on date not null,
 amount_ore bigint not null check (amount_ore > 0 and amount_ore <= 100000000000),
 note text not null default '' check (length(note)<=500),
 status text not null default 'unpaid' check (status in ('unpaid','paid')),
 paid_on date,
 payment_note text not null default '' check (length(payment_note)<=500),
 paid_at timestamptz,
 paid_by uuid,
 storage_path text not null unique,
 original_filename text not null,
 mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size integer not null check (file_size between 12 and 4194304),
 sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint external_invoice_valid_dates check (issued_on >= '2000-01-01' and due_on>=issued_on),
 constraint external_invoice_payment_complete check (
  (status='unpaid' and paid_on is null and paid_at is null and paid_by is null)
  or (status='paid' and paid_on is not null and paid_at is not null and paid_by is not null)
 )
);
create unique index if not exists external_customer_invoices_source_number_uq
 on public.external_customer_invoices(lower(btrim(source_system)),lower(btrim(invoice_number)));
create index if not exists external_customer_invoices_due_status_idx
 on public.external_customer_invoices(status,due_on);
alter table public.external_customer_invoices enable row level security;
revoke all on public.external_customer_invoices from public, anon, authenticated;
grant select,insert,update on public.external_customer_invoices to service_role;
comment on table public.external_customer_invoices is
'Private owner-only document and manual payment register for invoices issued elsewhere. NOT bookkeeping, NOT native invoicing, and excluded from MVA/Tripletex automatic exports.';
