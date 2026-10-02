create schema if not exists private;

create table if not exists private.vipps_webhook_registrations(
  webhook_id text primary key,
  environment text not null check (environment in ('test','production')),
  secret text not null,
  callback_url text not null,
  events jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.upsert_vipps_webhook_registration(
  target_webhook_id text,
  target_environment text,
  target_secret text,
  target_callback_url text,
  target_events jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if coalesce(target_webhook_id,'')='' or coalesce(target_secret,'')='' or coalesce(target_callback_url,'')='' then
    raise exception 'INVALID_VIPPS_WEBHOOK_REGISTRATION';
  end if;
  if target_environment not in ('test','production') then
    raise exception 'INVALID_VIPPS_ENVIRONMENT';
  end if;

  insert into private.vipps_webhook_registrations(
    webhook_id,environment,secret,callback_url,events,active,updated_at
  ) values (
    target_webhook_id,target_environment,target_secret,target_callback_url,
    coalesce(target_events,'[]'::jsonb),true,now()
  )
  on conflict (webhook_id) do update
  set environment=excluded.environment,
      secret=excluded.secret,
      callback_url=excluded.callback_url,
      events=excluded.events,
      active=true,
      updated_at=now();
end;
$function$;

create or replace function public.deactivate_vipps_webhook_registration(
  target_webhook_id text,
  target_environment text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare affected integer;
begin
  update private.vipps_webhook_registrations
  set active=false,updated_at=now()
  where webhook_id=target_webhook_id
    and environment=target_environment
    and active=true;
  get diagnostics affected=row_count;
  return affected>0;
end;
$function$;

create or replace function public.get_vipps_webhook_secret(
  target_webhook_id text,
  target_environment text
)
returns text
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select secret
  from private.vipps_webhook_registrations
  where webhook_id=target_webhook_id
    and environment=target_environment
    and active=true
  limit 1
$function$;

revoke all on function public.upsert_vipps_webhook_registration(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_vipps_webhook_registration(text,text,text,text,jsonb) to service_role;
revoke all on function public.deactivate_vipps_webhook_registration(text,text) from public,anon,authenticated;
grant execute on function public.deactivate_vipps_webhook_registration(text,text) to service_role;
revoke all on function public.get_vipps_webhook_secret(text,text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_secret(text,text) to service_role;
