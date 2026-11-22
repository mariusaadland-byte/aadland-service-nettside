DO $s26_review$
DECLARE
 v_order uuid;
 v_staff uuid:=gen_random_uuid();
 v_id text:='S26-REVIEW-'||left(replace(gen_random_uuid()::text,'-',''),10);
 v_first jsonb;
 v_claim jsonb;
 v_review jsonb;
 v_orders_before int;
 v_journal_before int;
BEGIN
 SELECT count(*) INTO v_orders_before FROM public.orders;
 SELECT count(*) INTO v_journal_before FROM public.manual_order_payment_receipts;
 BEGIN
  INSERT INTO public.orders(order_number,order_type,status,customer,fulfillment_type,
    items,total_ore,shipping_ore,payment_status)
  VALUES(v_id,'order','new',
    '{"name":"Synthetic","email":"fake@example.invalid","phone":"0000"}'::jsonb,
    'pickup','[]'::jsonb,30000,0,'pending') RETURNING id INTO v_order;
  v_first:=public.record_manual_product_payment_once(v_order,'BANK-SYNTH-0001',v_staff,true);
  v_claim:=public.claim_manual_product_receipt(v_order);
  IF v_claim->>'id' IS NULL THEN RAISE EXCEPTION 'S26_REVIEW_CLAIM_FAILED'; END IF;
  PERFORM public.hold_manual_product_receipt((v_claim->>'id')::uuid,'synthetic timeout');
  -- Emulates the passage of time inside a transaction without actually
  -- contacting a delivery provider, or waiting for five wall-clock minutes.
  UPDATE public.manual_order_payment_receipts
   SET claimed_at=now()-interval '6 minutes' WHERE order_id=v_order;
  BEGIN
   PERFORM public.review_manual_product_receipt(v_order,v_staff,'sent','too short',null);
   RAISE EXCEPTION 'S26_REVIEW_SHORT_NOTE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'S26_INVALID_RECEIPT_REVIEW' THEN RAISE; END IF;
  END;
  BEGIN
   PERFORM public.review_manual_product_receipt(v_order,v_staff,'sent',
     'Synthetic confirmation after checking provider','');
   RAISE EXCEPTION 'S26_REVIEW_MISSING_PROVIDER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'S26_VERIFIED_RESEND_ID_REQUIRED' THEN RAISE; END IF;
  END;
  v_review:=public.review_manual_product_receipt(v_order,v_staff,'sent',
   'Synthetic provider receipt was verified by owner','resend-s26-synthetic-check-00001');
  IF v_review->>'state'<>'reviewed_sent' THEN RAISE EXCEPTION 'S26_REVIEW_NOT_LOGGED'; END IF;
  IF (SELECT receipt_sent_at FROM public.orders WHERE id=v_order) IS NULL
  THEN RAISE EXCEPTION 'S26_REVIEW_COMPAT_MARKER_MISSING'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.manual_order_payment_receipts
     WHERE order_id=v_order AND receipt_state='reviewed_sent'
       AND provider_email_id='resend-s26-synthetic-check-00001'
       AND reviewed_by=v_staff AND review_note LIKE 'Synthetic provider%')
  THEN RAISE EXCEPTION 'S26_REVIEW_AUDIT_MISSING'; END IF;
  BEGIN
   PERFORM public.review_manual_product_receipt(v_order,v_staff,'unsent',
     'Attempt to silently rewrite the same review',null);
   RAISE EXCEPTION 'S26_DOUBLE_REVIEW_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'S26_RECEIPT_NOT_REVIEWABLE' THEN RAISE; END IF;
  END;
  RAISE EXCEPTION 'S26_REVIEW_ROLLBACK_OK';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'S26_REVIEW_ROLLBACK_OK' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.orders)<>v_orders_before OR
    (SELECT count(*) FROM public.manual_order_payment_receipts)<>v_journal_before
 THEN RAISE EXCEPTION 'S26_REVIEW_TEST_LEFT_ROWS'; END IF;
 RAISE NOTICE 'S26 REVIEW PASS: owner note, verified Resend ID, one status transition, no repeat, no persisted data';
END
$s26_review$;