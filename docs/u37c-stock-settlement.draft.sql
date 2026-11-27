-- DESIGN DRAFT ONLY, NOT A MIGRATION. Requires U-37/A/B and the U-31 atomic group-order model.
-- Do not run on production or expose an RPC yet. The group FK and payment proof
-- source must be defined together with group booking creation.
begin;
alter table public.rental_consumables add column reserved_quantity integer not null default 0;
alter table public.rental_consumables add constraint rental_consumables_reserved_range
 check(reserved_quantity between 0 and stock_quantity);
-- stock_quantity is physical on-hand; available is stock_quantity-reserved_quantity.
-- Existing U-37 quote/page and U-37B admin list must switch to available for sale.
-- Existing U-37B manual adjustment must reject on-hand below reserved (constraint
-- protects the row even before a clearer application error is implemented).
create table public.rental_consumable_order_holds (
 group_id uuid primary key, -- REQUIRED: add FK to actual group-order model before activation
 state text not null check(state in ('held','confirmed','released','fulfilled')),
 expires_at timestamptz not null,
 gross_ore integer not null check(gross_ore>0),
 created_at timestamptz not null default now()
);
create table public.rental_consumable_order_lines (
 group_id uuid not null references public.rental_consumable_order_holds(group_id) on delete restrict,
 consumable_id uuid not null references public.rental_consumables(id) on delete restrict,
 sku text not null, name text not null,
 quantity integer not null check(quantity between 1 and 100),
 unit_ore integer not null check(unit_ore>0),
 primary key(group_id,consumable_id)
);
create table public.rental_consumable_order_events (
 group_id uuid not null references public.rental_consumable_order_holds(group_id) on delete restrict,
 event text not null check(event in ('reserve','confirm','release','fulfill')),
 source_reference text not null check(length(source_reference) between 1 and 200),
 created_at timestamptz not null default now(),
 primary key(group_id,event)
);
alter table public.rental_consumable_order_holds enable row level security;
alter table public.rental_consumable_order_lines enable row level security;
alter table public.rental_consumable_order_events enable row level security;
revoke all on public.rental_consumable_order_holds,public.rental_consumable_order_lines,public.rental_consumable_order_events from public,anon,authenticated,service_role;
-- No service write access, no callable RPC, until the complete group transaction
-- is reviewed. This candidate is a schema contract only.
rollback;
