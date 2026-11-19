-- READ-ONLY invoice reconciliation: a confirmed CSV import is not enough to
-- assume an invoice exists. Save a verified Tripletex invoice ID before any
-- later payment synchronisation is even considered.
create table if not exists public.tripletex_invoice_api_links (
 invoice_id uuid primary key references public.invoice_drafts(id) on delete restrict,
 environment text not null check(environment in ('production','test')),
 tripletex_invoice_id bigint not null check(tripletex_invoice_id>0),
 tripletex_invoice_number bigint not null check(tripletex_invoice_number between 1 and 999999999),
 tripletex_customer_id bigint not null check(tripletex_customer_id>0),
 source_invoice_number text not null,
 invoice_date date not null,
 invoice_gross_ore bigint not null check(invoice_gross_ore>0),
 remote_outstanding_ore bigint not null check(remote_outstanding_ore>=0),
 local_outstanding_ore bigint not null check(local_outstanding_ore>=0),
 remote_is_credited boolean not null default false,
 last_checked_at timestamptz not null default now(),
 linked_at timestamptz not null default now(),
 unique(environment,tripletex_invoice_id),
 unique(environment,tripletex_invoice_number)
);
alter table public.tripletex_invoice_api_links enable row level security;
revoke all on public.tripletex_invoice_api_links from public,anon,authenticated;
grant select,insert,update on public.tripletex_invoice_api_links to service_role;
comment on table public.tripletex_invoice_api_links is
 'Verified invoice ID and READ-ONLY payment comparison. No payment or invoice writes to Tripletex.';
