create or replace function public.get_vipps_webhook_auth(
  target_webhook_id text,
  target_environment text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as $vipps_webhook_auth$
  select jsonb_build_object(
    'secret',secret,
    'callback_url',callback_url
  )
  from private.vipps_webhook_registrations
  where webhook_id=target_webhook_id
    and environment=target_environment
    and active=true
  limit 1
$vipps_webhook_auth$;

revoke all on function public.get_vipps_webhook_auth(text,text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_auth(text,text) to service_role;
