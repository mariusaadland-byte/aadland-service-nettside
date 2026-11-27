-- Run in an isolated database with the Service orders migrations installed.
-- Simulated provider totals only. Every inserted row is rolled back.
begin;

do $test$
declare
 reference text:='AS-VIPPS-TEST-'||gen_random_uuid();
 target_id uuid;
 result jsonb;
 amounts integer[];
begin
 insert into public.orders(
  order_number,order_type,customer,fulfillment_type,total_ore,
  payment_status,payment_provider,payment_reference
 ) values (
  reference,'order','{"email":"test@example.invalid"}','pickup',1000,
  'pending','vipps',reference
 ) returning id into target_id;

 -- A status lookup sees the first partial capture before the webhook.
 perform public.sync_vipps_payment_snapshot('service',reference,'AUTHORIZED',null,1000,0,400,0);
 result:=public.process_service_vipps_economic_webhook(
  reference||'-capture1',reference||'-psp1',reference,'CAPTURED',400,now(),null,'{}',
  null,1000,0,400,0);
 if (result->'applied'->>'status') is distinct from 'partial'
 then raise exception 'CAPTURE_STATUS_INCORRECT'; end if;
 if (select payment_captured_ore from public.orders where id=target_id)<>400
 then raise exception 'CAPTURE_COUNTED_TWICE'; end if;

 -- The webhook sees the second partial capture first. Re-delivery and a
 -- late older snapshot both preserve the new total.
 perform public.process_service_vipps_economic_webhook(
  reference||'-capture2',reference||'-psp2',reference,'CAPTURED',600,now(),null,'{}',
  null,1000,0,1000,0);
 result:=public.process_service_vipps_economic_webhook(
  reference||'-capture2',reference||'-psp2',reference,'CAPTURED',600,now(),null,'{}',
  null,1000,0,1000,0);
 if result->>'duplicate' is distinct from 'true'
 then raise exception 'REPEATED_WEBHOOK_NOT_RECOGNIZED'; end if;
 perform public.process_service_vipps_economic_webhook(
  reference||'-late',reference||'-psp3',reference,'CAPTURED',400,now(),null,'{}',
  null,1000,0,400,0);
 if (select payment_status from public.orders where id=target_id)<>'paid'
 then raise exception 'LATE_SNAPSHOT_LOST_PAID_STATUS'; end if;

 -- A refund seen by a status lookup must remain partial when its webhook arrives.
 perform public.sync_vipps_payment_snapshot('service',reference,'AUTHORIZED',null,1000,0,1000,250);
 perform public.process_service_vipps_economic_webhook(
  reference||'-refund',reference||'-psp4',reference,'REFUNDED',250,now(),null,'{}',
  null,1000,0,1000,250);
 select array[payment_captured_ore,payment_refunded_ore] into amounts
 from public.orders where id=target_id;
 if amounts is distinct from array[1000,250]
 then raise exception 'CAPTURE_OR_REFUND_TOTAL_INCORRECT'; end if;
 if (select count(*) from private.vipps_payment_events
     where payment_reference=reference and processed_at is not null)<>4
 then raise exception 'WEBHOOK_JOURNAL_INCORRECT'; end if;
end;
$test$;

rollback;
