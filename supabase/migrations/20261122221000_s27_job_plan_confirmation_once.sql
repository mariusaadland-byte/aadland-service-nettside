-- S-27: atomic plan revisions and one provider attempt per confirmed plan.
-- Existing historical "job_confirmation_sent_at" fields are preserved.
alter table public.orders add column if not exists job_plan_revision uuid;

create table public.job_plan_confirmation_attempts(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 plan_revision uuid not null,
 start_at timestamptz not null,
 agreement text not null check(length(agreement) between 1 and 8000),
 recipient_email text not null check(length(recipient_email) between 5 and 254),
 state text not null default 'sending'
  check(state in ('sending','sent','needs_review','cancelled','reviewed_sent','reviewed_unsent')),
 claimed_at timestamptz not null default now(),
 sent_at timestamptz,
 provider_email_id text,
 issue text,
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_note text,
 updated_at timestamptz not null default now(),
 constraint s27_unique_plan_confirmation unique(order_id,plan_revision),
 constraint s27_sent_provider_required check(
  state not in ('sent','reviewed_sent') or
  (provider_email_id is not null and sent_at is not null))
);
create index job_plan_confirmation_attention_idx
 on public.job_plan_confirmation_attempts(claimed_at)
 where state in ('sending','needs_review');
alter table public.job_plan_confirmation_attempts enable row level security;
revoke all on public.job_plan_confirmation_attempts from public,anon,authenticated;
grant select,insert,update on public.job_plan_confirmation_attempts to service_role;

