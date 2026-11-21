-- S-20: atomically record a customer's binding quote response AND the two
-- separate notification jobs. No backfill of previously accepted real offers.
create table public.quote_response_notifications (
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null references public.quotes(id) on delete restrict,
 recipient_kind text not null check(recipient_kind in ('owner','customer')),
 recipient_email text not null check(length(recipient_email) between 3 and 254),
 action text not null check(action in ('accept','decline')),
 state text not null default 'queued'
  check(state in ('queued','claimed','sent','needs_review')),
 attempt_number integer not null default 1
  check(attempt_number between 1 and 100),
 claimed_at timestamptz,
 released_at timestamptz,
 provider_email_id text,
 sent_at timestamptz,
 last_issue text check(length(last_issue)<=150),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(quote_id,recipient_kind),
 constraint s20_notice_sent_requires_time check(
  (state='sent' and sent_at is not null) or
  (state<>'sent' and sent_at is null)
 )
);
create index quote_response_notifications_queue_idx
 on public.quote_response_notifications(created_at,id)
 where state='queued';
create index quote_response_notifications_quote_idx
 on public.quote_response_notifications(quote_id,created_at desc);
alter table public.quote_response_notifications enable row level security;
revoke all on public.quote_response_notifications from public,anon,authenticated;
grant select,insert,update on public.quote_response_notifications to service_role;

create table public.quote_response_notification_reviews (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.quote_response_notifications(id) on delete restrict,
 reviewer_id uuid not null,
 action text not null check(action in ('confirm_sent','release_unsent')),
 note text not null check(length(note) between 12 and 1200),
 provider_email_id text,
 created_at timestamptz not null default now()
);
create index quote_response_notification_reviews_notice_idx
 on public.quote_response_notification_reviews(notification_id,created_at desc);
alter table public.quote_response_notification_reviews enable row level security;
revoke all on public.quote_response_notification_reviews from public,anon,authenticated;
grant select,insert on public.quote_response_notification_reviews to service_role;

-- One atomic Postgres transaction: a failed outbox insert MUST roll back
-- quote acceptance. This is only callable by the server's service_role.
create function public.record_customer_quote_response(
 p_quote_id uuid,
 p_action text,
 p_expected_generation integer,
 p_via_customer_session boolean default false
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
 q public.quotes%rowtype;
 email text;
 stamp timestamptz := now();
begin
 if p_action not in ('accept','decline') then
  raise exception 'invalid_quote_action';
 end if;
 if p_expected_generation is null or p_expected_generation < 1 then
  raise exception 'invalid_quote_generation';
 end if;
 update public.quotes
 set status = case when p_action='accept' then 'accepted' else 'declined' end,
     accepted_at = case when p_action='accept' then stamp else null end,
     declined_at = case when p_action='decline' then stamp else null end,
     acceptance_method = case when p_action='accept' then 'digital' else null end,
     paper_signed_date = null,
     accepted_recorded_by = null,
     auto_follow_up = false,
     updated_at = stamp
 where id=p_quote_id
   and status='sent'
   and (sent_at is not null or paper_issued_at is not null)
   and (valid_until is null or valid_until >= (stamp at time zone 'Europe/Oslo')::date)
   and (p_via_customer_session=true or
     (quote_link_generation=p_expected_generation and quote_link_disabled_at is null))
 returning * into q;
 if not found then return null; end if;

 insert into public.quote_response_notifications
  (quote_id,recipient_kind,recipient_email,action)
 values (q.id,'owner','post@aadland-service.no',p_action);

 email := lower(trim(coalesce(q.customer->>'email','')));
 if email<>'' and email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' then
  insert into public.quote_response_notifications
   (quote_id,recipient_kind,recipient_email,action)
  values (q.id,'customer',email,p_action);
 end if;
 return to_jsonb(q);
end;
$$;
revoke all on function public.record_customer_quote_response(uuid,text,integer,boolean)
 from public,anon,authenticated;
grant execute on function public.record_customer_quote_response(uuid,text,integer,boolean)
 to service_role;

-- Manual reconciliation is required if Resend status is unknown. A release
-- changes the idempotency key, but only after the owner checks there was NO
-- earlier delivery and records a reason. Nothing is sent in this function.
create function public.review_customer_quote_response_notice(
 p_notification_id uuid,
 p_quote_number text,
 p_reviewer uuid,
 p_action text,
 p_note text,
 p_provider_email_id text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
 n public.quote_response_notifications%rowtype;
 actual_number text;
 stamp timestamptz := now();
begin
 if p_reviewer is null or p_action not in ('confirm_sent','release_unsent')
    or length(trim(coalesce(p_note,''))) not between 12 and 1200 then
  raise exception 'invalid_response_notice_review';
 end if;
 select r.*,q.quote_number into n,actual_number
 from public.quote_response_notifications r
 join public.quotes q on q.id=r.quote_id
 where r.id=p_notification_id
 for update of r;
 if not found or actual_number<>p_quote_number then
  raise exception 'quote_review_mismatch';
 end if;
 if n.state not in ('claimed','needs_review') then
  raise exception 'notice_not_reviewable';
 end if;
 if n.claimed_at is not null and n.claimed_at>stamp-interval '5 minutes' then
  raise exception 'notice_attempt_may_be_active';
 end if;
 if p_action='confirm_sent' then
  if length(trim(coalesce(p_provider_email_id,'')))<8 or
     length(trim(coalesce(p_provider_email_id,'')))>240 then
    raise exception 'verified_provider_id_required';
  end if;
  update public.quote_response_notifications
   set state='sent',provider_email_id=trim(p_provider_email_id),
       sent_at=stamp,updated_at=stamp,last_issue=null
   where id=n.id;
 else
  if n.attempt_number>=100 then raise exception 'too_many_notice_reviews'; end if;
  update public.quote_response_notifications
   set state='queued',attempt_number=n.attempt_number+1,
       claimed_at=null,released_at=stamp,provider_email_id=null,
       sent_at=null,last_issue=null,updated_at=stamp
   where id=n.id;
 end if;
 insert into public.quote_response_notification_reviews
  (notification_id,reviewer_id,action,note,provider_email_id)
 values
  (n.id,p_reviewer,p_action,trim(p_note),
   case when p_action='confirm_sent' then trim(p_provider_email_id) else null end);
 return jsonb_build_object('ok',true,'state',
  case when p_action='confirm_sent' then 'sent' else 'queued' end);
end;
$$;
revoke all on function public.review_customer_quote_response_notice(uuid,text,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.review_customer_quote_response_notice(uuid,text,uuid,text,text,text)
 to service_role;
