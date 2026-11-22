-- S-26 synthetic transactional assertions. All data is deliberately rolled
-- back before this DO block returns. No real payment or email is sent.
DO $s26_test$
DECLARE
 v_order_id uuid;
 actor uuid:=gen_random_uuid();
 order_number text:='S26-TEST-'||left(replace(gen_random_uuid()::text,'-',''),12);
 first jsonb; again jsonb; claim jsonb; claimed_again jsonb; ack jsonb;
 initial_orders int; initial_receipts int; marker timestamptz;
 ref text:='S26-SYNTHETIC-BANK-'||left(replace(gen_random_uuid()::text,'-',''),8);
 paid_at_first timestamptz; steps int:=0;
BEGIN
 select count(*) into initial_orders from public.orders;
 select count(*) into initial_receipts from public.manual_order_payment_receipts;
 BEGIN
  insert into public.orders(order_number,order_type,status,customer,fulfillment_type,
   items,total_ore,shipping_ore,payment_status)
   values(order_number,'order','new',
    jsonb_build_object('name','Syntetisk test','email','test@example.invalid','phone','00000'),
    'pickup','[]'::jsonb,125000,0,'pending') returning id into v_order_id;
  BEGIN
   PERFORM public.record_manual_product_payment_once(v_order_id,ref,actor,false);
   RAISE EXCEPTION 'S26_UNVERIFIED_PAYMENT_ACCEPTED';
  EXCEPTION WHEN others THEN
   IF SQLERRM<>'S26_PAYMENT_CONFIRMATION_REQUIRED' THEN RAISE; END IF;
  END;
  steps:=steps+1;
  first:=public.record_manual_product_payment_once(v_order_id,ref,actor,true);
  IF first->>'existing'<>'false' THEN RAISE EXCEPTION 'S26_FIRST_PAYMENT_NOT_NEW'; END IF;
  select payment_captured_at into paid_at_first from public.orders where id=v_order_id;
  IF NOT EXISTS(select 1 from public.orders where id=v_order_id and payment_status='paid'
     and payment_captured_ore=125000 and payment_reference=ref and payment_captured_at is not null)
  THEN RAISE EXCEPTION 'S26_CAPTURE_AMOUNT_MISSING'; END IF;
  IF NOT EXISTS(select 1 from public.manual_order_payment_receipts where order_id=v_order_id
    and receipt_state='queued' and payment_reference=ref and recorded_by=actor
    and amount_ore=125000) THEN RAISE EXCEPTION 'S26_PAYMENT_JOURNAL_MISSING'; END IF;
  steps:=steps+1;
  again:=public.record_manual_product_payment_once(v_order_id,ref,actor,true);
  IF again->>'existing'<>'true' OR again->>'receipt_id'<>first->>'receipt_id'
    OR (select payment_captured_at from public.orders where id=v_order_id) IS DISTINCT FROM paid_at_first
  THEN RAISE EXCEPTION 'S26_DUPLICATE_CHANGED_FINANCIAL_RECORD'; END IF;
  BEGIN
   PERFORM public.record_manual_product_payment_once(v_order_id,'DIFFERENT-BANK-REFERENCE',actor,true);
   RAISE EXCEPTION 'S26_REFERENCE_CHANGED_ON_REPLAY';
  EXCEPTION WHEN others THEN
   IF SQLERRM<>'S26_REFERENCE_CONFLICT' THEN RAISE; END IF;
  END;
  steps:=steps+1;
  claim:=public.claim_manual_product_receipt(v_order_id);
  IF claim->>'id'<>first->>'receipt_id' THEN RAISE EXCEPTION 'S26_FIRST_CLAIM_MISSING'; END IF;
  claimed_again:=public.claim_manual_product_receipt(v_order_id);
  IF claimed_again IS NOT NULL THEN RAISE EXCEPTION 'S26_SECOND_SEND_CLAIM_ACCEPTED'; END IF;
  steps:=steps+1;
  ack:=public.ack_manual_product_receipt((claim->>'id')::uuid,'resend-s26-synthetic-id-00001');
  IF ack->>'ok'<>'true' THEN RAISE EXCEPTION 'S26_PROVIDER_ID_ACK_FAILED'; END IF;
  select receipt_sent_at into marker from public.orders where id=v_order_id;
  IF marker IS NULL THEN RAISE EXCEPTION 'S26_RECEIPT_COMPAT_MARKER_NOT_SAVED'; END IF;
  BEGIN
   PERFORM public.ack_manual_product_receipt((claim->>'id')::uuid,'resend-s26-synthetic-id-00002');
   RAISE EXCEPTION 'S26_SECOND_ACK_ACCEPTED';
  EXCEPTION WHEN others THEN
   IF SQLERRM<>'S26_RECEIPT_ALREADY_HANDLED' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(select 1 from public.manual_order_payment_receipts
    where order_id=v_order_id and receipt_state='sent'
      and provider_email_id='resend-s26-synthetic-id-00001')
  THEN RAISE EXCEPTION 'S26_JOURNAL_PROVIDER_ID_MISSING'; END IF;
  steps:=steps+1;
  RAISE EXCEPTION 'S26_ROLLBACK_SUCCESS';
 EXCEPTION WHEN others THEN
  IF SQLERRM<>'S26_ROLLBACK_SUCCESS' THEN RAISE; END IF;
 END;
 IF (select count(*) from public.orders)<>initial_orders
   OR (select count(*) from public.manual_order_payment_receipts)<>initial_receipts
   OR steps<>5 THEN RAISE EXCEPTION 'S26_TEST_LEFT_PERSISTENT_ROWS'; END IF;
 RAISE NOTICE 'S26 PASS: verified payment, capture timestamp, replay, changed reference, one send claim, provider receipt ack, duplicate ack blocked. All synthetic rows rolled back.';
END
$s26_test$;