-- Fakturakunde/kreditt for utleie. E-post er nøkkel slik at også gjestekunder kan få kredittvilkår.
create table if not exists public.customer_billing_profiles (
  email text primary key,
  invoice_customer boolean not null default false,
  credit_limit_ore bigint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credit_limit_ore is null or credit_limit_ore >= 0)
);

alter table public.customer_billing_profiles enable row level security;
revoke all on table public.customer_billing_profiles from anon, authenticated;
grant select,insert,update,delete on table public.customer_billing_profiles to service_role;
