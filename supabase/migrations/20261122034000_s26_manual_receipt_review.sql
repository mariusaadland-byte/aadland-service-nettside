-- S-26 owner-led manual resolution of uncertain receipt sending.
-- This never contacts Resend, updates payment amounts, or retries an email.
create function public.review_manual_product_receipt(
 p_order_id uuid,p_reviewer_id uuid,p_result text,p_note text,
 p_provider_email_id text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $review$
declare
 r public.manual_order_payment_receipts%rowtype;
 note text:=trim(coalesce(p_note,''));
 provider text:=trim(coalesce(p_provider_email_id,''));
 stamp timestamptz:=now();
begin
 if p_order_id is null or p_reviewer_id is null or
   p_result not in ('sent','unsent') or
   length(note) not between 12 and 1200 then
  raise exception 'S26_INVALID_RECEIPT_REVIEW';
 end if;
 if p_result='sent' and length(provider) not between 8 and 240
 then raise exception 'S26_VERIFIED_RESEND_ID_REQUIRED'; end if;
 select * into r from public.manual_order_payment_receipts
  where order_id=p_order_id for update;
 if not found or r.receipt_state not in ('sending','needs_review')
 then raise exception 'S26_RECEIPT_NOT_REVIEWABLE'; end if;
 if r.claimed_at>stamp-interval '5 minutes'
 then raise exception 'S26_RECEIPT_MAY_STILL_BE_SENDING'; end if;
 update public.manual_order_payment_receipts
 set receipt_state=case when p_result='sent' then 'reviewed_sent'
   else 'reviewed_unsent' end,
   provider_email_id=case when p_result='sent' then provider else null end,
   sent_at=case when p_result='sent' then stamp else null end,
   reviewed_at=stamp,reviewed_by=p_reviewer_id,review_note=note,
   updated_at=stamp
 where id=r.id;
 if p_result='sent' then
  update public.orders
  set receipt_sent_at=coalesce(receipt_sent_at,stamp),updated_at=stamp
  where id=r.order_id;
 end if;
 return jsonb_build_object('ok',true,'state',
  case when p_result='sent' then 'reviewed_sent' else 'reviewed_unsent' end);
end;
$review$;
revoke all on function public.review_manual_product_receipt(uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.review_manual_product_receipt(uuid,uuid,text,text,text)
 to service_role;
