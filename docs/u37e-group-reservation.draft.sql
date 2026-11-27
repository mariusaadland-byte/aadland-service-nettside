-- ISOLATED DATABASE DESIGN DRAFT ONLY. NOT AN APPLYABLE MIGRATION.
-- Requires U-37 A/B schema in disposable database; supersedes U-37C schema draft.
-- Rollback intentionally preserves live data. No callable order RPC.
begin;
create table public.rental_order_groups (
 id uuid primary key default gen_random_uuid(),
 order_number bigint generated always as identity unique,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 quote_digest text not null check(quote_digest ~ '^[0-9a-f]{64}$'),
 quote_snapshot jsonb not null check(jsonb_typeof(quote_snapshot)='object'),
 terms_version text not null,
 rental_ore integer not null check(rental_ore>=0),
 sales_ore integer not null check(sales_ore>=0),
 deposit_ore integer not null check(deposit_ore>=0),
 payable_ore integer not null check(payable_ore>0),
 status text not null default 'held' check(status in ('held','payment_pending','confirmed','released','fulfilled','review')),
 expires_at timestamptz not null,
 payment_reference text unique,
 created_at timestamptz not null default now(),
 unique(customer_user_id,request_id),
 check(payable_ore::bigint=rental_ore::bigint+sales_ore),
 check(payable_ore::bigint+deposit_ore<=2147483647)
);
-- One existing rental booking per physical unit. Child writers and readers need
-- group awareness BEFORE enabling. Do not populate these columns in live.
alter table public.rental_bookings add column group_id uuid references public.rental_order_groups(id) on delete restrict;
alter table public.rental_bookings add column group_unit integer check(group_unit>0);
alter table public.rental_bookings add constraint rental_group_unit_pair check((group_id is null)=(group_unit is null));
create unique index rental_group_unit_unique on public.rental_bookings(group_id,rental_item_id,group_unit) where group_id is not null;
alter table public.rental_consumables add column reserved_quantity integer not null default 0 check(reserved_quantity between 0 and stock_quantity);
create table public.rental_group_goods (
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 consumable_id uuid not null references public.rental_consumables(id) on delete restrict,
 sku text not null, name text not null,
 quantity integer not null check(quantity between 1 and 100),
 unit_ore integer not null check(unit_ore>0),
 primary key(group_id,consumable_id)
);
create table public.rental_group_events(
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 event text not null check(event in ('reserve','payment_start','confirm','release','fulfill')),
 source_reference text not null check(length(source_reference) between 1 and 200),
 created_at timestamptz not null default now(),
 primary key(group_id,event)
);
alter table public.rental_order_groups enable row level security;
alter table public.rental_group_goods enable row level security;
alter table public.rental_group_events enable row level security;
revoke all on public.rental_order_groups,public.rental_group_goods,public.rental_group_events from public,anon,authenticated,service_role;
revoke all on sequence public.rental_order_groups_order_number_seq from public,anon,authenticated,service_role;
-- Activation requires shared capacity guards, group-aware payment/expiry,
-- atomic create/release RPC and isolated integration tests.
rollback;
