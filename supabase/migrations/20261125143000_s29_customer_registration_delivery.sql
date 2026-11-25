-- S-29: retain customer accounts when verification delivery is indeterminate.
-- This table has no access for anonymous or logged-in client roles.
create table public.customer_verification_delivery_attempts(
 id uuid primary key default gen_random_uuid(),
 customer_user_id uuid not null references auth.users(id) on delete cascade,
 recipient_email text not null check(length(recipient_email) between 5 and 254),
 state text not null default 'sending' check(state in
   ('sending','accepted','needs_review','reviewed_sent','reviewed_unsent')),
 claimed_at timestamptz not null default now(),
 accepted_at timestamptz,
 provider_message_id text,
 issue text,
 reviewed_at timestamptz,
 reviewer_id uuid,
 review_note text,
 updated_at timestamptz not null default now(),
 constraint s29_sent_requires_provider check(
   state not in ('accepted','reviewed_sent') or
   (provider_message_id is not null and accepted_at is not null))
);
create index s29_customer_verification_recent
 on public.customer_verification_delivery_attempts(customer_user_id,claimed_at desc);
create unique index s29_customer_verification_one_unresolved
 on public.customer_verification_delivery_attempts(customer_user_id)
 where state in ('sending','needs_review');
create index s29_verification_owner_review
 on public.customer_verification_delivery_attempts(claimed_at)
 where state in ('sending','needs_review');
alter table public.customer_verification_delivery_attempts enable row level security;
revoke all on public.customer_verification_delivery_attempts from public,anon,authenticated;
grant select,insert,update on public.customer_verification_delivery_attempts to service_role;

-- Read only a matching pending auth ID, not the user's password, metadata
-- or session. Called from a server rate-limited route only.
create function public.find_unconfirmed_customer_by_email(p_email text)
returns uuid language sql security definer set search_path=''
as $s29find$
 select u.id from auth.users u
 where lower(u.email)=lower(trim(p_email))
  and u.email_confirmed_at is null
 limit 1;
$s29find$;
revoke all on function public.find_unconfirmed_customer_by_email(text)
 from public,anon,authenticated;
grant execute on function public.find_unconfirmed_customer_by_email(text)
 to service_role;

-- Lock the auth row for all providers/runtimes concurrently.
-- Unknown prior delivery is never bypassed by choosing a new idempotency key.
create function public.claim_customer_verification_delivery(
 p_user_id uuid,p_email text
) returns jsonb
language plpgsql security definer set search_path=''
as $s29claim$
declare
 user_email text;
 confirmed_at timestamptz;
 last_accepted timestamptz;
 entry_id uuid;
begin
 if p_user_id is null or length(trim(coalesce(p_email,''))) not between 5 and 254
 then return jsonb_build_object('state','invalid'); end if;
 select lower(email),email_confirmed_at into user_email,confirmed_at
 from auth.users where id=p_user_id for update;
 if not found or user_email is distinct from lower(trim(p_email))
  or confirmed_at is not null
 then return jsonb_build_object('state','not_eligible'); end if;
 if exists(
  select 1 from public.customer_verification_delivery_attempts
  where customer_user_id=p_user_id and state in ('sending','needs_review')
 ) then return jsonb_build_object('state','unresolved'); end if;
 select max(accepted_at) into last_accepted
 from public.customer_verification_delivery_attempts
 where customer_user_id=p_user_id and state in ('accepted','reviewed_sent');
 if last_accepted is not null and last_accepted > now()-interval '15 minutes'
 then return jsonb_build_object('state','recent'); end if;
 insert into public.customer_verification_delivery_attempts(customer_user_id,recipient_email)
 values(p_user_id,user_email) returning id into entry_id;
 return jsonb_build_object('state','claimed','id',entry_id);
end;
$s29claim$;
revoke all on function public.claim_customer_verification_delivery(uuid,text)
 from public,anon,authenticated;
grant execute on function public.claim_customer_verification_delivery(uuid,text)
 to service_role;

create function public.accept_customer_verification_delivery(
 p_attempt_id uuid,p_provider_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $s29accept$
declare
 updated_id uuid;
begin
 if p_attempt_id is null or length(trim(coalesce(p_provider_id,''))) not between 8 and 240
 then raise exception 'S29_PROVIDER_ID_REQUIRED'; end if;
 update public.customer_verification_delivery_attempts
 set state='accepted',provider_message_id=trim(p_provider_id),
  accepted_at=now(),updated_at=now(),issue=null
 where id=p_attempt_id and state='sending'
 returning id into updated_id;
 return jsonb_build_object('accepted',updated_id is not null);
end;
$s29accept$;
revoke all on function public.accept_customer_verification_delivery(uuid,text)
 from public,anon,authenticated;
grant execute on function public.accept_customer_verification_delivery(uuid,text)
 to service_role;

create function public.hold_customer_verification_delivery(
 p_attempt_id uuid,p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $s29hold$
declare
 updated_id uuid;
begin
 update public.customer_verification_delivery_attempts
 set state='needs_review',issue=left(trim(coalesce(p_reason,'provider_unknown')),120),
  updated_at=now()
 where id=p_attempt_id and state='sending'
 returning id into updated_id;
 return jsonb_build_object('held',updated_id is not null);
end;
$s29hold$;
revoke all on function public.hold_customer_verification_delivery(uuid,text)
 from public,anon,authenticated;
grant execute on function public.hold_customer_verification_delivery(uuid,text)
 to service_role;

-- A business owner must first inspect the provider's records. Review never
-- starts a send. 'unsent' allows a future customer-triggered retry.
create function public.review_customer_verification_delivery(
 p_attempt_id uuid,p_reviewer_id uuid,p_result text,p_note text,
 p_provider_id text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $s29review$
declare
 entry public.customer_verification_delivery_attempts%rowtype;
 stamp timestamptz:=now();
 new_state text;
begin
 if p_attempt_id is null or p_reviewer_id is null
  or p_result not in ('sent','unsent')
  or length(trim(coalesce(p_note,''))) not between 12 and 1200
 then raise exception 'S29_INVALID_REVIEW'; end if;
 select * into entry from public.customer_verification_delivery_attempts
 where id=p_attempt_id for update;
 if not found or entry.state not in ('sending','needs_review')
 then raise exception 'S29_NOT_REVIEWABLE'; end if;
 if entry.claimed_at>stamp-interval '5 minutes'
 then raise exception 'S29_STILL_SENDING'; end if;
 if p_result='sent' and
  length(trim(coalesce(p_provider_id,''))) not between 8 and 240
 then raise exception 'S29_PROVIDER_ID_REQUIRED'; end if;
 new_state:=case when p_result='sent' then 'reviewed_sent'
   else 'reviewed_unsent' end;
 update public.customer_verification_delivery_attempts
 set state=new_state,reviewer_id=p_reviewer_id,review_note=trim(p_note),
  provider_message_id=case when p_result='sent' then trim(p_provider_id) else null end,
  accepted_at=case when p_result='sent' then stamp else null end,
  reviewed_at=stamp,updated_at=stamp
 where id=entry.id;
 return jsonb_build_object('reviewed',true,'state',new_state);
end;
$s29review$;
revoke all on function public.review_customer_verification_delivery(uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.review_customer_verification_delivery(uuid,uuid,text,text,text)
 to service_role;
