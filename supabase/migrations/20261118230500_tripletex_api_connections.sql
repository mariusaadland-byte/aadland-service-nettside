-- Tripletex credentials: encrypted with AES-256-GCM and server-held key.
-- Only service_role may access; no client or anonymous SQL access.
create table if not exists public.tripletex_api_connections(
 id text primary key check(id='primary'),
 ciphertext text not null,
 nonce text not null,
 tag text not null,
 environment text not null check(environment in ('production','test')),
 verified_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.tripletex_api_connections enable row level security;
revoke all on public.tripletex_api_connections from public,anon,authenticated;
grant select,insert,update,delete on public.tripletex_api_connections to service_role;
comment on table public.tripletex_api_connections is
 'Owner-managed Tripletex JWT refresh credential, encrypted server-side. Never return ciphertext or token to frontend.';
