-- Append-only physical inspections. No payment capture/release operation here.
create table if not exists public.rental_deposit_inspection_events(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.rental_bookings(id) on delete restrict,
 request_id uuid not null unique,
 result text not null check (result in ('ok','damage')),
 damage_estimate_ore integer not null default 0 check(damage_estimate_ore>=0),
 note text not null default '' check(length(note)<=2000),
 reviewed_by uuid not null references public.admin_users(id) on delete restrict,
 created_at timestamptz not null default now(),
 constraint rental_deposit_review_damage_note check(result<>'damage' or length(trim(note))>=10),
 constraint rental_deposit_review_ok_zero check(result<>'ok' or damage_estimate_ore=0)
);
create index if not exists rental_deposit_reviews_booking_date_idx
 on public.rental_deposit_inspection_events(booking_id,created_at desc);
alter table public.rental_deposit_inspection_events enable row level security;
revoke all on table public.rental_deposit_inspection_events from public,anon,authenticated;
grant select,insert on table public.rental_deposit_inspection_events to service_role;
revoke update,delete,truncate on table public.rental_deposit_inspection_events from service_role;
