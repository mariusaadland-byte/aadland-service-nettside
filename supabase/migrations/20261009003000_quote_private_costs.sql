-- Confidential offer costs, never part of the customer quote record or PDF.
create table if not exists public.quote_internal_costs (
 quote_id uuid primary key references public.quotes(id) on delete cascade,
 line_costs jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 constraint quote_internal_costs_object check (jsonb_typeof(line_costs)='object')
);
create index if not exists quote_internal_costs_updated_idx on public.quote_internal_costs(updated_at desc);
alter table public.quote_internal_costs enable row level security;
revoke all on table public.quote_internal_costs from public, anon, authenticated;
grant select,insert,update,delete on table public.quote_internal_costs to service_role;
comment on table public.quote_internal_costs is 'PRIVATE internal per-line estimated cost in øre exclusive of VAT. Server admin routes only; NEVER expose to customer-facing services or document generation.';
