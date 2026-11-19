-- Vipps fees deducted from the funds ledger even without a bank payout.
-- Each fee-retained event may be used only once; retry of uncertain writes is blocked.
create table if not exists public.tripletex_vipps_fee_transfers (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('test','production')),
  unit text not null check (unit in ('service','rental')),
  ledger_id text not null,
  fee_psp_reference text not null,
  ledger_date date not null,
  amount_ore bigint not null check (amount_ore>0),
  fee_entry_digest text not null,
  customer_id bigint not null,
  customer_account_id bigint not null,
  fee_account_id bigint not null,
  status text not null check (status in ('processing','confirmed','needs_review')),
  tripletex_voucher_id bigint,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique(environment,unit,ledger_id,fee_psp_reference)
);
create index if not exists tripletex_vipps_fee_transfers_date_idx
 on public.tripletex_vipps_fee_transfers(ledger_date desc);
alter table public.tripletex_vipps_fee_transfers enable row level security;
revoke all on public.tripletex_vipps_fee_transfers from anon,authenticated;
comment on table public.tripletex_vipps_fee_transfers is
'Actual Vipps funds-ledger fees-retained event posted against settlement customer without a bank payout; unknown outcome is never auto-retried.';
