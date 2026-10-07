create or replace function public.process_vipps_payment_event_once(
  event_unit text,event_idempotency_key text,event_psp_reference text,event_payment_reference text,
  event_name text,event_amount_ore integer,event_timestamp_value timestamptz,
  capture_guaranteed_until_value timestamptz,event_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare inserted boolean := false; apply_result jsonb;
begin
  if event_unit not in ('service','rental') then raise exception 'INVALID_VIPPS_UNIT'; end if;
  if coalesce(event_idempotency_key,'')='' then raise exception 'INVALID_VIPPS_IDEMPOTENCY_KEY'; end if;
  if coalesce(event_psp_reference,'')='' or coalesce(event_payment_reference,'')='' or coalesce(event_name,'')='' then raise exception 'INVALID_VIPPS_EVENT'; end if;

  insert into private.vipps_payment_events(psp_reference,payment_reference,event_name,amount_ore,payload,unit,idempotency_key,event_timestamp)
  values(event_psp_reference,event_payment_reference,upper(event_name),greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb),event_unit,event_idempotency_key,event_timestamp_value)
  on conflict (unit,idempotency_key) where unit is not null and idempotency_key is not null do nothing;

  inserted:=found;
  if not inserted then return jsonb_build_object('ok',true,'duplicate',true); end if;

  apply_result:=public.apply_vipps_payment_event(
    event_unit,event_payment_reference,upper(event_name),greatest(coalesce(event_amount_ore,0),0),
    event_psp_reference,event_timestamp_value,capture_guaranteed_until_value
  );

  update private.vipps_payment_events set processed_at=now(),process_error=null
  where unit=event_unit and idempotency_key=event_idempotency_key;

  return jsonb_build_object('ok',true,'duplicate',false,'applied',apply_result);
end;
$function$;

revoke all on function public.process_vipps_payment_event_once(text,text,text,text,text,integer,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.process_vipps_payment_event_once(text,text,text,text,text,integer,timestamptz,timestamptz,jsonb) to service_role;
