-- Allow only trusted server requests to read/write one-time Vipps to Tripletex claims.
-- Revoke public roles in the original table definitions and keep RLS enabled.
grant select, insert, update on table public.tripletex_vipps_settlement_transfers to service_role;
grant select, insert, update on table public.tripletex_vipps_fee_transfers to service_role;
grant select, insert, delete on table public.tripletex_vipps_accounting_lock to service_role;
