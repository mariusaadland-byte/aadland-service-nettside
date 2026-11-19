-- Baseline for an invoice that has been reconciled BOTH locally and remotely.
-- Never reset this baseline when only one side has changed.
alter table public.tripletex_invoice_api_links
 add column if not exists matched_outstanding_ore bigint
  check(matched_outstanding_ore is null or matched_outstanding_ore>=0),
 add column if not exists matched_at timestamptz;
update public.tripletex_invoice_api_links
 set matched_outstanding_ore=local_outstanding_ore,matched_at=last_checked_at
 where matched_at is null and local_outstanding_ore=remote_outstanding_ore;

-- Immutable per-local-payment claim, plus remote confirmation/uncertainty state.
create table if not exists public.tripletex_payment_transfers(
 payment_id uuid primary key references public.invoice_payments(id) on delete restrict,
 invoice_id uuid not null references public.invoice_drafts(id) on delete restrict,
 environment text not null check(environment in ('production','test')),
 tripletex_invoice_id bigint not null check(tripletex_invoice_id>0),
 payment_type_id bigint not null check(payment_type_id>0),
 payment_date date not null,
 amount_ore bigint not null check(amount_ore>0),
 status text not null check(status in ('processing','confirmed','needs_review')),
 outstanding_before_ore bigint not null check(outstanding_before_ore>=0),
 outstanding_after_ore bigint check(outstanding_after_ore is null or outstanding_after_ore>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 confirmed_at timestamptz,
 error_code text,
 constraint tripletex_payment_confirmed_check
  check(status<>'confirmed' or (confirmed_at is not null and outstanding_after_ore is not null))
);
-- At most one in-flight or unknown payment per invoice; do not auto-retry.
create unique index if not exists tripletex_payment_one_unresolved_invoice
 on public.tripletex_payment_transfers(invoice_id)
 where status in ('processing','needs_review');
create index if not exists tripletex_payment_invoice_status
 on public.tripletex_payment_transfers(invoice_id,status);
alter table public.tripletex_payment_transfers enable row level security;
revoke all on public.tripletex_payment_transfers from public,anon,authenticated;
grant select,insert,update on public.tripletex_payment_transfers to service_role;
comment on table public.tripletex_payment_transfers is
 'One claim per local payment; unknown remote writes require manual reconciliation. Never retry automatically.';
