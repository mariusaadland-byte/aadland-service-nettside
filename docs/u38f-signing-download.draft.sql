-- Isolated design draft only. Requires U-38D schema. No grants or live migration.
begin;
create table public.aadland_signing_download_audit(
 id bigint generated always as identity primary key,
 agreement_id uuid not null references public.aadland_agreements(id) on delete restrict,
 actor_id uuid not null,
 actor_kind text not null check(actor_kind in ('owner','customer')),
 document_kind text not null check(document_kind in ('avtale','bevis')),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.aadland_signing_download_audit enable row level security;
revoke all on public.aadland_signing_download_audit from public,anon,authenticated,service_role;
revoke all on sequence public.aadland_signing_download_audit_id_seq from public,anon,authenticated,service_role;
-- Future reviewed server grant: insert only on audit; restricted reads elsewhere.
rollback;
