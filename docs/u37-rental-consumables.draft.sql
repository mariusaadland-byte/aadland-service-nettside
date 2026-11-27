-- DRAFT ONLY: do not apply to production. Review existing RLS and test in isolation.
create table public.rental_consumables (
 id uuid primary key default gen_random_uuid(),
 rental_item_id uuid not null references public.rental_items(id) on delete restrict,
 name text not null check (length(trim(name)) between 1 and 120),
 sku text not null unique check (length(trim(sku)) between 1 and 80),
 price_ore integer not null check (price_ore > 0),
 cost_ore integer check (cost_ore >= 0),
 stock_quantity integer not null default 0 check (stock_quantity >= 0),
 low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
 active boolean not null default false
);
alter table public.rental_consumables enable row level security;
revoke all on public.rental_consumables from public, anon, authenticated;
grant select on public.rental_consumables to service_role;
-- No client access. Future authorized admin mutation, atomic order allocation,
-- immutable sales snapshots and stock movement journal require separate review.
