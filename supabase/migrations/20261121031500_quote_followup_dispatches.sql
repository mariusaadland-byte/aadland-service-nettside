-- S-03: Durable once-per-quote automated follow-up, with explicit owner review.
-- A failed/unknown provider response never makes the quote eligible for automatic retry.
create table if not exists public.quote_followup_dispatches (
 quote_id uuid primary key references public.quotes(id) on delete restrict,
 recipient text not null check(length(recipient) between 3 and 240),
 idempotency_key text not null unique,
 state text not null check(state in ('claimed','needs_review','provider_accepted','sent','released')),
 provider_email_id text,
 claimed_at timestamptz not null default now(),
 provider_accepted_at timestamptz,
 sent_at timestamptz,
 reviewed_at timestamptz,
 last_error text,
 updated_at timestamptz not null default now()
);
create index if not exists quote_followup_dispatches_state_idx
 on public.quote_followup_dispatches(state,updated_at desc);
alter table public.quote_followup_dispatches enable row level security;
revoke all on public.quote_followup_dispatches from public,anon,authenticated;
grant select,insert,update,delete on public.quote_followup_dispatches to service_role;

create table if not exists public.quote_followup_reviews (
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null references public.quotes(id) on delete restrict,
 previous_state text not null,
 previous_key text not null,
 recipient text not null,
 action text not null check(action in ('release_unsent','confirm_sent')),
 provider_email_id text,
 reviewed_by uuid references public.admin_users(id) on delete set null,
 note text not null check(length(note) between 12 and 1200),
 reviewed_at timestamptz not null default now()
);
create index if not exists quote_followup_reviews_quote_idx on public.quote_followup_reviews(quote_id,reviewed_at desc);
alter table public.quote_followup_reviews enable row level security;
revoke all on public.quote_followup_reviews from public,anon,authenticated;
grant select,insert on public.quote_followup_reviews to service_role;

