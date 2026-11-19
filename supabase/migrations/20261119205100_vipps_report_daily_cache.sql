-- Server-owned Vipps Report API snapshots. This is a read-only report cache,
-- NOT a sales ledger and never an instruction to create Tripletex vouchers.
create table if not exists public.vipps_report_daily_cache (
 unit text not null check(unit in ('service','rental')),
 ledger_id text not null check(length(ledger_id) between 1 and 80),
 report_date date not null,
 funds jsonb not null check(jsonb_typeof(funds)='array'),
 fees jsonb not null check(jsonb_typeof(fees)='array'),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 checked_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 schema_version integer not null default 1 check(schema_version=1),
 primary key (unit,ledger_id,report_date)
);
create index if not exists vipps_report_daily_cache_unit_date_idx
 on public.vipps_report_daily_cache(unit,report_date desc);
alter table public.vipps_report_daily_cache enable row level security;
revoke all on public.vipps_report_daily_cache from anon,authenticated;
comment on table public.vipps_report_daily_cache is
 'One row per merchant/ledger/day. Vipps Report API funds and fees cached as validated JSON. Only service_role can access; never posts accounts.';
