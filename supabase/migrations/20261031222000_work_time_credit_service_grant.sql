-- New credit table is private (no anon/authenticated grants or RLS policies).
-- Only the existing server-side Supabase service role may access it, after
-- the work-time API's own authenticated permission checks.
grant select,insert,update,delete on public.work_time_value_credits to service_role;
