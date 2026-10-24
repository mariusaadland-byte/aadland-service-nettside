-- Optional OAuth authorization storage for Systima. No accounting records are imported.
-- Ciphertext is produced server-side using AES-256-GCM; encryption key never enters DB.
create table if not exists public.systima_oauth_connections(
 integration_key text primary key check(integration_key='systima'),
 encrypted_credentials text not null,
 authorized_at timestamptz not null default now(),
 authorized_by uuid not null,
 connection_state text not null default 'token_obtained_no_read_endpoint'
  check(connection_state in ('token_obtained_no_read_endpoint')),
 updated_at timestamptz not null default now()
);
alter table public.systima_oauth_connections enable row level security;
revoke all on public.systima_oauth_connections from public,anon,authenticated;
grant select,insert,update on public.systima_oauth_connections to service_role;
comment on table public.systima_oauth_connections is
 'Encrypted OAuth credentials only; no voucher import and no public REST access. Read-only supplier API mapping must be verified before use.';
