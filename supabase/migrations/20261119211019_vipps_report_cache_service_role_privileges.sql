-- Restore server-only access to the Vipps daily report cache.
-- The cache remains inaccessible to anon and authenticated users;
-- server-side service_role requires SQL privileges even while bypassing RLS.
grant select, insert, update on table public.vipps_report_daily_cache to service_role;
