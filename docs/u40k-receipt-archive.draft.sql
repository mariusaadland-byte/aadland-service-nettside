-- Review only; not a production migration.
begin;
create table public.rental_receipt_archive (
 identity text primary key check (identity ~ '^[a-f0-9]{64}$'),
 group_id uuid not null references public.rental_order_groups(id),
 kind text not null check (kind in ('payment','deposit','deposit_refund')),
 event_id text not null check (length(event_id) between 1 and 200),
 document_number bigint generated always as identity unique,
 amount_ore bigint not null check (amount_ore > 0),
 currency text not null check (currency = 'NOK'),
 payment_reference text not null check (length(payment_reference) between 1 and 200),
 confirmed_at timestamptz not null,
 document_bytes bytea not null check (octet_length(document_bytes) between 16 and 1048576 and substring(document_bytes from 1 for 5)=convert_to('%PDF-','UTF8')),
 document_digest text not null check (document_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(group_id,kind,event_id)
);
alter table public.rental_receipt_archive enable row level security;
revoke all on public.rental_receipt_archive from public,anon,authenticated,service_role;
create index rental_receipt_archive_group_idx on public.rental_receipt_archive(group_id,created_at);
-- Separate append-only delivery history; no automatic retry of ambiguous sends.
create table public.rental_receipt_delivery_history (
 id bigint generated always as identity primary key,
 receipt_identity text not null references public.rental_receipt_archive(identity),
 state text not null check (state in ('pending','claimed','accepted','review')),
 provider_id text,
 created_at timestamptz not null default now(),
 check (state <> 'accepted' or provider_id is not null)
);
alter table public.rental_receipt_delivery_history enable row level security;
revoke all on public.rental_receipt_delivery_history from public,anon,authenticated,service_role;
-- No grants until trusted evidence, transactional number allocation, digest verification,
-- authorization, and isolated concurrency tests are implemented.
rollback;