-- Claim by locking the quote: one transaction decides eligibility and acquires one dispatch.
create or replace function public.claim_quote_followup(
 p_quote_id uuid,p_recipient text,p_cutoff timestamptz,p_local_today date
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.quotes%rowtype; a public.quote_followup_dispatches%rowtype; v_key text;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then return jsonb_build_object('state','skipped','reason','missing'); end if;
 if q.status<>'sent' or q.auto_follow_up is distinct from true
    or q.follow_up_sent_at is not null or q.archived_at is not null
    or q.sent_at is null or q.sent_at>p_cutoff
    or (q.valid_until is not null and q.valid_until<p_local_today)
    or q.issued_via='paper'
 then return jsonb_build_object('state','skipped','reason','not_eligible'); end if;
 if p_recipient is null or length(p_recipient)<3 or length(p_recipient)>240
    or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then return jsonb_build_object('state','skipped','reason','invalid_email'); end if;

 select * into a from public.quote_followup_dispatches where quote_id=p_quote_id for update;
 if found then
  if a.state='provider_accepted' then
   return jsonb_build_object('state','provider_accepted','key',a.idempotency_key);
  end if;
  if a.state='released' then
   v_key='quote-followup-'||gen_random_uuid()::text;
   update public.quote_followup_dispatches
   set recipient=p_recipient,idempotency_key=v_key,state='claimed',
       provider_email_id=null,provider_accepted_at=null,sent_at=null,
       claimed_at=now(),last_error=null,reviewed_at=null,updated_at=now()
   where quote_id=p_quote_id;
   return jsonb_build_object('state','claimed','key',v_key);
  end if;
  return jsonb_build_object('state','blocked','reason',a.state);
 end if;

 v_key='quote-followup-'||gen_random_uuid()::text;
 insert into public.quote_followup_dispatches(quote_id,recipient,idempotency_key,state)
 values(p_quote_id,p_recipient,v_key,'claimed');
 return jsonb_build_object('state','claimed','key',v_key);
end; $$;

create or replace function public.quote_followup_provider_accepted(
 p_quote_id uuid,p_key text,p_provider_email_id text
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if length(btrim(coalesce(p_provider_email_id,'')))<3 then raise exception 'provider_id_required'; end if;
 update public.quote_followup_dispatches set state='provider_accepted',
  provider_email_id=p_provider_email_id,provider_accepted_at=now(),updated_at=now()
 where quote_id=p_quote_id and idempotency_key=p_key and state='claimed';
 if not found then raise exception 'quote_followup_not_claimed'; end if;
end; $$;

create or replace function public.quote_followup_uncertain(
 p_quote_id uuid,p_key text,p_reason text
) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.quote_followup_dispatches
 set state='needs_review',last_error=left(coalesce(p_reason,'Uavklart levering'),250),
 updated_at=now()
 where quote_id=p_quote_id and idempotency_key=p_key and state='claimed';
 -- Never downgrade a provider-accepted/sent follow-up.
end; $$;

-- Transactionally store provider acknowledgment and quote marker. Never send here.
create or replace function public.complete_quote_followup(
 p_quote_id uuid,p_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.quote_followup_dispatches%rowtype; q public.quotes%rowtype; v_sent timestamptz;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'quote_not_found'; end if;
 select * into a from public.quote_followup_dispatches where quote_id=p_quote_id for update;
 if not found or a.idempotency_key is distinct from p_key then raise exception 'quote_followup_attempt_not_found'; end if;
 if a.state='sent' then return jsonb_build_object('state','sent','sentAt',a.sent_at); end if;
 if a.state<>'provider_accepted' or a.provider_email_id is null then raise exception 'quote_followup_unconfirmed'; end if;
 v_sent=coalesce(a.provider_accepted_at,now());
 update public.quote_followup_dispatches set state='sent',sent_at=v_sent,updated_at=now()
 where quote_id=p_quote_id;
 -- If the quote was accepted/cancelled since the send began, retain its state.
 update public.quotes set follow_up_sent_at=coalesce(follow_up_sent_at,v_sent),
 updated_at=now() where id=p_quote_id;
 return jsonb_build_object('state','sent','sentAt',v_sent);
end; $$;

create or replace function public.review_quote_followup(
 p_quote_id uuid,p_quote_number text,p_reviewer uuid,p_action text,
 p_confirmation text,p_note text,p_provider_email_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.quote_followup_dispatches%rowtype; q public.quotes%rowtype; v_action text; v_provider_id text;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if not found or q.quote_number<>p_quote_number then raise exception 'quote_identity_mismatch'; end if;
 select * into a from public.quote_followup_dispatches where quote_id=p_quote_id for update;
 if not found or a.state not in ('claimed','needs_review') then raise exception 'no_uncertain_followup'; end if;
 if a.claimed_at>now()-interval '5 minutes' then raise exception 'followup_still_active'; end if;
 if length(btrim(coalesce(p_note,'')))<12 then raise exception 'review_note_required'; end if;
 v_action=case
  when p_action='release_unsent' and p_confirmation='IKKE SENDT' then 'release_unsent'
  when p_action='confirm_sent' and p_confirmation='BEKREFTET I RESEND' then 'confirm_sent'
  else null end;
 if v_action is null then raise exception 'explicit_review_confirmation_required'; end if;
 v_provider_id=case when v_action='confirm_sent' then btrim(coalesce(p_provider_email_id,'')) else null end;
 if v_action='confirm_sent' and (length(v_provider_id)<8 or length(v_provider_id)>240)
 then raise exception 'provider_id_required'; end if;
 insert into public.quote_followup_reviews(
  quote_id,previous_state,previous_key,recipient,action,provider_email_id,reviewed_by,note
 ) values(p_quote_id,a.state,a.idempotency_key,a.recipient,v_action,v_provider_id,p_reviewer,left(btrim(p_note),1200));
 if v_action='confirm_sent' then
  update public.quote_followup_dispatches set state='provider_accepted',
   provider_email_id=v_provider_id,provider_accepted_at=now(),reviewed_at=now(),updated_at=now()
  where quote_id=p_quote_id;
  return jsonb_build_object('state','provider_accepted');
 end if;
 update public.quote_followup_dispatches set state='released',reviewed_at=now(),updated_at=now()
 where quote_id=p_quote_id;
 return jsonb_build_object('state','released');
end; $$;

revoke execute on function public.claim_quote_followup(uuid,text,timestamptz,date) from public,anon,authenticated;
revoke execute on function public.quote_followup_provider_accepted(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.quote_followup_uncertain(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.complete_quote_followup(uuid,text) from public,anon,authenticated;
revoke execute on function public.review_quote_followup(uuid,text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_quote_followup(uuid,text,timestamptz,date) to service_role;
grant execute on function public.quote_followup_provider_accepted(uuid,text,text) to service_role;
grant execute on function public.quote_followup_uncertain(uuid,text,text) to service_role;
grant execute on function public.complete_quote_followup(uuid,text) to service_role;
grant execute on function public.review_quote_followup(uuid,text,uuid,text,text,text,text) to service_role;
