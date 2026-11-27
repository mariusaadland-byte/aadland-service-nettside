-- Draft only. No grants, no live posting.
begin;
create table public.rental_vipps_voucher_transfers(
 kind text not null check(kind in ('fee','payout')),
 psp text not null check(length(psp) between 1 and 120),
 report_date date not null references public.rental_vipps_report_days(report_date),
 report_digest text not null check(report_digest ~ '^[0-9a-f]{64}$'),
 company_id bigint not null check(company_id>0),
 clearing_id bigint not null check(clearing_id>0),
 target_id bigint not null check(target_id>0 and target_id<>clearing_id),
 amount_ore integer not null check(amount_ore>0),
 posting_date date not null,
 source_digest text not null check(source_digest ~ '^[0-9a-f]{64}$'),
 marker text not null unique check(marker ~ '^AU-V[FP]-[0-9a-f]{40}$'),
 state text not null default 'claimed' check(state in ('claimed','review','confirmed')),
 remote_voucher_id bigint check(remote_voucher_id>0),
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(kind,psp),
 unique(company_id,remote_voucher_id),
 check((state='confirmed')=(remote_voucher_id is not null))
);
alter table public.rental_vipps_voucher_transfers enable row level security;
revoke all on public.rental_vipps_voucher_transfers from public,anon,authenticated,service_role;
create function public.draft_rental_voucher_claim(p_kind text,p_psp text,p_day date,p_report text,p_company bigint,p_clear bigint,p_target bigint,p_amount integer,p_posting date,p_source text,p_marker text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.rental_vipps_report_days%rowtype; b public.rental_vipps_bank_matches%rowtype; t public.rental_vipps_voucher_transfers%rowtype; typ text;
begin
 perform pg_advisory_xact_lock(39017);
 if p_kind is null or p_kind not in ('fee','payout') or p_psp is null or length(trim(p_psp)) not between 1 and 120 or p_actor is null or p_company is null or p_company<=0 or p_clear is null or p_clear<=0 or p_target is null or p_target<=0 or p_clear=p_target or p_amount is null or p_amount<=0 or p_posting is null or p_posting>(clock_timestamp() at time zone 'Europe/Oslo')::date or p_source is null or p_source !~ '^[0-9a-f]{64}$' or p_marker is null or p_marker !~ (case when p_kind='fee' then '^AU-VF-[0-9a-f]{40}$' else '^AU-VP-[0-9a-f]{40}$' end) then return 'review';end if;
 select * into d from public.rental_vipps_report_days where report_date=p_day;
 if not found or d.fingerprint is distinct from p_report then return 'review';end if;
 typ:=case when p_kind='fee' then 'fees-retained' else 'payout-scheduled' end;
 if (select count(*) from public.rental_vipps_report_days r cross join lateral jsonb_array_elements(r.funds) e where e->>'type'=typ and e->>'pspReference'=p_psp)<>1 or not exists(select 1 from jsonb_array_elements(d.funds) e where e->>'type'=typ and e->>'pspReference'=p_psp and e->'amountOre'=to_jsonb(-p_amount)) then return 'review';end if;
 if p_kind='fee' then
  if p_posting<>p_day or (select count(*) from jsonb_array_elements(d.fees) e where e->>'type'='fees-retained' and e->>'pspReference'=p_psp)<>1 or not exists(select 1 from jsonb_array_elements(d.fees) e where e->>'type'='fees-retained' and e->>'pspReference'=p_psp and e->'amountOre'=to_jsonb(p_amount)) then return 'review';end if;
 else
  select * into b from public.rental_vipps_bank_matches where payout_psp=p_psp;
  if not found or b.report_date<>p_day or b.report_digest<>p_report or b.msn<>d.msn or b.ledger_id<>d.ledger_id or b.amount_ore<>p_amount or b.bank_date<>p_posting then return 'review';end if;
  if exists(select 1 from public.rental_vipps_report_days r cross join lateral jsonb_array_elements(r.funds) e where e->>'type'='payout-aborted' and (e->>'pspReference'=p_psp or coalesce(e->>'pspReference','')='')) then return 'review';end if;
 end if;
 select * into t from public.rental_vipps_voucher_transfers where kind=p_kind and psp=p_psp;
 if found then
  if t.report_digest=p_report and t.report_date=p_day and t.company_id=p_company and t.clearing_id=p_clear and t.target_id=p_target and t.amount_ore=p_amount and t.posting_date=p_posting and t.source_digest=p_source and t.marker=p_marker then return 'existing';end if;
  return 'review';end if;
 insert into public.rental_vipps_voucher_transfers(kind,psp,report_date,report_digest,company_id,clearing_id,target_id,amount_ore,posting_date,source_digest,marker,actor_id) values(p_kind,p_psp,p_day,p_report,p_company,p_clear,p_target,p_amount,p_posting,p_source,p_marker,p_actor);
 return 'claimed';
end $$;
revoke all on function public.draft_rental_voucher_claim(text,text,date,text,bigint,bigint,bigint,integer,date,text,text,uuid) from public,anon,authenticated,service_role;
create function public.draft_rental_voucher_finish(p_kind text,p_psp text,p_source text,p_voucher bigint)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t public.rental_vipps_voucher_transfers%rowtype;
begin
 select * into t from public.rental_vipps_voucher_transfers where kind=p_kind and psp=p_psp for update;
 if not found or t.source_digest is distinct from p_source or p_voucher is not null and p_voucher<=0 then return 'review';end if;
 if t.state='confirmed' then return case when t.remote_voucher_id=p_voucher then 'existing' else 'review' end;end if;
 if t.state<>'claimed' then return 'review';end if;
 update public.rental_vipps_voucher_transfers set state=case when p_voucher is null then 'review' else 'confirmed' end,remote_voucher_id=p_voucher where kind=p_kind and psp=p_psp;
 return case when p_voucher is null then 'review' else 'confirmed' end;
end $$;
revoke all on function public.draft_rental_voucher_finish(text,text,text,bigint) from public,anon,authenticated,service_role;
rollback;
