-- Én automatisk påminnelse dagen før utleieperioden starter.
alter table public.rental_bookings
 add column if not exists reminder_sent_at timestamptz;

create index if not exists rental_bookings_reminder_due_idx
on public.rental_bookings(start_date)
where status='confirmed'
  and confirmation_sent_at is not null
  and reminder_sent_at is null;
