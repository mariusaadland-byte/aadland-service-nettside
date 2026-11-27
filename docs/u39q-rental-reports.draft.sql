-- Draft only. Rental merchant daily report, separate from service cache.
begin;
create table public.rental_vipps_report_days(
 report_date date primary key,
 msn text not null check(msn ~ '^[0-9]{4,20}$'),
 ledger_id text not null check(ledger_id ~ '^[A-Za-z0-9_-]{1,80}$'),
 funds jsonb not null check(jsonb_typeof(funds)='array' and jsonb_array_length(funds)<=10000),
 fees jsonb not null check(jsonb_typeof(fees)='array' and jsonb_array_length(fees)<=10000),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 started_at timestamptz not null,
 checked_at timestamptz not null default clock_timestamp()
);
alter table public.rental_vipps_report_days enable row level security;
revoke all on public.rental_vipps_report_days from public,anon,authenticated,service_role;
create function public.draft_rental_report_store(p_msn text,p_ledger text,p_day date,p_funds jsonb,p_fees jsonb,p_digest text,p_started timestamptz)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old public.rental_vipps_report_days%rowtype;
begin
 perform pg_advisory_xact_lock(39017);
 if p_msn is null or p_msn !~ '^[0-9]{4,20}$' or p_ledger is null or p_ledger !~ '^[A-Za-z0-9_-]{1,80}$' or p_day is null or p_day>=(clock_timestamp() at time zone 'Europe/Oslo')::date or p_started is null or p_started>clock_timestamp()+interval '5 seconds' or p_started<clock_timestamp()-interval '10 minutes' or jsonb_typeof(p_funds) is distinct from 'array' or jsonb_typeof(p_fees) is distinct from 'array' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then return 'review';end if;
 if exists(select 1 from public.rental_vipps_report_days where msn<>p_msn or ledger_id<>p_ledger) then return 'review';end if;
 if exists(select 1 from jsonb_array_elements(p_funds) x where x->>'topic' is distinct from 'funds' or x->>'date' is distinct from p_day::text) or exists(select 1 from jsonb_array_elements(p_fees) x where x->>'topic' is distinct from 'fees' or x->>'date' is distinct from p_day::text) then return 'review';end if;
 select * into old from public.rental_vipps_report_days where report_date=p_day;
 if found and old.started_at>=p_started then return 'existing';end if;
 insert into public.rental_vipps_report_days(report_date,msn,ledger_id,funds,fees,fingerprint,started_at) values(p_day,p_msn,p_ledger,p_funds,p_fees,p_digest,p_started)
 on conflict(report_date) do update set funds=excluded.funds,fees=excluded.fees,fingerprint=excluded.fingerprint,started_at=excluded.started_at,checked_at=clock_timestamp();
 return 'stored';
end $$;
revoke all on function public.draft_rental_report_store(text,text,date,jsonb,jsonb,text,timestamptz) from public,anon,authenticated,service_role;
rollback;
