-- S-24: one immutable delivery attempt for each confirmed appointment slot.
-- Only a service-role cron can claim or acknowledge an attempt. Unknown
-- delivery is NEVER automatically released to retry after Resend's 24h limit.
create table public.service_appointment_reminder_attempts (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 kind text not null check(kind in ('survey','job')),
 appointment_at timestamptz not null,
 confirmation_sent_at timestamptz not null,
 recipient_email text not null check(length(recipient_email) between 5 and 254),
 state text not null default 'claimed'
  check(state in ('claimed','sent','needs_review','cancelled','reviewed_sent','reviewed_unsent')),
 claimed_at timestamptz not null default now(),
 sent_at timestamptz,
 resend_email_id text,
 last_issue text check(length(last_issue)<=120),
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_note text check(length(review_note)<=1200),
 updated_at timestamptz not null default now(),
 constraint s24_unique_confirmed_appointment
  unique(order_id,kind,appointment_at,confirmation_sent_at),
 constraint s24_sent_requires_provider
  check(state not in ('sent','reviewed_sent') or (resend_email_id is not null and sent_at is not null))
);
create index service_appointment_reminder_attempts_attention_idx
 on public.service_appointment_reminder_attempts(claimed_at)
 where state in ('claimed','needs_review');
alter table public.service_appointment_reminder_attempts enable row level security;
revoke all on public.service_appointment_reminder_attempts from public,anon,authenticated;
grant select,insert,update on public.service_appointment_reminder_attempts to service_role;

-- Lock actual order row to reconcile schedule, confirmation, status and the
-- configured customer email within the same transaction as the one-time claim.
create function public.claim_service_appointment_reminder(
 p_order_id uuid,
 p_kind text,
 p_expected_at timestamptz,
 p_expected_confirmation timestamptz,
 p_email text
) returns jsonb
language plpgsql security definer
set search_path=''
as $claim$
declare
 o public.orders%rowtype;
 at_time timestamptz;
 confirmation_time timestamptz;
 old_marker timestamptz;
 email text;
 record_id uuid;
begin
 if p_kind not in ('survey','job') or p_order_id is null
   or p_expected_at is null or p_expected_confirmation is null then
  return null;
 end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then return null; end if;
 if o.order_type<>'custom' or o.status<>'confirmed' or o.archived_at is not null
  then return null; end if;
 if p_kind='survey' then
  at_time:=o.survey_date;
  confirmation_time:=o.survey_confirmation_sent_at;
  old_marker:=o.survey_reminder_sent_at;
 else
  at_time:=o.job_start_at;
  confirmation_time:=o.job_confirmation_sent_at;
  old_marker:=o.job_reminder_sent_at;
 end if;
 email:=lower(trim(coalesce(o.customer->>'email','')));
 if at_time is distinct from p_expected_at
  or confirmation_time is distinct from p_expected_confirmation
  or old_marker is not null
  or email<>lower(trim(coalesce(p_email,'')))
  or email not like '%@%.%'
  or (at_time at time zone 'Europe/Oslo')::date <>
     (now() at time zone 'Europe/Oslo')::date+1
 then return null; end if;
 insert into public.service_appointment_reminder_attempts(
  order_id,kind,appointment_at,confirmation_sent_at,recipient_email,state
 ) values (
  o.id,p_kind,at_time,confirmation_time,email,'claimed'
 ) on conflict on constraint s24_unique_confirmed_appointment do nothing
 returning id into record_id;
 if record_id is null then return null; end if;
 return jsonb_build_object('id',record_id,'order_id',o.id,'kind',p_kind,
  'appointment_at',at_time,'confirmation_sent_at',confirmation_time,
  'recipient_email',email);
end;
$claim$;
revoke all on function public.claim_service_appointment_reminder(uuid,text,timestamptz,timestamptz,text)
 from public,anon,authenticated;
grant execute on function public.claim_service_appointment_reminder(uuid,text,timestamptz,timestamptz,text)
 to service_role;

