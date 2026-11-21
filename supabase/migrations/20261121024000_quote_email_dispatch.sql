-- S-02: Prevent duplicate customer offer emails when requests race or time out.
-- Only the backend service role may manipulate these dispatch records.
create table if not exists public.quote_email_send_attempts (
 quote_id uuid primary key references public.quotes(id) on delete restrict,
 recipient text not null check (length(recipient) between 3 and 240),
 delivery_type text not null check (delivery_type in ('primary','alternate')),
 idempotency_key text not null unique,
 state text not null default 'claimed' check (state in ('claimed','needs_review','provider_accepted','sent','released')),
 provider_email_id text,
 claimed_at timestamptz not null default now(),
 provider_accepted_at timestamptz,
 sent_at timestamptz,
 reviewed_at timestamptz,
 review_note text,
 last_error text,
 updated_at timestamptz not null default now()
);
create index if not exists quote_email_send_attempt_state_idx
 on public.quote_email_send_attempts(state, updated_at desc);
alter table public.quote_email_send_attempts enable row level security;
revoke all on public.quote_email_send_attempts from public, anon, authenticated;
grant select,insert,update,delete on public.quote_email_send_attempts to service_role;

create or replace function public.claim_quote_email_send(
 p_quote_id uuid,p_expected_updated_at timestamptz,p_recipient text,p_delivery_type text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.quotes%rowtype; attempt public.quote_email_send_attempts%rowtype; k text;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'quote_not_found'; end if;
 if q.status <> 'draft' or q.sent_at is not null or q.paper_issued_at is not null or q.archived_at is not null
 then raise exception 'quote_already_issued'; end if;
 if q.updated_at is distinct from p_expected_updated_at then
  raise exception 'quote_changed_refresh_before_sending';
 end if;
 if p_recipient is null or length(p_recipient)<3 or length(p_recipient)>240
   or p_delivery_type not in ('primary','alternate')
 then raise exception 'quote_recipient_invalid'; end if;

 select * into attempt from public.quote_email_send_attempts
 where quote_id=p_quote_id for update;
 if found then
  if attempt.state='released' then
   -- Only an owner-reviewed and released attempt can be retried.
   k='quote-email-'||gen_random_uuid()::text;
   update public.quote_email_send_attempts set
    recipient=p_recipient,delivery_type=p_delivery_type,idempotency_key=k,
    state='claimed',claimed_at=now(),provider_email_id=null,provider_accepted_at=null,
    sent_at=null,last_error=null,reviewed_at=null,review_note=null,updated_at=now()
   where quote_id=p_quote_id;
   return jsonb_build_object('state','claimed','idempotencyKey',k);
  end if;
  if attempt.state='provider_accepted' then
   return jsonb_build_object('state','provider_accepted','idempotencyKey',attempt.idempotency_key,'recipient',attempt.recipient,'deliveryType',attempt.delivery_type);
  end if;
  raise exception 'quote_dispatch_already_claimed_%',attempt.state;
 end if;
 k='quote-email-'||gen_random_uuid()::text;
 insert into public.quote_email_send_attempts(quote_id,recipient,delivery_type,idempotency_key)
 values (p_quote_id,p_recipient,p_delivery_type,k);
 return jsonb_build_object('state','claimed','idempotencyKey',k);
end; $$;

create or replace function public.quote_email_provider_accepted(
 p_quote_id uuid,p_idempotency_key text,p_provider_email_id text
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_provider_email_id is null or btrim(p_provider_email_id)='' then raise exception 'provider_id_required'; end if;
 update public.quote_email_send_attempts
 set state='provider_accepted',provider_email_id=p_provider_email_id,
 provider_accepted_at=now(),updated_at=now()
 where quote_id=p_quote_id and idempotency_key=p_idempotency_key and state='claimed';
 if not found then raise exception 'quote_send_claim_missing'; end if;
end; $$;

create or replace function public.quote_email_send_uncertain(
 p_quote_id uuid,p_idempotency_key text,p_reason text
) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.quote_email_send_attempts
 set state='needs_review',last_error=left(coalesce(p_reason,'Uavklart e-postlevering'),250),
 updated_at=now()
 where quote_id=p_quote_id and idempotency_key=p_idempotency_key and state='claimed';
 -- Provider-accepted and sent states must never be downgraded.
end; $$;

-- This is deliberately a TWO-STEP recovery: the owner first checks
-- the Resend dashboard and explicitly confirms NO delivery.
-- The next manual send uses a new provider idempotency key.
create table if not exists public.quote_email_send_reviews(
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null references public.quotes(id) on delete restrict,
 previous_state text not null,
 previous_idempotency_key text not null,
 previous_recipient text not null,
 reviewed_by uuid references public.admin_users(id) on delete set null,
 review_note text not null,
 reviewed_at timestamptz not null default now()
);
alter table public.quote_email_send_reviews enable row level security;
revoke all on public.quote_email_send_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.quote_email_send_reviews to service_role;

create or replace function public.release_quote_email_after_review(
 p_quote_id uuid,p_quote_number text,p_reviewer uuid,p_confirmed_not_sent boolean,p_note text
) returns void language plpgsql security invoker set search_path='' as $
declare a public.quote_email_send_attempts%rowtype; v_quote_number text;
begin
 select quote_number into v_quote_number from public.quotes where id=p_quote_id for update;
 if v_quote_number is null or v_quote_number<>p_quote_number or p_confirmed_not_sent is distinct from true
 then raise exception 'quote_release_confirmation_required'; end if;
 select * into a from public.quote_email_send_attempts
 where quote_id=p_quote_id for update;
 if not found or a.state not in ('claimed','needs_review')
 then raise exception 'quote_attempt_not_releasable'; end if;
 if a.claimed_at>now()-interval '5 minutes' then
  raise exception 'quote_attempt_too_recent'; end if;
 if length(btrim(coalesce(p_note,'')))<12 then raise exception 'quote_review_note_required'; end if;
 insert into public.quote_email_send_reviews(
  quote_id,previous_state,previous_idempotency_key,previous_recipient,reviewed_by,review_note
 ) values (p_quote_id,a.state,a.idempotency_key,a.recipient,p_reviewer,left(p_note,1200));
 update public.quote_email_send_attempts set state='released',
  reviewed_at=now(),review_note=left(p_note,1200),updated_at=now()
 where quote_id=p_quote_id;
end; $;

-- This transaction either activates the revision AND logs the send,
-- or leaves the provider acknowledgment for safe local recovery.
create or replace function public.complete_quote_email_send(
 p_quote_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.quote_email_send_attempts%rowtype; sent_timestamp timestamptz; locked_quote uuid;
begin
 select id into locked_quote from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'quote_not_found'; end if;
 select * into a from public.quote_email_send_attempts where quote_id=p_quote_id for update;
 if not found or a.idempotency_key is distinct from p_idempotency_key
 then raise exception 'quote_email_attempt_not_found'; end if;
 if a.state='sent' then return jsonb_build_object('state','sent','sentAt',a.sent_at); end if;
 if a.state<>'provider_accepted' or a.provider_email_id is null
 then raise exception 'quote_email_not_provider_accepted'; end if;
 sent_timestamp=coalesce(a.provider_accepted_at,now());
 perform public.activate_quote_revision(p_quote_id,sent_timestamp);
 update public.quotes set issued_via='email',updated_at=sent_timestamp where id=p_quote_id;
 insert into public.quote_send_log(quote_id,recipient,delivery_type,sent_at)
 values(p_quote_id,a.recipient,a.delivery_type,sent_timestamp);
 update public.quote_email_send_attempts
 set state='sent',sent_at=sent_timestamp,updated_at=now()
 where quote_id=p_quote_id;
 return jsonb_build_object('state','sent','sentAt',sent_timestamp);
end; $$;

-- Only permit revision activation after the provider has acknowledged the send.
-- This prevents draft edits or deletion while an ambiguous customer message exists.
create or replace function public.guard_quote_email_dispatch()
returns trigger language plpgsql security invoker set search_path='' as $$
declare st text;
begin
 if TG_OP='DELETE' then
  if exists(select 1 from public.quote_email_send_attempts where quote_id=old.id)
  then raise exception 'quote_email_dispatch_exists'; end if;
  return old;
 end if;
 if old.status='draft' then
  select state into st from public.quote_email_send_attempts
   where quote_id=old.id and state in ('claimed','needs_review','provider_accepted');
  if st is not null and not (st='provider_accepted' and new.status='sent' and new.sent_at is not null) then
   raise exception 'quote_email_dispatch_in_progress';
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists guard_quote_email_dispatch_on_quotes on public.quotes;
create trigger guard_quote_email_dispatch_on_quotes before update or delete
on public.quotes for each row execute function public.guard_quote_email_dispatch();

revoke execute on function public.claim_quote_email_send(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke execute on function public.quote_email_provider_accepted(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.quote_email_send_uncertain(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.complete_quote_email_send(uuid,text) from public,anon,authenticated;
revoke execute on function public.guard_quote_email_dispatch() from public,anon,authenticated;
revoke execute on function public.release_quote_email_after_review(uuid,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_quote_email_send(uuid,timestamptz,text,text) to service_role;
grant execute on function public.quote_email_provider_accepted(uuid,text,text) to service_role;
grant execute on function public.quote_email_send_uncertain(uuid,text,text) to service_role;
grant execute on function public.complete_quote_email_send(uuid,text) to service_role;
grant execute on function public.release_quote_email_after_review(uuid,text,uuid,boolean,text) to service_role;
