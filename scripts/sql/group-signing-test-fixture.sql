-- Only for a disposable PostgreSQL instance; never use a Supabase project.
do $$ begin
 if current_database()<>'aadland_signing_test' then raise exception 'WRONG_DATABASE'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
-- Minimal legacy schema fixture: columns used by U-37F, not a production clone.
create table public.rental_items(
 id uuid primary key,name text not null,quantity integer not null check(quantity>0),
 daily_price_ore integer not null,weekend_price_ore integer,weekly_price_ore integer,
 long_term_days integer,long_term_discount_percent numeric not null default 0,
 deposit_ore integer not null default 0,buffer_days integer not null default 0,
 active boolean not null default true,pickup_available boolean not null default true,
 status text not null default 'available'
);
create table public.rental_blocks(
 id uuid primary key default gen_random_uuid(),rental_item_id uuid not null references public.rental_items(id),
 start_date date not null,end_date date not null
);
create table public.rental_bookings(
 id uuid primary key default gen_random_uuid(),booking_number text not null unique,
 rental_item_id uuid not null references public.rental_items(id),customer_user_id uuid references auth.users(id),
 customer jsonb not null,start_date date not null,end_date date not null,
 status text not null default 'new',price_snapshot jsonb not null,total_ore integer not null,deposit_ore integer not null,
 terms_version text,payment_due_at timestamptz,payment_status text not null default 'unpaid',
 payment_reference text,payment_captured_ore integer not null default 0,payment_reserved_ore integer not null default 0,
 updated_at timestamptz not null default clock_timestamp()
);
