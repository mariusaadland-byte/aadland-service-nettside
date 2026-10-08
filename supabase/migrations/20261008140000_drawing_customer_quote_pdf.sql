-- Kunde opprettet direkte fra tegneprogrammet uten å opprette en Min side-konto.
create table if not exists public.admin_customer_contacts(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 email text,
 phone text,
 address text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists admin_customer_contacts_email_unique
 on public.admin_customer_contacts(lower(email)) where email is not null and email <> '';
alter table public.admin_customer_contacts enable row level security;
revoke all on public.admin_customer_contacts from anon,authenticated;
grant all on public.admin_customer_contacts to service_role;

alter table public.project_drawings
 add column if not exists customer_contact_id uuid references public.admin_customer_contacts(id) on delete set null;
create index if not exists project_drawings_customer_contact_idx on public.project_drawings(customer_contact_id);

alter table public.quotes
 add column if not exists drawing_ids uuid[] not null default '{}';
