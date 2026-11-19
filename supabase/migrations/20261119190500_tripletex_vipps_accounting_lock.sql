-- Cross-workflow serialization: a fee-only voucher and a later payout
-- voucher must never be posted using stale fee offsets concurrently.
-- Keep lock if provider returned an ambiguous write; no automatic expiry.
create table if not exists public.tripletex_vipps_accounting_lock (
 environment text not null check(environment in ('test','production')),
 unit text not null check(unit in ('service','rental')),
 token uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(environment,unit)
);
alter table public.tripletex_vipps_accounting_lock enable row level security;
revoke all on public.tripletex_vipps_accounting_lock from anon,authenticated;
comment on table public.tripletex_vipps_accounting_lock is
'Exclusive service-role accounting write lock. Ambiguous Tripletex writes require manual review before release.';
