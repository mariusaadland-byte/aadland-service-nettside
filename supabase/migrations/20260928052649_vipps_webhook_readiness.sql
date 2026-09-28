create or replace function public.has_active_vipps_webhook_registration(
  target_environment text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, private
as $vipps_webhook_ready$
  select exists(
    select 1
    from private.vipps_webhook_registrations
    where environment=target_environment
      and active=true
  )
$vipps_webhook_ready$;

revoke all on function public.has_active_vipps_webhook_registration(text) from public,anon,authenticated;
grant execute on function public.has_active_vipps_webhook_registration(text) to service_role;
