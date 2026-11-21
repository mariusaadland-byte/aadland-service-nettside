-- S-05: proof of posting in Tripletex is distinct from Resend's email acceptance.
-- Record only a remotely queried, owner-reviewed voucher, not a created voucher.
create table if not exists public.vat_tripletex_receipt_reconciliations (
 purchase_document_id uuid primary key references public.vat_purchase_documents(id) on delete restrict,
 environment text not null check (environment in ('production','test')),
 tripletex_voucher_id bigint not null check (tripletex_voucher_id>0),
 voucher_year integer not null check (voucher_year between 2000 and 2100),
 voucher_number integer not null check (voucher_number>0),
 voucher_date date not null,
 supplier_document_number text not null check (length(supplier_document_number) between 1 and 180),
 original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
 vat_code text not null check (length(vat_code) between 1 and 50),
 account_code text not null check (length(account_code) between 3 and 20),
 owner_confirmation text not null check (length(owner_confirmation) between 12 and 1200),
 confirmed_supplier boolean not null check (confirmed_supplier),
 confirmed_total boolean not null check (confirmed_total),
 confirmed_vat_and_deduction boolean not null check (confirmed_vat_and_deduction),
 confirmed_original boolean not null check (confirmed_original),
 remotely_not_temporary boolean not null check (remotely_not_temporary),
 confirmed_no_duplicate boolean not null check (confirmed_no_duplicate),
 status text not null default 'owner_verified_booked'
  check(status='owner_verified_booked'),
 verified_by uuid not null references public.admin_users(id),
 verified_at timestamptz not null default now(),
 remote_checked_at timestamptz not null default now(),
 constraint unique_tripletex_receipt_voucher unique (environment,tripletex_voucher_id)
);
create index if not exists vat_tripletex_receipt_reconciliations_checked_idx
 on public.vat_tripletex_receipt_reconciliations(verified_at desc);
alter table public.vat_tripletex_receipt_reconciliations enable row level security;
revoke all on public.vat_tripletex_receipt_reconciliations from public,anon,authenticated;
grant select,insert on public.vat_tripletex_receipt_reconciliations to service_role;
comment on table public.vat_tripletex_receipt_reconciliations is
 'Immutable owner audit of an individually checked remote Tripletex voucher; this does not book a voucher, validate tax law, or imply an e-bilag receipt was booked automatically.';
