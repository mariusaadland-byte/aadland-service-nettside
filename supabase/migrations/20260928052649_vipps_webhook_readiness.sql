create or replace function public.has_active_vipps_webhook_registration(
  target_environment text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select exists(
    select 1
    from private.vipps_webhook_registrations
    where environment=target_environment
      and active=true
  )
$function$;

revoke all on function public.has_active_vipps_webhook_registration(text) from public,anon,authenticated;
grant execute on function public.has_active_vipps_webhook_registration(text) to service_role;
