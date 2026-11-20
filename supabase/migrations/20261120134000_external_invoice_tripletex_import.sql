-- Import queue for PDFs originally issued in other systems.
-- CSV export is *not* proof of import. Users must verify the Tripletex result.
create table if not exists public.external_invoice_tripletex_imports (
 external_invoice_id uuid primary key references public.external_customer_invoices(id) on delete restrict,
 import_number bigint not null unique check (import_number between 10001 and 999999999),
 status text not null default 'prepared' check(status in ('prepared','confirmed','needs_review')),
 vat_rate integer not null check(vat_rate in (12,15,25)),
 base_ore bigint not null check(base_ore>0),
 vat_ore bigint not null check(vat_ore>=0),
 snapshot_gross_ore bigint not null check(snapshot_gross_ore>0),
 snapshot_sha256 text not null check(snapshot_sha256~'^[a-f0-9]{64}$'),
 snapshot_paid boolean not null,
 payment_type_import_id text check(payment_type_import_id is null or length(payment_type_import_id) between 1 and 32),
 prepared_by uuid not null,
 prepared_at timestamptz not null default now(),
 confirmed_by uuid,
 confirmed_at timestamptz,
 tripletex_invoice_id bigint,
 updated_at timestamptz not null default now(),
 constraint xit_confirmed check(
  (status<>'confirmed' and confirmed_by is null and confirmed_at is null)
  or (status='confirmed' and confirmed_by is not null and confirmed_at is not null and tripletex_invoice_id is not null)
 )
);
alter table public.external_invoice_tripletex_imports enable row level security;
revoke all on public.external_invoice_tripletex_imports from public, anon, authenticated;
grant select,insert,update on public.external_invoice_tripletex_imports to service_role;
comment on table public.external_invoice_tripletex_imports is
'One reviewed CSV import number per external issued invoice. Prepared is NOT imported; confirmed requires Tripletex read-only check.';
