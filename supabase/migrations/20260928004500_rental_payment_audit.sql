-- Utleiebetaling og depositum-sporing.
-- Leiebetaling og depositum lagres separat slik at depositum ikke regnes som omsetning.
alter table public.rental_bookings add column if not exists payment_reference text;
alter table public.rental_bookings add column if not exists payment_captured_ore integer not null default 0;
alter table public.rental_bookings add column if not exists receipt_sent_at timestamptz;
alter table public.rental_bookings add column if not exists deposit_reference text;
alter table public.rental_bookings add column if not exists deposit_held_ore integer not null default 0;
alter table public.rental_bookings add column if not exists deposit_received_at timestamptz;
alter table public.rental_bookings add column if not exists deposit_released_at timestamptz;
alter table public.rental_bookings add column if not exists deposit_charged_ore integer not null default 0;

create index if not exists rental_bookings_payment_status_idx
on public.rental_bookings(payment_status);

create index if not exists rental_bookings_deposit_status_idx
on public.rental_bookings(deposit_status);
