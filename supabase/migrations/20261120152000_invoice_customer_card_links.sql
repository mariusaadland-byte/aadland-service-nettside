-- Link an already-issued native or externally imported invoice to a CRM customer
-- WITHOUT rewriting invoice snapshots or issuing another invoice.
create table if not exists public.invoice_customer_card_links (
 invoice_kind text not null check(invoice_kind in ('native','external')),
 invoice_id uuid not null,
 contact_id uuid not null references public.admin_customer_contacts(id) on delete restrict,
 linked_by uuid not null,
 linked_at timestamptz not null default now(),
 primary key(invoice_kind,invoice_id)
);
create index if not exists invoice_customer_card_links_contact_idx
 on public.invoice_customer_card_links(contact_id);
alter table public.invoice_customer_card_links enable row level security;
revoke all on public.invoice_customer_card_links from public,anon,authenticated;
grant select,insert on public.invoice_customer_card_links to service_role;
comment on table public.invoice_customer_card_links is
'Owner-only CRM link for existing invoices from Aadland Service and other systems. Never alters a sent invoice, MVA or accounting postings.';
