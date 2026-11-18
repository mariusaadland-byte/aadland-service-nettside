-- Persistent, server-only Tripletex customer mappings and safe transfer claims.
-- A claim is written before any POST to Tripletex; uncertain outcomes must be checked,
-- never automatically retried. Both contacts and customer accounts can be linked.
create table if not exists public.tripletex_customer_links (
 source_type text not null check(source_type in ('contact','profile')),
 source_id uuid not null,
 environment text not null check(environment in ('production','test')),
 status text not null check(status in ('processing','linked','needs_review')),
 tripletex_customer_id bigint check(tripletex_customer_id is null or tripletex_customer_id>0),
 last_error text,
 linked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(source_type,source_id,environment),
 constraint tripletex_customer_link_status_check check(
   status<>'linked' or (tripletex_customer_id is not null and linked_at is not null)
 )
);
create index if not exists tripletex_customer_links_environment_status_idx
 on public.tripletex_customer_links(environment,status);
alter table public.tripletex_customer_links enable row level security;
revoke all on public.tripletex_customer_links from public,anon,authenticated;
grant select,insert,update,delete on public.tripletex_customer_links to service_role;
comment on table public.tripletex_customer_links is
 'Server-owned idempotency/mapping for Aadland Service to Tripletex customers; never retry uncertain POSTs.';
