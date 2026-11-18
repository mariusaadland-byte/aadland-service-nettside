-- A staged export is NOT proof that Tripletex imported the invoice.
-- The owner must confirm the resulting Tripletex invoice explicitly.
create table if not exists public.invoice_tripletex_transfers(
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null unique references public.invoice_drafts(id) on delete restrict,
 import_number bigint not null unique check(import_number between 10001 and 999999999),
 batch_id uuid not null,
 status text not null default 'prepared' check(status in ('prepared','confirmed')),
 original_invoice_number text not null,
 original_issued_date date not null,
 snapshot_gross_ore bigint not null check(snapshot_gross_ore>=0),
 snapshot_paid_ore bigint not null check(snapshot_paid_ore>=0),
 payment_source text not null check(payment_source in ('none','vipps','other')),
 payment_type_import_id text,
 prepared_by uuid not null,
 prepared_at timestamptz not null default now(),
 confirmed_by uuid,
 confirmed_at timestamptz,
 constraint invoice_tripletex_confirm_required check(
  (status='prepared' and confirmed_by is null and confirmed_at is null) or
  (status='confirmed' and confirmed_by is not null and confirmed_at is not null)
 )
);
create index if not exists invoice_tripletex_transfers_batch_idx
 on public.invoice_tripletex_transfers(batch_id,status);
alter table public.invoice_tripletex_transfers enable row level security;
revoke all on public.invoice_tripletex_transfers from public,anon,authenticated;
grant select,insert,update on public.invoice_tripletex_transfers to service_role;
comment on table public.invoice_tripletex_transfers is
 'Prepared means CSV was made available but Tripletex did NOT confirm receipt. Confirmed means OWNER ATTESTED successful invoice import, not independently API-verified.';