-- A provider-accepted response and the old compatibility marker are
-- reconciled atomically. If the appointment has changed during delivery,
-- preserve the actual email receipt but DO NOT stamp a new appointment.
create function public.acknowledge_service_appointment_reminder(
 p_attempt_id uuid,
 p_resend_email_id text
) returns jsonb
language plpgsql security definer
set search_path=''
as $ack$
declare
 a public.service_appointment_reminder_attempts%rowtype;
 o public.orders%rowtype;
 affected integer := 0;
begin
 if p_attempt_id is null or length(trim(coalesce(p_resend_email_id,''))) not between 8 and 240
 then raise exception 'invalid_reminder_provider_receipt'; end if;
 select * into a from public.service_appointment_reminder_attempts
 where id=p_attempt_id for update;
 if not found or a.state<>'claimed' then
  raise exception 'reminder_attempt_not_claimed';
 end if;
 select * into o from public.orders where id=a.order_id for update;
 update public.service_appointment_reminder_attempts
 set state='sent',sent_at=now(),resend_email_id=trim(p_resend_email_id),
     updated_at=now(),last_issue=null
 where id=a.id and state='claimed';
 if a.kind='survey' then
  update public.orders set survey_reminder_sent_at=now(),updated_at=now()
   where id=a.order_id and order_type='custom' and status='confirmed'
    and archived_at is null
    and survey_date=a.appointment_at
    and survey_confirmation_sent_at=a.confirmation_sent_at
    and survey_reminder_sent_at is null
    and lower(trim(coalesce(customer->>'email','')))=a.recipient_email;
 else
  update public.orders set job_reminder_sent_at=now(),updated_at=now()
   where id=a.order_id and order_type='custom' and status='confirmed'
    and archived_at is null
    and job_start_at=a.appointment_at
    and job_confirmation_sent_at=a.confirmation_sent_at
    and job_reminder_sent_at is null
    and lower(trim(coalesce(customer->>'email','')))=a.recipient_email;
 end if;
 get diagnostics affected=row_count;
 return jsonb_build_object('accepted_by_provider',true,
  'marker_recorded',affected=1);
end;
$ack$;
revoke all on function public.acknowledge_service_appointment_reminder(uuid,text)
 from public,anon,authenticated;
grant execute on function public.acknowledge_service_appointment_reminder(uuid,text)
 to service_role;

-- A reviewed uncertain attempt can be closed by an owner, but never
-- automatically retried for the old appointment. Review is separate from
-- the queue and never calls Resend.
create function public.review_service_appointment_reminder(
 p_attempt_id uuid,
 p_reviewer_id uuid,
 p_result text,
 p_note text,
 p_resend_email_id text default null
) returns jsonb
language plpgsql security definer
set search_path=''
as $review$
declare
 a public.service_appointment_reminder_attempts%rowtype;
 new_state text;
begin
 if p_reviewer_id is null or p_result not in ('sent','unsent')
  or length(trim(coalesce(p_note,''))) not between 12 and 1200 then
  raise exception 'invalid_reminder_review';
 end if;
 select * into a from public.service_appointment_reminder_attempts
 where id=p_attempt_id for update;
 if not found or a.state not in ('claimed','needs_review') then
  raise exception 'reminder_not_reviewable';
 end if;
 if a.claimed_at>now()-interval '5 minutes' then
  raise exception 'reminder_still_in_progress';
 end if;
 if p_result='sent' and length(trim(coalesce(p_resend_email_id,''))) not between 8 and 240
 then raise exception 'verified_resend_id_required'; end if;
 new_state:=case when p_result='sent' then 'reviewed_sent' else 'reviewed_unsent' end;
 update public.service_appointment_reminder_attempts
 set state=new_state,reviewed_at=now(),reviewed_by=p_reviewer_id,
  review_note=trim(p_note),updated_at=now(),
  resend_email_id=case when p_result='sent' then trim(p_resend_email_id) else null end,
  sent_at=case when p_result='sent' then now() else null end
 where id=a.id;
 return jsonb_build_object('state',new_state,'ok',true);
end;
$review$;
revoke all on function public.review_service_appointment_reminder(uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.review_service_appointment_reminder(uuid,uuid,text,text,text)
 to service_role;
