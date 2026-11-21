-- S-06: Owner-maintained MVA term status must be traceable.
-- No statement is submitted to Skatteetaten or Tripletex by this migration.
-- Only future manually recorded "filed" states require an identifiable source and reference.
-- Allow an erroneous old status to be restored explicitly to "unverified"
-- without falsely labelling an unconfirmed term as not filed.
alter table public.vat_reporting_term_status
 drop constraint if exists vat_reporting_term_status_status_check;
alter table public.vat_reporting_term_status
 add constraint vat_reporting_term_status_status_check
 check (status in ('unverified','not_filed','preparing','filed'));
alter table public.vat_reporting_term_status
 add column if not exists verification_source text not null default 'owner_review';
alter table public.vat_reporting_term_status
 add constraint vat_term_verified_source_check
 check (verification_source in ('owner_review','skatteetaten','tripletex'));
alter table public.vat_reporting_term_status
 add constraint vat_term_filed_evidence_check
 check (
  status<>'filed' or (
    verification_source in ('skatteetaten','tripletex')
    and submission_reference is not null
    and length(btrim(submission_reference)) between 6 and 160
    and filed_on is not null
  )
 );

create table if not exists public.vat_reporting_term_events(
 id uuid primary key default gen_random_uuid(),
 year integer not null check(year between 2000 and 2100),
 term integer not null check(term between 1 and 6),
 status text not null check(status in ('unverified','not_filed','preparing','filed')),
 filed_on date,
 verification_source text not null check(verification_source in ('owner_review','skatteetaten','tripletex')),
 submission_reference text,
 notes text,
 confirmed_by uuid not null,
 recorded_at timestamptz not null default now(),
 check (status<>'filed' or (
  filed_on is not null and verification_source in ('skatteetaten','tripletex')
  and length(btrim(submission_reference)) between 6 and 160
 ))
);
create index if not exists vat_reporting_term_events_period_idx
 on public.vat_reporting_term_events(year,term,recorded_at desc);
alter table public.vat_reporting_term_events enable row level security;
revoke all on public.vat_reporting_term_events from public,anon,authenticated;
grant select,insert on public.vat_reporting_term_events to service_role;
comment on table public.vat_reporting_term_events is
 'Append-only, owner-confirmed status evidence; not a verified statement from the Norwegian Tax Administration.';

create or replace function public.log_vat_reporting_term_change()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.vat_reporting_term_events
 (year,term,status,filed_on,verification_source,submission_reference,notes,confirmed_by)
 values(new.year,new.term,new.status,new.filed_on,new.verification_source,
        new.submission_reference,new.notes,new.confirmed_by);
 return new;
end; $$;
drop trigger if exists log_vat_reporting_term_change on public.vat_reporting_term_status;
create trigger log_vat_reporting_term_change
 after insert or update on public.vat_reporting_term_status
 for each row execute function public.log_vat_reporting_term_change();
revoke execute on function public.log_vat_reporting_term_change()
 from public,anon,authenticated;
grant execute on function public.log_vat_reporting_term_change() to service_role;
