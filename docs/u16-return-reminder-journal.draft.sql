-- Staged U-16 database setup: not applied to production.
create table if not exists public.rental_return_reminder_events(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.rental_bookings(id) on delete restrict,
 return_date date not null,
 state text not null check(state in ('claimed','accepted','skipped','needs_review')),
 provider_id text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(booking_id,return_date)
);
alter table public.rental_return_reminder_events enable row level security;
revoke all on public.rental_return_reminder_events from public,anon,authenticated;
grant select,insert,update on public.rental_return_reminder_events to service_role;
revoke delete,truncate on public.rental_return_reminder_events from service_role;
