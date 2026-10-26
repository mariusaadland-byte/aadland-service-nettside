-- Preliminary public observation only, never a verified VAT effective date.
create table if not exists public.vat_registration_public_hint(
 id text primary key check(id='primary'),
 observed_date date not null,
 source_name text not null,
 source_url text not null,
 source_note text not null,
 confirmed_effective_date boolean not null default false
   check(confirmed_effective_date=false),
 recorded_at timestamptz not null default now()
);
alter table public.vat_registration_public_hint enable row level security;
revoke all on public.vat_registration_public_hint from public,anon,authenticated;
grant select on public.vat_registration_public_hint to service_role;
insert into public.vat_registration_public_hint
 (id,observed_date,source_name,source_url,source_note)
 values ('primary','2026-06-05','Søkfirma – offentlig endringshistorikk',
 'https://sokfirma.no/selskap/937781873/aadland-service',
 'MVA-status ble oppdatert fra Nei til Ja 5. juni 2026. Datoen er et forslag, ikke en bekreftet juridisk virkningsdato.')
 on conflict(id) do nothing;
