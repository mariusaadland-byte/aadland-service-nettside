-- Administrative cleanup is reversible for customer/business and payment records.
-- Never delete or overwrite payment, refund, invoice, or booking history.
alter table public.orders add column if not exists archive_reason text;
alter table public.rental_bookings add column if not exists archived_at timestamptz;
alter table public.rental_bookings add column if not exists archive_reason text;
create index if not exists rental_bookings_active_archive_idx
 on public.rental_bookings (archived_at,created_at desc);
