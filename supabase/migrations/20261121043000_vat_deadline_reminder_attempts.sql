-- S-07: One immutable automatic reminder attempt per VAT term and reminder day.
-- An uncertain provider result remains blocked permanently; never silently retry.
create table if not exists public.vat_deadline_reminder_attempts (
 year integer not null check(year between 2000 and 2100),
 term integer not null check(term between 1 and 6),
 lead_days integer not null check(lead_days in (28,14)),
 due_date date not null,
 alert_day date not null,
 recipient text not null check(recipient='post@aadland-service.no'),
 idempotency_key text not null unique,
 status text not null default 'claimed'
  check(status in ('claimed','needs_review','provider_accepted','sent','skipped')),
 provider_email_id text,
 claimed_at timestamptz not null default now(),
 provider_accepted_at timestamptz,
 sent_at timestamptz,
 last_error text,
 updated_at timestamptz not null default now(),
 primary key(year,term,lead_days),
 check(due_date-alert_day=lead_days)
);
create index if not exists vat_deadline_reminder_state_idx
 on public.vat_deadline_reminder_attempts(status,claimed_at desc);
alter table public.vat_deadline_reminder_attempts enable row level security;
revoke all on public.vat_deadline_reminder_attempts from public,anon,authenticated;
grant select,insert,update on public.vat_deadline_reminder_attempts to service_role;

create or replace function public.claim_vat_deadline_reminder(
 p_year integer,p_term integer,p_lead_days integer,
 p_due_date date,p_today date
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_profile public.vat_reporting_profile%rowtype;
 v_status text;
 v_attempt public.vat_deadline_reminder_attempts%rowtype;
 v_key text;
begin
 if p_year not between 2000 and 2099 or p_term not between 1 and 6
  or p_lead_days not in (28,14) or p_due_date is null or p_today is null
  or p_due_date-p_today<>p_lead_days then
  raise exception 'invalid_vat_reminder_request';
 end if;
 -- Serialize all checks against the confirmed business VAT profile.
 select * into v_profile from public.vat_reporting_profile
 where id='primary' for update;
 if not found or (p_year*10+p_term)<(v_profile.first_term_year*10+v_profile.first_term)
 then return jsonb_build_object('state','skipped','reason','not_registered'); end if;
 select status into v_status from public.vat_reporting_term_status
 where year=p_year and term=p_term;
 if v_status='filed' then
  return jsonb_build_object('state','skipped','reason','already_filed');
 end if;
 v_key='vat-deadline/'||p_year||'/'||p_term||'/'||p_lead_days;
 insert into public.vat_deadline_reminder_attempts
  (year,term,lead_days,due_date,alert_day,recipient,idempotency_key,status)
 values (p_year,p_term,p_lead_days,p_due_date,p_today,
         'post@aadland-service.no',v_key,'claimed')
 on conflict(year,term,lead_days) do nothing;
 if found then return jsonb_build_object('state','claimed','key',v_key); end if;
 select * into v_attempt from public.vat_deadline_reminder_attempts
 where year=p_year and term=p_term and lead_days=p_lead_days for update;
 if v_attempt.status='provider_accepted' then
  return jsonb_build_object('state','provider_accepted','key',v_attempt.idempotency_key);
 end if;
 return jsonb_build_object('state','blocked','reason',v_attempt.status);
end; $$;

create or replace function public.vat_deadline_reminder_provider_accepted(
 p_year integer,p_term integer,p_lead_days integer,
 p_key text,p_provider_email_id text
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if length(btrim(coalesce(p_provider_email_id,'')))<3 then raise exception 'provider_id_required'; end if;
 update public.vat_deadline_reminder_attempts
 set status='provider_accepted',provider_email_id=p_provider_email_id,
 provider_accepted_at=now(),updated_at=now()
 where year=p_year and term=p_term and lead_days=p_lead_days
  and idempotency_key=p_key and status='claimed';
 if not found then raise exception 'reminder_attempt_missing'; end if;
end; $$;

create or replace function public.skip_vat_deadline_reminder_if_filed(
 p_year integer,p_term integer,p_lead_days integer,p_key text
) returns void language plpgsql security invoker set search_path='' as $$
declare v_status text;
begin
 select status into v_status from public.vat_reporting_term_status
 where year=p_year and term=p_term;
 if v_status<>'filed' then raise exception 'vat_term_not_confirmed_filed'; end if;
 update public.vat_deadline_reminder_attempts set status='skipped',updated_at=now()
 where year=p_year and term=p_term and lead_days=p_lead_days
   and idempotency_key=p_key and status='claimed';
end; $$;

create or replace function public.vat_deadline_reminder_uncertain(
 p_year integer,p_term integer,p_lead_days integer,
 p_key text,p_error text
) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.vat_deadline_reminder_attempts set status='needs_review',
  last_error=left(coalesce(p_error,'Uavklart Resend-svar'),250),updated_at=now()
 where year=p_year and term=p_term and lead_days=p_lead_days
  and idempotency_key=p_key and status='claimed';
 -- Never reset a provider-accepted, sent or reviewed reminder.
end; $$;

create or replace function public.complete_vat_deadline_reminder(
 p_year integer,p_term integer,p_lead_days integer,p_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_attempt public.vat_deadline_reminder_attempts%rowtype;
begin
 select * into v_attempt from public.vat_deadline_reminder_attempts
 where year=p_year and term=p_term and lead_days=p_lead_days for update;
 if not found or v_attempt.idempotency_key is distinct from p_key
 then raise exception 'reminder_attempt_missing'; end if;
 if v_attempt.status='sent' then
  return jsonb_build_object('state','sent','sentAt',v_attempt.sent_at); end if;
 if v_attempt.status<>'provider_accepted' or v_attempt.provider_email_id is null
 then raise exception 'reminder_provider_unconfirmed'; end if;
 update public.vat_deadline_reminder_attempts
 set status='sent',sent_at=coalesce(v_attempt.provider_accepted_at,now()),
  updated_at=now()
 where year=p_year and term=p_term and lead_days=p_lead_days;
 return jsonb_build_object('state','sent','sentAt',coalesce(v_attempt.provider_accepted_at,now()));
end; $$;

revoke execute on function public.claim_vat_deadline_reminder(integer,integer,integer,date,date)
 from public,anon,authenticated;
revoke execute on function public.vat_deadline_reminder_provider_accepted(integer,integer,integer,text,text)
 from public,anon,authenticated;
revoke execute on function public.skip_vat_deadline_reminder_if_filed(integer,integer,integer,text)
 from public,anon,authenticated;
revoke execute on function public.vat_deadline_reminder_uncertain(integer,integer,integer,text,text)
 from public,anon,authenticated;
revoke execute on function public.complete_vat_deadline_reminder(integer,integer,integer,text)
 from public,anon,authenticated;
grant execute on function public.claim_vat_deadline_reminder(integer,integer,integer,date,date) to service_role;
grant execute on function public.vat_deadline_reminder_provider_accepted(integer,integer,integer,text,text) to service_role;
grant execute on function public.skip_vat_deadline_reminder_if_filed(integer,integer,integer,text) to service_role;
grant execute on function public.vat_deadline_reminder_uncertain(integer,integer,integer,text,text) to service_role;
grant execute on function public.complete_vat_deadline_reminder(integer,integer,integer,text) to service_role;
