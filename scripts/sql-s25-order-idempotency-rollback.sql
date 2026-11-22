-- S25 SYNTHETIC CHECK. Run through a privileged SQL session only.
-- Every temporary order/product/photo is forcibly rolled back, including after
-- successful assertions. No Vipps or Resend requests are made.
DO $s25$
DECLARE
 v_key uuid:=gen_random_uuid();
 v_custom_key uuid:=gen_random_uuid();
 v_hash text:=repeat('a',64);
 v_product text:='s25-test-'||left(replace(gen_random_uuid()::text,'-',''),16);
 v_number text:='AS-S25-TEST-'||left(replace(gen_random_uuid()::text,'-',''),8);
 v_path text:='contact/2026-11-22/'||gen_random_uuid()::text||'.jpg';
 v_record jsonb;
 v_result jsonb;
 v_again jsonb;
 v_order_id uuid;
 v_custom_id uuid;
 v_stock int;
 v_count_before int;
 v_products_before int;
 v_receipts_before int;
 v_stage int:=0;
BEGIN
 select count(*) into v_count_before from public.orders;
 select count(*) into v_products_before from public.products;
 select count(*) into v_receipts_before from public.contact_image_uploads;
 BEGIN
  insert into public.products(id,slug,name,category,description,base_price_ore,inventory_mode,stock_quantity)
  values(v_product,v_product,'Synthetic S25','Internal','Never persisted',1000,'stock',3);
  v_record:=jsonb_build_object('order_number',v_number,'order_type','order','status','new',
   'customer',jsonb_build_object('name','Fake','email','test@example.invalid','phone','000000'),
   'fulfillment_type','pickup',
   'items',jsonb_build_array(jsonb_build_object('productId',v_product,'quantity',2,'inventoryMode','stock')),
   'total_ore',2000,'shipping_ore',0,'payment_status','pending',
   'payment_provider','vipps','payment_reference',v_number,
   'vipps_checkout_started_at',now(),'terms_version','2026-10','terms_accepted_at',now());
  v_result:=public.create_service_order_once(v_key,v_hash,v_record,
   jsonb_build_array(jsonb_build_object('id',v_product,'quantity',2)),'[]'::jsonb);
  v_order_id:=(v_result->>'order_id')::uuid;
  v_again:=public.create_service_order_once(v_key,v_hash,v_record,
   jsonb_build_array(jsonb_build_object('id',v_product,'quantity',2)),'[]'::jsonb);
  if v_again->>'existing'<>'true' or v_again->>'order_id'<>v_order_id::text
   then raise exception 'S25_REPLAY_FAILED';end if;
  select p.stock_quantity into v_stock from public.products p where p.id=v_product;
  if v_stock<>1 then raise exception 'S25_DOUBLE_STOCK_RESERVATION';end if;
  v_stage:=1;
  begin
   perform public.create_service_order_once(v_key,repeat('b',64),v_record,'[]'::jsonb,'[]'::jsonb);
   raise exception 'S25_WRONG_FINGERPRINT_ACCEPTED';
  exception when others then
   if SQLERRM<>'S25_ORDER_INTENT_CONFLICT' then raise;end if;
  end;
  v_stage:=2;
  v_result:=public.claim_service_order_vipps(v_key,v_hash);
  if v_result->>'order_id'<>v_order_id::text then raise exception 'S25_VIPPS_NOT_CLAIMED';end if;
  v_again:=public.claim_service_order_vipps(v_key,v_hash);
  if v_again is not null then raise exception 'S25_DOUBLE_VIPPS_CLAIM';end if;
  v_result:=public.complete_service_order_vipps(v_key,v_hash,
   'https://apitest.vipps.no/s25-synthetic-only','synthetic-psp-0000001');
  if v_result->>'ready'<>'true' or
   (select o.checkout_provider_state from public.orders o where o.id=v_order_id)<>'ready'
  then raise exception 'S25_VIPPS_NOT_ACKNOWLEDGED';end if;
  v_stage:=3;
  begin
   perform public.create_service_order_once(gen_random_uuid(),v_hash,
    v_record||jsonb_build_object('order_number',v_number||'-other','payment_reference',v_number||'-other'),
    jsonb_build_array(jsonb_build_object('id',v_product,'quantity',90)),'[]'::jsonb);
   raise exception 'S25_OVERSOLD_NOT_REJECTED';
  exception when others then
   if SQLERRM not like 'INSUFFICIENT_STOCK:%' then raise;end if;
  end;
  v_stage:=4;
  insert into public.contact_image_uploads(storage_path,receipt_hash)
   values(v_path,repeat('c',64));
  v_record:=jsonb_build_object('order_number',v_number||'-custom','order_type','custom','status','new',
   'customer',jsonb_build_object('name','Fake','email','test@example.invalid','phone','000000'),
   'fulfillment_type','pickup','items','[]'::jsonb,
   'custom_request','Synthetic order test - never delivered','total_ore',0,'shipping_ore',0,'payment_status','unpaid');
  v_result:=public.create_service_order_once(v_custom_key,v_hash,v_record,'[]'::jsonb,
   jsonb_build_array(jsonb_build_object('path',v_path,'receiptHash',repeat('c',64))));
  v_custom_id:=(v_result->>'order_id')::uuid;
  v_again:=public.create_service_order_once(v_custom_key,v_hash,v_record,'[]'::jsonb,
   jsonb_build_array(jsonb_build_object('path',v_path,'receiptHash',repeat('c',64))));
  if v_again->>'order_id'<>v_custom_id::text or v_again->>'existing'<>'true'
   then raise exception 'S25_CUSTOM_IMAGE_REPLAY_FAILED';end if;
  if (select p.state from public.contact_image_uploads p where p.storage_path=v_path)<>'linked'
   then raise exception 'S25_IMAGE_NOT_LINKED';end if;
  v_stage:=5;
  raise exception 'S25_ROLLBACK_OK';
 EXCEPTION WHEN OTHERS THEN
  if SQLERRM<>'S25_ROLLBACK_OK' then raise exception 'S25_STAGE_%: %',v_stage,SQLERRM;end if;
 END;
 if (select count(*) from public.orders)<>v_count_before
  or (select count(*) from public.products)<>v_products_before
  or (select count(*) from public.contact_image_uploads)<>v_receipts_before
  or v_stage<>5 then raise exception 'S25_ROLLBACK_FAILED';end if;
 raise notice 'S25 PASS: one order and stock reservation, conflict, Vipps only one claim, no overselling, same custom receipt once; all test data rolled back';
END $s25$;
