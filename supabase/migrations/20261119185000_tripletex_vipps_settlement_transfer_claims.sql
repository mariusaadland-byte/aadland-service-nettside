-- Unique, irrevocable settlement claims: never automatically retry an
-- ambiguous Tripletex voucher creation. Only server service_role may access.
create table if not exists public.tripletex_vipps_settlement_transfers (
 id uuid primary key default gen_random_uuid(),
 environment text not null check (environment in ('test','production')),
 unit text not null check (unit in ('service','rental')),
 payout_psp_reference text not null,
 payout_date date not null,
 gross_ore bigint not null check (gross_ore > 0),
 fees_ore bigint not null check (fees_ore >= 0),
 payout_ore bigint not null check (payout_ore > 0),
 digest text not null,
 status text not null check (status in ('processing','confirmed','needs_review')),
 tripletex_voucher_id bigint,
 tripletex_customer_id bigint not null,
 bank_account_id bigint not null,
 fee_account_id bigint not null,
 customer_account_id bigint not null,
 error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 confirmed_at timestamptz,
 unique(environment,unit,payout_psp_reference),
 check (gross_ore=fees_ore+payout_ore)
);
create index if not exists tripletex_vipps_settlement_transfer_date_idx
on public.tripletex_vipps_settlement_transfers(payout_date desc);
alter table public.tripletex_vipps_settlement_transfers enable row level security;
revoke all on public.tripletex_vipps_settlement_transfers from anon,authenticated;
comment on table public.tripletex_vipps_settlement_transfers is
'One-time Vipps settlement voucher claims. Ambiguous provider outcomes must be manually reviewed, never automatically retried.';
