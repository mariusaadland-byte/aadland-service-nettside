-- DRAFT ONLY. Do not apply to production before isolation/access review.
alter table public.rental_bookings
 add column if not exists handover_signatures jsonb not null default '{}'::jsonb;
-- Existing rental_bookings RLS and table grants must be verified before activation.
-- No raw signature evidence in public/customer API responses. Owner/authorized order
-- administration receives summary only. Review all select('*') serializers and exports.
-- The booking update stores signature snapshot, accessory report and status together.
