-- S-26: One auditable, manually verified payment event and one attempt
-- to send its customer receipt. No existing payment rows are rewritten.
create table public.manual_order_payment_receipts(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id) on delete restrict,
 amount_ore integer not null check(amount_ore>0),
 payment_reference text not null check(length(payment_reference) between 3 and 120),
 paid_at timestamptz not null default now(),
 recorded_by uuid not null,
 recipient_email text not null check(length(recipient_email) between 5 and 254),
 receipt_state text not null default 'queued'
   check(receipt_state in ('queued','sending','sent','needs_review','reviewed_sent','reviewed_unsent')),
 claimed_at timestamptz,
 provider_email_id text,
 sent_at timestamptz,
 last_issue text,
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_note text,
 updated_at timestamptz not null default now(),
 constraint s26_receipt_provider_required
  check(receipt_state not in ('sent','reviewed_sent')
        or (provider_email_id is not null and sent_at is not null))
);
create index s26_manual_receipts_attention_idx
 on public.manual_order_payment_receipts(paid_at)
 where receipt_state in ('queued','sending','needs_review');
alter table public.manual_order_payment_receipts enable row level security;
revoke all on public.manual_order_payment_receipts from public,anon,authenticated;
grant select,insert,update on public.manual_order_payment_receipts to service_role;

-- Only a staff-verified and previously UNPAID manual product order may become
-- paid. All financial fields and the receipt journal commit in one transaction.
-- Duplicate requests never modify captured amounts, timestamps or references.
create function public.record_manual_product_payment_once(
 p_order_id uuid,p_reference text,p_actor_id uuid,p_payment_verified boolean
) returns jsonb
language plpgsql security definer set search_path=''
as $s26$
declare
 o public.orders%rowtype;
 receipt public.manual_order_payment_receipts%rowtype;
 ref text:=trim(coalesce(p_reference,''));
 email text;
 stamp timestamptz:=now();
begin
 if p_order_id is null or p_actor_id is null or p_payment_verified is distinct from true
    or length(ref) not between 3 and 120 then
   raise exception 'S26_PAYMENT_CONFIRMATION_REQUIRED';
 end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'S26_ORDER_NOT_FOUND'; end if;
 select * into receipt from public.manual_order_payment_receipts
  where order_id=o.id for update;
 if found then
  if receipt.payment_reference<>ref then raise exception 'S26_REFERENCE_CONFLICT'; end if;
  return jsonb_build_object('existing',true,'order_id',o.id,
    'receipt_id',receipt.id,'receipt_state',receipt.receipt_state);
 end if;
 if o.order_type<>'order'
    or o.archived_at is not null or o.status='cancelled'
    or o.payment_provider is not null
    or o.payment_status not in ('pending','unpaid')
    or coalesce(o.payment_captured_ore,0)<>0
    or coalesce(o.payment_refunded_ore,0)<>0
    or o.receipt_sent_at is not null or o.receipt_sending_at is not null
 then raise exception 'S26_PAYMENT_ALREADY_RECORDED_OR_INELIGIBLE'; end if;
 if coalesce(o.total_ore,0)<=0 then raise exception 'S26_INVALID_ORDER_AMOUNT'; end if;
 email:=lower(trim(coalesce(o.customer->>'email','')));
 if email not like '%@%.%' then raise exception 'S26_CUSTOMER_EMAIL_REQUIRED'; end if;

 update public.orders
 set payment_status='paid',payment_reference=ref,
     payment_captured_ore=o.total_ore,payment_captured_at=stamp,
     updated_at=stamp
 where id=o.id;
 insert into public.manual_order_payment_receipts(
  order_id,amount_ore,payment_reference,paid_at,recorded_by,recipient_email,receipt_state
 ) values(o.id,o.total_ore,ref,stamp,p_actor_id,email,'queued')
 returning * into receipt;
 return jsonb_build_object('existing',false,'order_id',o.id,
  'receipt_id',receipt.id,'receipt_state',receipt.receipt_state);
end;
$s26$;
revoke all on function public.record_manual_product_payment_once(uuid,text,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.record_manual_product_payment_once(uuid,text,uuid,boolean)
 to service_role;

-- An unattempted ('queued') receipt may be claimed ONE time. A timeout leaves
-- it 'sending' or 'needs_review' forever until an owner checks Resend.
create function public.claim_manual_product_receipt(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $s26claim$
declare
 r public.manual_order_payment_receipts%rowtype;
begin
 update public.manual_order_payment_receipts m
 set receipt_state='sending',claimed_at=now(),updated_at=now()
 from public.orders o
 where m.order_id=p_order_id and m.receipt_state='queued'
   and o.id=m.order_id and o.order_type='order'
   and o.payment_status='paid'
   and coalesce(o.payment_captured_ore,0)=m.amount_ore
   and coalesce(o.payment_refunded_ore,0)=0
   and lower(trim(coalesce(o.customer->>'email','')))=m.recipient_email
 returning m.* into r;
 if not found then return null; end if;
 return jsonb_build_object('id',r.id,'order_id',r.order_id,
  'recipient_email',r.recipient_email,'paid_at',r.paid_at);
end;
$s26claim$;
revoke all on function public.claim_manual_product_receipt(uuid)
 from public,anon,authenticated;
grant execute on function public.claim_manual_product_receipt(uuid) to service_role;

-- Provider-accepted delivery receipt and old compatibility marker are
-- acknowledged atomically, without re-recording a payment.
create function public.ack_manual_product_receipt(
 p_receipt_id uuid,p_provider_email_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $s26ack$
declare
 r public.manual_order_payment_receipts%rowtype;
 stamp timestamptz:=now();
begin
 if p_receipt_id is null or length(trim(coalesce(p_provider_email_id,''))) not between 8 and 240
 then raise exception 'S26_PROVIDER_ID_REQUIRED'; end if;
 update public.manual_order_payment_receipts
 set receipt_state='sent',sent_at=stamp,
  provider_email_id=trim(p_provider_email_id),last_issue=null,updated_at=stamp
 where id=p_receipt_id and receipt_state='sending'
 returning * into r;
 if not found then raise exception 'S26_RECEIPT_ALREADY_HANDLED'; end if;
 update public.orders
 set receipt_sent_at=coalesce(receipt_sent_at,stamp),updated_at=stamp
 where id=r.order_id;
 if not found then raise exception 'S26_ORDER_MISSING_FOR_RECEIPT'; end if;
 return jsonb_build_object('ok',true,'order_id',r.order_id,'receipt_id',r.id);
end;
$s26ack$;
revoke all on function public.ack_manual_product_receipt(uuid,text)
 from public,anon,authenticated;
grant execute on function public.ack_manual_product_receipt(uuid,text) to service_role;

create function public.hold_manual_product_receipt(
 p_receipt_id uuid,p_issue text
) returns jsonb
language plpgsql security definer set search_path=''
as $s26hold$
declare
 r public.manual_order_payment_receipts%rowtype;
begin
 update public.manual_order_payment_receipts
 set receipt_state='needs_review',
   last_issue=left(coalesce(p_issue,'provider_status_uncertain'),120),
   updated_at=now()
 where id=p_receipt_id and receipt_state='sending'
 returning * into r;
 return jsonb_build_object('held',found);
end;
$s26hold$;
revoke all on function public.hold_manual_product_receipt(uuid,text)
 from public,anon,authenticated;
grant execute on function public.hold_manual_product_receipt(uuid,text)
 to service_role;
