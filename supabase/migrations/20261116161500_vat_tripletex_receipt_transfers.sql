-- A receipt may be submitted to the Tripletex e-bilags inbox at most once
-- without an explicit manual audit. This table does NOT book an expense.
create table if not exists public.vat_tripletex_receipt_transfers(
 id uuid primary key default gen_random_uuid(),
 purchase_document_id uuid not null unique references public.vat_purchase_documents(id),
 recipient text not null check(length(recipient) between 7 and 254 and
   recipient ~* '^[a-z0-9._%+-]+@ebilag[.]com$'),
 status text not null check(status in ('sending','accepted','needs_review')),
 initiated_by uuid not null,
 attempted_at timestamptz not null default now(),
 provider_message_id text,
 accepted_at timestamptz,
 last_error text,
 constraint tripletex_accepted_requires_confirmation check(
  status<>'accepted' or (accepted_at is not null and provider_message_id is not null))
);
create index if not exists vat_tripletex_receipt_transfers_status_idx
 on public.vat_tripletex_receipt_transfers(status,attempted_at);
alter table public.vat_tripletex_receipt_transfers enable row level security;
revoke all on public.vat_tripletex_receipt_transfers from public,anon,authenticated;
grant select,insert,update on public.vat_tripletex_receipt_transfers to service_role;
comment on table public.vat_tripletex_receipt_transfers is
 'Audit of user-initiated e-bilags inbox sends. Accepted means Resend accepted the email, NOT that Tripletex received or booked the voucher.';
