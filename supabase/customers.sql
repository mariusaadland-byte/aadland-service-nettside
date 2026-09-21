-- Kundekonto / Min side. FORBEREDT migrasjon – ikke kjørt automatisk.
create table if not exists public.customer_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 name text,
 phone text,
 address text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.rental_bookings add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
create index if not exists orders_customer_user_idx on public.orders(customer_user_id,created_at desc);
create index if not exists rental_bookings_customer_user_idx on public.rental_bookings(customer_user_id,created_at desc);
alter table public.customer_profiles enable row level security;
grant select,insert,update,delete on public.customer_profiles to service_role;
