-- S-30: Service-only Vipps capture, cancel and refund actions.
-- Never allow a new economic action while the prior result is unknown.
create table public.vipps_service_action_attempts(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 request_id uuid not null,
 payment_reference text not null check(length(payment_reference) between 1 and 120),
 action text not null check(action in ('capture','cancel','refund')),
 amount_ore bigint not null check(amount_ore>=0),
 idempotency_key text generated always as ('s30-'||id::text) stored,
 state text not null default 'sending' check(state in
  ('sending','needs_review','accepted','reviewed_effect','reviewed_no_effect')),
 claimed_at timestamptz not null default now(),
 provider_ack_at timestamptz,
 provider_evidence jsonb,
 last_issue text,
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_note text,
 updated_at timestamptz not null default now(),
 constraint s30_unique_user_intent unique(order_id,request_id),
 constraint s30_action_amount_check check (
  (action='cancel' and amount_ore=0) or
  (action in ('capture','refund') and amount_ore>0)),
 constraint s30_accepted_evidence check(
  state<>'accepted' or provider_ack_at is not null)
);
create unique index s30_one_unresolved_per_service_order
 on public.vipps_service_action_attempts(order_id)
 where state in ('sending','needs_review');
create index s30_service_action_recent
 on public.vipps_service_action_attempts(order_id,claimed_at desc);
create index s30_service_action_owner_review
 on public.vipps_service_action_attempts(claimed_at)
 where state in ('sending','needs_review');
alter table public.vipps_service_action_attempts enable row level security;
revoke all on public.vipps_service_action_attempts from public,anon,authenticated;
grant select,insert,update on public.vipps_service_action_attempts to service_role;

-- This takes an orders row lock; concurrent requests serialize even if they
-- run in different Vercel processes. It does not call the payment provider.
create function public.claim_vipps_service_action(
 p_order_id uuid,p_reference text,p_request_id uuid,p_action text,p_amount_ore bigint
) returns jsonb language plpgsql security definer set search_path=''
as $s30claim$
declare
 o public.orders%rowtype;
 a public.vipps_service_action_attempts%rowtype;
 ref text;
begin
 if p_order_id is null or p_request_id is null or
  p_action not in ('capture','cancel','refund') or
  ((p_action='cancel') is distinct from (p_amount_ore=0)) or
  p_amount_ore is null or p_amount_ore<0 or p_amount_ore>999999999
 then return jsonb_build_object('state','invalid'); end if;

 select * into o from public.orders where id=p_order_id for update;
 if not found or o.order_type<>'order' or
  lower(coalesce(o.payment_provider,''))<>'vipps'
 then return jsonb_build_object('state','not_eligible'); end if;
 ref:=coalesce(nullif(trim(o.payment_reference),''),trim(o.order_number));
 if ref<>trim(coalesce(p_reference,'')) or length(ref)>120
 then return jsonb_build_object('state','reference_changed'); end if;

 if exists(select 1 from public.vipps_service_action_attempts
  where order_id=o.id and request_id=p_request_id)
 then return jsonb_build_object('state','duplicate_intent'); end if;

 if exists(select 1 from public.vipps_service_action_attempts
  where order_id=o.id and state in ('sending','needs_review'))
 then return jsonb_build_object('state','unresolved'); end if;

 if exists(select 1 from public.vipps_service_action_attempts
  where order_id=o.id and state in ('accepted','reviewed_effect')
   and action=p_action and amount_ore=p_amount_ore
   and claimed_at>now()-interval '15 minutes')
 then return jsonb_build_object('state','recent_same_action'); end if;

 insert into public.vipps_service_action_attempts(
  order_id,request_id,payment_reference,action,amount_ore)
 values(o.id,p_request_id,ref,p_action,p_amount_ore)
 returning * into a;
 return jsonb_build_object('state','claimed','attempt_id',a.id,
  'idempotency_key',a.idempotency_key);
end;
$s30claim$;
revoke all on function public.claim_vipps_service_action(uuid,text,uuid,text,bigint)
 from public,anon,authenticated;
grant execute on function public.claim_vipps_service_action(uuid,text,uuid,text,bigint) to service_role;

create function public.ack_vipps_service_action(
 p_attempt_id uuid,p_provider_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $s30ack$
declare
 updated_id uuid;
begin
 update public.vipps_service_action_attempts
 set state='accepted',provider_ack_at=now(),
  provider_evidence=left(coalesce(p_provider_evidence::text,'{}'),5000)::jsonb,
  last_issue=null,updated_at=now()
 where id=p_attempt_id and state='sending'
 returning id into updated_id;
 return jsonb_build_object('accepted',updated_id is not null);
end;
$s30ack$;
revoke all on function public.ack_vipps_service_action(uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.ack_vipps_service_action(uuid,jsonb) to service_role;

create function public.hold_vipps_service_action(
 p_attempt_id uuid,p_issue text
) returns jsonb language plpgsql security definer set search_path=''
as $s30hold$
declare
 updated_id uuid;
begin
 update public.vipps_service_action_attempts set state='needs_review',
  last_issue=left(coalesce(p_issue,'provider_status_uncertain'),120),
  updated_at=now()
 where id=p_attempt_id and state='sending'
 returning id into updated_id;
 return jsonb_build_object('held',updated_id is not null);
end;
$s30hold$;
revoke all on function public.hold_vipps_service_action(uuid,text)
 from public,anon,authenticated;
grant execute on function public.hold_vipps_service_action(uuid,text) to service_role;

-- Owner must verify payment events or provider dashboard independently.
-- Review does not call Vipps, issue a refund, or change order amounts.
create function public.review_vipps_service_action(
 p_attempt_id uuid,p_reviewer_id uuid,p_result text,
 p_note text,p_evidence text
) returns jsonb language plpgsql security definer set search_path=''
as $s30review$
declare
 a public.vipps_service_action_attempts%rowtype;
 stamp timestamptz:=now();
 next_state text;
begin
 if p_attempt_id is null or p_reviewer_id is null or
  p_result not in ('effect','no_effect') or
  length(trim(coalesce(p_note,''))) not between 16 and 1200 or
  length(trim(coalesce(p_evidence,''))) not between 8 and 240
 then raise exception 'S30_INVALID_REVIEW'; end if;
 select * into a from public.vipps_service_action_attempts
  where id=p_attempt_id for update;
 if not found or a.state not in ('sending','needs_review')
 then raise exception 'S30_NOT_REVIEWABLE'; end if;
 if a.claimed_at>stamp-interval '5 minutes'
 then raise exception 'S30_STILL_SENDING'; end if;
 next_state:=case when p_result='effect'
  then 'reviewed_effect' else 'reviewed_no_effect' end;
 update public.vipps_service_action_attempts
 set state=next_state,reviewed_at=stamp,reviewed_by=p_reviewer_id,
  review_note=trim(p_note),provider_evidence=jsonb_build_object(
   'manual_provider_reference',trim(p_evidence),'outcome',p_result),
  updated_at=stamp
 where id=a.id;
 return jsonb_build_object('reviewed',true,'state',next_state);
end;
$s30review$;
revoke all on function public.review_vipps_service_action(uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.review_vipps_service_action(uuid,uuid,text,text,text) to service_role;
