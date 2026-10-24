-- Allow service-role owner endpoints to discard encrypted OAuth credentials.
-- This does not revoke Systima's authorization; that must be done at provider.
grant delete on public.systima_oauth_connections to service_role;
