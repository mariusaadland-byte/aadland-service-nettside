-- Owner-maintained notes. NOT verified against the Tax Administration.
create table if not exists public.vat_reporting_profile(
 id text primary key check(id='primary'),
 registration_date date not null,
 first_term_year integer not null check(first_term_year between 2000 and 2100),
 first_term integer not null check(first_term between 1 and 6),
 confirmed_by uuid not null,
 updated_at timestamptz not null default now(),
 check(first_term_year=extract(year from registration_date)::integer),
 check(first_term=ceil(extract(month from registration_date)/2.0)::integer)
);
alter table public.vat_reporting_profile enable row level security;
revoke all on public.vat_reporting_profile from public,anon,authenticated;
grant select,insert,update on public.vat_reporting_profile to service_role;
create or replace function public.reject_vat_reporting_profile_delete()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 raise exception 'MVA-registreringsopplysninger kan ikke slettes.';
end $$;
revoke all on function public.reject_vat_reporting_profile_delete() from public,anon,authenticated;
drop trigger if exists reject_vat_reporting_profile_delete on public.vat_reporting_profile;
create trigger reject_vat_reporting_profile_delete before delete on public.vat_reporting_profile
 for each row execute function public.reject_vat_reporting_profile_delete();

create table if not exists public.vat_reporting_term_status(
 year integer not null check(year between 2000 and 2100),
 term integer not null check(term between 1 and 6),
 status text not null check(status in ('not_filed','preparing','filed')),
 filed_on date,
 submission_reference text check(length(submission_reference)<=160),
 notes text check(length(notes)<=500),
 confirmed_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(year,term),
 check((status='filed' and filed_on is not null) or (status<>'filed' and filed_on is null))
);
alter table public.vat_reporting_term_status enable row level security;
revoke all on public.vat_reporting_term_status from public,anon,authenticated;
grant select,insert,update on public.vat_reporting_term_status to service_role;
create or replace function public.reject_vat_reporting_term_delete()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 raise exception 'Bekreftet MVA-status kan ikke slettes. Endre statusen med ny bekreftelse.';
end $$;
revoke all on function public.reject_vat_reporting_term_delete() from public,anon,authenticated;
drop trigger if exists reject_vat_reporting_term_delete on public.vat_reporting_term_status;
create trigger reject_vat_reporting_term_delete before delete on public.vat_reporting_term_status
 for each row execute function public.reject_vat_reporting_term_delete();
