-- Sporer kundevarsler for utleiebookinger.
alter table public.rental_bookings
 add column if not exists confirmation_sent_at timestamptz,
 add column if not exists cancellation_sent_at timestamptz;

create index if not exists rental_bookings_notification_idx
on public.rental_bookings(status, start_date)
where status in ('new','confirmed','cancelled');
