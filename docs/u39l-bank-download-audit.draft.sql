-- Private owner download audit, draft only.
begin;
create table public.rental_group_bank_download_audit(
 id bigint generated always as identity primary key,
 group_id uuid not null,
 kind text not null,
 digest text not null,
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(group_id,kind,digest) references public.rental_group_bank_evidence(group_id,kind,digest)
);
alter table public.rental_group_bank_download_audit enable row level security;
revoke all on public.rental_group_bank_download_audit from public,anon,authenticated,service_role;
rollback;
