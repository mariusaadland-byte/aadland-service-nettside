-- Only for a disposable PostgreSQL instance; never use a Supabase project.
do $$ begin
 if current_database()<>'aadland_signing_test' then raise exception 'WRONG_DATABASE'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
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
