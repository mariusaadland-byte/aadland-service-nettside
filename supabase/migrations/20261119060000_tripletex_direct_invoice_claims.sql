-- Controlled one-invoice pilot. A POST to Tripletex is irreversible.
-- One persistent claim per local invoice; unknown outcomes are never re-submitted.
create table if not exists public.tripletex_direct_invoice_claims(
 invoice_id uuid primary key references public.invoice_drafts(id) on delete restrict,
 environment text not null check(environment in ('production','test')),
 status text not null check(status in ('processing','confirmed','needs_review')),
 source_number text not null,
 issued_date date not null,
 snapshot_gross_ore bigint not null check(snapshot_gross_ore>0),
 snapshot_digest text not null check(length(snapshot_digest)=64),
 tripletex_invoice_id bigint check(tripletex_invoice_id is null or tripletex_invoice_id>0),
 tripletex_invoice_number bigint check(tripletex_invoice_number is null or tripletex_invoice_number>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 confirmed_at timestamptz,
 error_code text,
 constraint direct_invoice_confirmation_check check(
  status<>'confirmed' or
  (tripletex_invoice_id is not null and tripletex_invoice_number is not null and confirmed_at is not null)
 )
);
create unique index if not exists tripletex_direct_invoice_id_unique
 on public.tripletex_direct_invoice_claims(environment,tripletex_invoice_id)
 where tripletex_invoice_id is not null;
create unique index if not exists tripletex_direct_invoice_number_unique
 on public.tripletex_direct_invoice_claims(environment,tripletex_invoice_number)
 where tripletex_invoice_number is not null;
alter table public.tripletex_direct_invoice_claims enable row level security;
revoke all on public.tripletex_direct_invoice_claims from public,anon,authenticated;
grant select,insert,update on public.tripletex_direct_invoice_claims to service_role;
comment on table public.tripletex_direct_invoice_claims is
 'One explicit owner-confirmed API invoice creation, never auto-retry an unknown provider outcome.';