-- This function is the only new plan write route. Concurrent operators cannot
-- overwrite one another with stale editor data. Identical saves keep the same
-- revision and do NOT create a new right to send email.
create function public.save_job_plan_once(
 p_order_id uuid,p_start_at timestamptz,p_agreement text,p_expected_revision uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $s27save$
declare
 o public.orders%rowtype;
 rev uuid;
 changed boolean;
 agreement text:=trim(coalesce(p_agreement,''));
begin
 if p_order_id is null or p_start_at is null or length(agreement) not between 1 and 8000
 then raise exception 'S27_INVALID_PLAN'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.order_type<>'custom' or o.status<>'confirmed' or o.archived_at is not null
 then raise exception 'S27_JOB_NOT_ELIGIBLE'; end if;
 if o.job_plan_revision is distinct from p_expected_revision
 then raise exception 'S27_STALE_PLAN'; end if;
 changed:=o.job_start_at is distinct from p_start_at
  or trim(coalesce(o.job_customer_agreement,''))<>agreement;
 rev:=coalesce(o.job_plan_revision,gen_random_uuid());
 if changed then
  rev:=gen_random_uuid();
  update public.orders set job_start_at=p_start_at,job_customer_agreement=agreement,
   job_plan_revision=rev,job_planning_updated_at=now(),
   job_confirmation_sent_at=null,job_reminder_sent_at=null,updated_at=now()
   where id=o.id;
 elsif o.job_plan_revision is null then
  -- Legacy confirmed appointments receive a revision WITHOUT losing history.
  update public.orders set job_plan_revision=rev where id=o.id;
 end if;
 return jsonb_build_object('ok',true,'changed',changed,'revision',rev,
  'start_at',p_start_at,'agreement',agreement,
  'confirmation_sent_at',case when changed then null else o.job_confirmation_sent_at end,
  'reminder_sent_at',case when changed then null else o.job_reminder_sent_at end);
end;
$s27save$;
revoke all on function public.save_job_plan_once(uuid,timestamptz,text,uuid)
 from public,anon,authenticated;
grant execute on function public.save_job_plan_once(uuid,timestamptz,text,uuid) to service_role;

-- Claim is tied to the immutable plan revision and current recipient, and
-- no past indeterminate attempt for this order may be silently bypassed.
create function public.claim_job_plan_confirmation(
 p_order_id uuid,p_revision uuid,p_expected_email text
) returns jsonb
language plpgsql security definer set search_path=''
as $s27claim$
declare
 o public.orders%rowtype;
 a public.job_plan_confirmation_attempts%rowtype;
 email text;
begin
 if p_order_id is null or p_revision is null then return null; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.order_type<>'custom' or o.status<>'confirmed'
  or o.archived_at is not null or o.job_plan_revision is distinct from p_revision
  or o.job_start_at is null or length(trim(coalesce(o.job_customer_agreement,'')))=0
  or o.job_confirmation_sent_at is not null then return null; end if;
 email:=lower(trim(coalesce(o.customer->>'email','')));
 if email not like '%@%.%' or email<>lower(trim(coalesce(p_expected_email,''))) then return null; end if;
 if exists(select 1 from public.job_plan_confirmation_attempts
  where order_id=o.id and state in ('sending','needs_review'))
 then return null; end if;
 insert into public.job_plan_confirmation_attempts(
  order_id,plan_revision,start_at,agreement,recipient_email,state
 ) values(o.id,p_revision,o.job_start_at,trim(o.job_customer_agreement),email,'sending')
 on conflict on constraint s27_unique_plan_confirmation do nothing
 returning * into a;
 if a.id is null then return null; end if;
 return jsonb_build_object('id',a.id,'order_id',a.order_id,
  'plan_revision',a.plan_revision,'start_at',a.start_at,
  'agreement',a.agreement,'recipient_email',a.recipient_email);
end;
$s27claim$;
revoke all on function public.claim_job_plan_confirmation(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.claim_job_plan_confirmation(uuid,uuid,text) to service_role;

create function public.hold_job_plan_confirmation(
 p_attempt_id uuid,p_issue text,p_cancel boolean default false
) returns jsonb
language plpgsql security definer set search_path=''
as $s27hold$
declare
 updated_id uuid;
begin
 update public.job_plan_confirmation_attempts
 set state=case when p_cancel then 'cancelled' else 'needs_review' end,
  issue=left(coalesce(p_issue,'provider_status_uncertain'),120),updated_at=now()
 where id=p_attempt_id and state='sending'
 returning id into updated_id;
 return jsonb_build_object('held',updated_id is not null);
end;
$s27hold$;
revoke all on function public.hold_job_plan_confirmation(uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.hold_job_plan_confirmation(uuid,text,boolean) to service_role;

-- Provider acceptance is audited even if a different plan revision replaced
-- the original while the email request was in flight. Never mark the new
-- plan as sent when the old one was acknowledged.
create function public.ack_job_plan_confirmation(
 p_attempt_id uuid,p_provider_email_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $s27ack$
declare
 a public.job_plan_confirmation_attempts%rowtype;
 marker_count integer:=0;
 stamp timestamptz:=now();
begin
 if p_attempt_id is null or length(trim(coalesce(p_provider_email_id,''))) not between 8 and 240
 then raise exception 'S27_PROVIDER_ID_REQUIRED'; end if;
 update public.job_plan_confirmation_attempts
 set state='sent',sent_at=stamp,provider_email_id=trim(p_provider_email_id),
  issue=null,updated_at=stamp
 where id=p_attempt_id and state='sending'
 returning * into a;
 if not found then raise exception 'S27_ATTEMPT_NOT_SENDING'; end if;
 update public.orders
 set job_confirmation_sent_at=stamp,job_reminder_sent_at=null,updated_at=stamp
 where id=a.order_id and order_type='custom' and status='confirmed'
  and archived_at is null and job_plan_revision=a.plan_revision
  and job_start_at=a.start_at and trim(coalesce(job_customer_agreement,''))=a.agreement
  and lower(trim(coalesce(customer->>'email','')))=a.recipient_email
  and job_confirmation_sent_at is null;
 get diagnostics marker_count=row_count;
 return jsonb_build_object('provider_accepted',true,'marker_recorded',marker_count=1);
end;
$s27ack$;
revoke all on function public.ack_job_plan_confirmation(uuid,text)
 from public,anon,authenticated;
grant execute on function public.ack_job_plan_confirmation(uuid,text) to service_role;

-- Owner review resolves unknown delivery, without triggering another send.
create function public.review_job_plan_confirmation(
 p_attempt_id uuid,p_reviewer_id uuid,p_result text,p_note text,
 p_provider_email_id text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $s27review$
declare
 a public.job_plan_confirmation_attempts%rowtype;
 new_state text;
 stamp timestamptz:=now();
begin
 if p_attempt_id is null or p_reviewer_id is null or p_result not in ('sent','unsent')
  or length(trim(coalesce(p_note,''))) not between 12 and 1200
 then raise exception 'S27_INVALID_REVIEW'; end if;
 select * into a from public.job_plan_confirmation_attempts
 where id=p_attempt_id for update;
 if not found or a.state not in ('sending','needs_review')
 then raise exception 'S27_NOT_REVIEWABLE'; end if;
 if a.claimed_at>now()-interval '5 minutes' then raise exception 'S27_STILL_SENDING'; end if;
 if p_result='sent' and length(trim(coalesce(p_provider_email_id,''))) not between 8 and 240
 then raise exception 'S27_PROVIDER_ID_REQUIRED'; end if;
 new_state:=case when p_result='sent' then 'reviewed_sent' else 'reviewed_unsent' end;
 update public.job_plan_confirmation_attempts set state=new_state,
  reviewed_at=stamp,reviewed_by=p_reviewer_id,review_note=trim(p_note),
  sent_at=case when p_result='sent' then stamp else null end,
  provider_email_id=case when p_result='sent' then trim(p_provider_email_id) else null end,
  updated_at=stamp
 where id=a.id;
 if p_result='sent' then
  update public.orders set job_confirmation_sent_at=coalesce(job_confirmation_sent_at,stamp),
   updated_at=stamp where id=a.order_id and job_plan_revision=a.plan_revision
   and job_start_at=a.start_at and trim(coalesce(job_customer_agreement,''))=a.agreement
   and lower(trim(coalesce(customer->>'email','')))=a.recipient_email
   and job_confirmation_sent_at is null;
 end if;
 return jsonb_build_object('state',new_state,'reviewed',true);
end;
$s27review$;
revoke all on function public.review_job_plan_confirmation(uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.review_job_plan_confirmation(uuid,uuid,text,text,text)
 to service_role;
