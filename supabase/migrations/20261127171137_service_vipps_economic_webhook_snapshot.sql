-- Service product capture/refund webhooks and status checks must both
-- persist absolute Vipps totals. A webhook may follow a status check that
-- already observed the very same capture or refund.
create function public.process_service_vipps_economic_webhook(
 event_idempotency_key text,
 event_psp_reference text,
 event_payment_reference text,
 event_name text,
 event_amount_ore integer,
 event_timestamp_value timestamptz,
 capture_guaranteed_until_value timestamptz,
 event_payload jsonb,
 snapshot_psp_reference text,
 snapshot_authorized_ore integer,
 snapshot_cancelled_ore integer,
 snapshot_captured_ore integer,
 snapshot_refunded_ore integer
) returns jsonb
language plpgsql security definer set search_path=''
as $webhook$
declare
 target public.orders%rowtype;
 applied jsonb;
begin
 if event_name is null or event_name not in ('CAPTURED','REFUNDED')
    or nullif(event_idempotency_key,'') is null
    or nullif(event_psp_reference,'') is null
    or nullif(event_payment_reference,'') is null
    or event_amount_ore is null or event_amount_ore<=0
    or snapshot_authorized_ore is null or snapshot_authorized_ore<=0
    or snapshot_cancelled_ore is null or snapshot_cancelled_ore<0
    or snapshot_captured_ore is null or snapshot_captured_ore<=0
    or snapshot_refunded_ore is null or snapshot_refunded_ore<0
    or snapshot_refunded_ore>snapshot_captured_ore
    or snapshot_captured_ore::bigint+snapshot_cancelled_ore>snapshot_authorized_ore
    or (event_name='CAPTURED' and snapshot_captured_ore<event_amount_ore)
    or (event_name='REFUNDED' and snapshot_refunded_ore<event_amount_ore)
 then raise exception 'VIPPS_INVALID_ECONOMIC_WEBHOOK_SNAPSHOT'; end if;

 insert into private.vipps_payment_events(
  psp_reference,payment_reference,event_name,amount_ore,payload,
  unit,idempotency_key,event_timestamp
 ) values (
  event_psp_reference,event_payment_reference,event_name,event_amount_ore,
  coalesce(event_payload,'{}'::jsonb),'service',event_idempotency_key,event_timestamp_value
 )
 on conflict (unit,idempotency_key) where unit is not null and idempotency_key is not null
 do nothing;
 if not found then return jsonb_build_object('ok',true,'duplicate',true); end if;

 select * into target
 from public.orders
 where order_type='order' and payment_provider='vipps'
   and payment_reference=event_payment_reference
 order by (order_number=event_payment_reference) desc, id
 limit 1 for update;
 if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

 -- Overlapping deliveries can fetch snapshots before either is saved.
 -- Preserve a newer cumulative capture or refund already saved on the order.
 if snapshot_captured_ore>=target.payment_captured_ore
    and snapshot_refunded_ore>=target.payment_refunded_ore then
  applied:=public.sync_vipps_payment_snapshot(
   'service',event_payment_reference,'AUTHORIZED',snapshot_psp_reference,
   snapshot_authorized_ore,snapshot_cancelled_ore,snapshot_captured_ore,
   snapshot_refunded_ore,capture_guaranteed_until_value
  );
  if (applied->>'id')::uuid is distinct from target.id
  then raise exception 'VIPPS_ECONOMIC_WEBHOOK_TARGET_MISMATCH'; end if;
 else
  applied:=jsonb_build_object('id',target.id,'status',target.payment_status);
 end if;

 update private.vipps_payment_events set processed_at=now(),process_error=null
 where unit='service' and idempotency_key=event_idempotency_key;
 return jsonb_build_object('ok',true,'duplicate',false,'applied',applied);
end;
$webhook$;

revoke all on function public.process_service_vipps_economic_webhook(
 text,text,text,text,integer,timestamptz,timestamptz,jsonb,text,integer,integer,integer,integer
) from public,anon,authenticated;
grant execute on function public.process_service_vipps_economic_webhook(
 text,text,text,text,integer,timestamptz,timestamptz,jsonb,text,integer,integer,integer,integer
) to service_role;
