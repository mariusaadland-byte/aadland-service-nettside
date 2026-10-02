drop table if exists public.vipps_webhook_events;

alter table private.vipps_payment_events
  add column if not exists unit text,
  add column if not exists idempotency_key text,
  add column if not exists event_timestamp timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists process_error text;

create unique index if not exists vipps_payment_events_unit_idempotency_idx
  on private.vipps_payment_events(unit,idempotency_key)
  where unit is not null and idempotency_key is not null;

alter table private.vipps_webhook_registrations
  add column if not exists unit text,
  add column if not exists msn text;

create index if not exists vipps_webhook_registrations_unit_env_idx
  on private.vipps_webhook_registrations(unit,environment)
  where active=true;

create or replace function public.get_vipps_webhook_auth(target_webhook_id text,target_environment text)
returns jsonb language sql security definer set search_path = pg_catalog, private
as $function$
  select jsonb_build_object('secret',secret,'callback_url',callback_url,'unit',unit,'msn',msn)
  from private.vipps_webhook_registrations
  where webhook_id=target_webhook_id and environment=target_environment and active=true
  limit 1
$function$;

create or replace function public.upsert_vipps_webhook_registration_v2(
  target_webhook_id text,target_environment text,target_secret text,target_callback_url text,
  target_events jsonb,target_unit text,target_msn text
)
returns void language plpgsql security definer set search_path = pg_catalog, private
as $function$
begin
  if coalesce(target_webhook_id,'')='' or coalesce(target_secret,'')='' or coalesce(target_callback_url,'')='' then raise exception 'INVALID_VIPPS_WEBHOOK_REGISTRATION'; end if;
  if target_environment not in ('test','production') then raise exception 'INVALID_VIPPS_ENVIRONMENT'; end if;
  if target_unit not in ('service','rental') then raise exception 'INVALID_VIPPS_UNIT'; end if;
  if coalesce(target_msn,'')='' then raise exception 'INVALID_VIPPS_MSN'; end if;
  insert into private.vipps_webhook_registrations(webhook_id,environment,secret,callback_url,events,active,unit,msn,updated_at)
  values(target_webhook_id,target_environment,target_secret,target_callback_url,coalesce(target_events,'[]'::jsonb),true,target_unit,target_msn,now())
  on conflict (webhook_id) do update
  set environment=excluded.environment,secret=excluded.secret,callback_url=excluded.callback_url,
      events=excluded.events,active=true,unit=excluded.unit,msn=excluded.msn,updated_at=now();
end;
$function$;

create or replace function public.record_vipps_payment_event_once_v2(
  event_unit text,event_idempotency_key text,event_psp_reference text,event_payment_reference text,
  event_name text,event_amount_ore integer,event_timestamp_value timestamptz,event_payload jsonb
)
returns boolean language plpgsql security definer set search_path = pg_catalog, private
as $function$
begin
  if event_unit not in ('service','rental') then raise exception 'INVALID_VIPPS_UNIT'; end if;
  if coalesce(event_idempotency_key,'')='' then raise exception 'INVALID_VIPPS_IDEMPOTENCY_KEY'; end if;
  if coalesce(event_psp_reference,'')='' or coalesce(event_payment_reference,'')='' or coalesce(event_name,'')='' then raise exception 'INVALID_VIPPS_EVENT'; end if;
  insert into private.vipps_payment_events(psp_reference,payment_reference,event_name,amount_ore,payload,unit,idempotency_key,event_timestamp)
  values(event_psp_reference,event_payment_reference,event_name,greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb),event_unit,event_idempotency_key,event_timestamp_value)
  on conflict (unit,idempotency_key) where unit is not null and idempotency_key is not null do nothing;
  return found;
end;
$function$;

create or replace function public.mark_vipps_payment_event_processed(event_unit text,event_idempotency_key text,event_error text default null)
returns boolean language plpgsql security definer set search_path = pg_catalog, private
as $function$
declare affected integer;
begin
  update private.vipps_payment_events
  set processed_at=case when event_error is null then now() else processed_at end,
      process_error=nullif(left(coalesce(event_error,''),1000),'')
  where unit=event_unit and idempotency_key=event_idempotency_key;
  get diagnostics affected=row_count;
  return affected>0;
end;
$function$;

create or replace function public.get_vipps_webhook_status(target_environment text)
returns jsonb language sql security definer set search_path = pg_catalog, private
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit',unit,'msn',msn,'webhookId',webhook_id,'callbackUrl',callback_url,
    'events',events,'active',active,'updatedAt',updated_at
  ) order by unit,updated_at desc),'[]'::jsonb)
  from private.vipps_webhook_registrations
  where environment=target_environment and active=true
$function$;

revoke all on function public.upsert_vipps_webhook_registration_v2(text,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.upsert_vipps_webhook_registration_v2(text,text,text,text,jsonb,text,text) to service_role;
revoke all on function public.record_vipps_payment_event_once_v2(text,text,text,text,text,integer,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_vipps_payment_event_once_v2(text,text,text,text,text,integer,timestamptz,jsonb) to service_role;
revoke all on function public.mark_vipps_payment_event_processed(text,text,text) from public,anon,authenticated;
grant execute on function public.mark_vipps_payment_event_processed(text,text,text) to service_role;
revoke all on function public.get_vipps_webhook_status(text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_status(text) to service_role;
revoke all on function public.get_vipps_webhook_auth(text,text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_auth(text,text) to service_role;
