-- Samlet utleiemigrasjon. Kan kjøres senere i Supabase SQL Editor.
create table if not exists public.rental_items (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, description text,
 image_urls jsonb not null default '[]'::jsonb, status text not null default 'available' check (status in ('available','unavailable','hidden','maintenance')),
 quantity integer not null default 1 check (quantity > 0), daily_price_ore integer not null default 0, weekend_price_ore integer, weekly_price_ore integer,
 long_term_days integer, long_term_discount_percent numeric(5,2) not null default 0, deposit_ore integer not null default 0, buffer_days integer not null default 0,
 delivery_available boolean not null default false, pickup_available boolean not null default true, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rental_blocks (
 id uuid primary key default gen_random_uuid(), rental_item_id uuid not null references public.rental_items(id) on delete cascade,
 start_date date not null, end_date date not null, reason text, created_at timestamptz not null default now(), check (end_date >= start_date)
);
create table if not exists public.rental_bookings (
 id uuid primary key default gen_random_uuid(), booking_number text not null unique, rental_item_id uuid not null references public.rental_items(id),
 customer jsonb not null default '{}'::jsonb, start_date date not null, end_date date not null,
 status text not null default 'new' check(status in ('new','confirmed','active','returned','completed','cancelled')),
 price_snapshot jsonb not null default '{}'::jsonb, total_ore integer not null default 0, deposit_ore integer not null default 0,
 payment_status text not null default 'unpaid', deposit_status text not null default 'not_paid', admin_note text, terms_version text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_date >= start_date)
);
alter table public.rental_bookings add column if not exists payment_status text not null default 'unpaid';
alter table public.rental_bookings add column if not exists deposit_status text not null default 'not_paid';
alter table public.rental_bookings add column if not exists admin_note text;
alter table public.rental_items enable row level security; alter table public.rental_blocks enable row level security; alter table public.rental_bookings enable row level security;
grant select,insert,update,delete on public.rental_items to service_role; grant select,insert,update,delete on public.rental_blocks to service_role; grant select,insert,update,delete on public.rental_bookings to service_role;
create index if not exists rental_blocks_item_dates_idx on public.rental_blocks(rental_item_id,start_date,end_date);
create index if not exists rental_bookings_item_dates_idx on public.rental_bookings(rental_item_id,start_date,end_date);
create index if not exists rental_bookings_status_idx on public.rental_bookings(status);
