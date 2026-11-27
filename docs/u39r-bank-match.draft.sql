-- Isolated draft only; bank evidence is an owner attestation, not bank API verification.
begin;
create table public.rental_vipps_bank_matches(
 payout_psp text primary key check(length(payout_psp) between 1 and 120),
 report_date date not null references public.rental_vipps_report_days(report_date),
 report_digest text not null check(report_digest ~ '^[a-f0-9]{64}$'),
 msn text not null,
 ledger_id text not null,
 amount_ore integer not null check(amount_ore>0),
 bank_date date not null,
 bank_reference text not null unique check(length(bank_reference) between 1 and 200),
 proof_digest text not null unique check(proof_digest ~ '^[a-f0-9]{64}$'),
 image_bytes bytea not null check(octet_length(image_bytes) between 32 and 2097152 and substring(image_bytes from 1 for 3)=decode('ffd8ff','hex')),
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 check(proof_digest=encode(sha256(image_bytes),'hex'))
);
alter table public.rental_vipps_bank_matches enable row level security;
revoke all on public.rental_vipps_bank_matches from public,anon,authenticated,service_role;
create function public.draft_rental_bank_match(p_day date,p_digest text,p_msn text,p_ledger text,p_psp text,p_amount integer,p_bank_day date,p_bank_ref text,p_proof text,p_bytes bytea,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.rental_vipps_report_days%rowtype; m public.rental_vipps_bank_matches%rowtype;
begin
 perform pg_advisory_xact_lock(39017);
 if p_actor is null or p_amount is null or p_amount<=0 or p_psp is null or length(trim(p_psp)) not between 1 and 120 or p_bank_ref is null or length(trim(p_bank_ref)) not between 1 and 200 or p_bank_day is null or p_bank_day<p_day or p_bank_day>(clock_timestamp() at time zone 'Europe/Oslo')::date or p_bytes is null or octet_length(p_bytes) not between 32 and 2097152 or substring(p_bytes from 1 for 3)<>decode('ffd8ff','hex') or p_proof is distinct from encode(sha256(p_bytes),'hex') then return 'review';end if;
 select * into d from public.rental_vipps_report_days where report_date=p_day;
 if not found or d.msn is distinct from p_msn or d.ledger_id is distinct from p_ledger or d.fingerprint is distinct from p_digest then return 'review';end if;
 if (select count(*) from public.rental_vipps_report_days r cross join lateral jsonb_array_elements(r.funds) e where e->>'pspReference'=p_psp and e->>'type'='payout-scheduled')<>1 or not exists(select 1 from jsonb_array_elements(d.funds) e where e->>'pspReference'=p_psp and e->>'type'='payout-scheduled' and e->'amountOre'=to_jsonb(-p_amount)) then return 'review';end if;
 if exists(select 1 from public.rental_vipps_report_days r cross join lateral jsonb_array_elements(r.funds) e where e->>'type'='payout-aborted' and (e->>'pspReference'=p_psp or e->>'pspReference' is null or e->>'pspReference'='')) then return 'review';end if;
 select * into m from public.rental_vipps_bank_matches where payout_psp=p_psp;
 if found then
 if m.report_date=p_day and m.report_digest=p_digest and m.msn=p_msn and m.ledger_id=p_ledger and m.amount_ore=p_amount and m.bank_date=p_bank_day and m.bank_reference=trim(p_bank_ref) and m.proof_digest=p_proof then return 'existing';end if;
 return 'review';end if;
 if exists(select 1 from public.rental_vipps_bank_matches where bank_reference=trim(p_bank_ref) or proof_digest=p_proof) or exists(select 1 from public.rental_group_bank_evidence where reference=trim(p_bank_ref) or digest=p_proof) then return 'review';end if;
 insert into public.rental_vipps_bank_matches(payout_psp,report_date,report_digest,msn,ledger_id,amount_ore,bank_date,bank_reference,proof_digest,image_bytes,actor_id) values(p_psp,p_day,p_digest,p_msn,p_ledger,p_amount,p_bank_day,trim(p_bank_ref),p_proof,p_bytes,p_actor);
 return 'recorded';
end $$;
revoke all on function public.draft_rental_bank_match(date,text,text,text,text,integer,date,text,text,bytea,uuid) from public,anon,authenticated,service_role;
rollback;
