-- U-25 draft; apply only after U-24 individual registry and isolated staging verification.
create table public.rental_unit_maintenance_events(
 id uuid primary key,
 unit_id uuid not null references public.rental_equipment_units(id) on delete restrict,
 kind text not null check (kind in ('inspection','service','repair','fault')),
 condition text not null check (condition in ('ok','follow_up','out_of_service')),
 performed_on date not null,
 next_due_on date,
 note text not null check (length(btrim(note)) between 10 and 2000),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 check(next_due_on is null or next_due_on>=performed_on)
);
create index rental_unit_maintenance_events_unit_date_idx on public.rental_unit_maintenance_events(unit_id,performed_on desc,created_at desc);
alter table public.rental_unit_maintenance_events enable row level security;
revoke all on public.rental_unit_maintenance_events from public,anon,authenticated,service_role;
grant select,insert on public.rental_unit_maintenance_events to service_role;
-- Append-only via app API; privileged DB owners can still change rows.
-- Out-of-service is a warning, not a capacity adjustment. Do not release equipment
-- before separately blocking its product and checking outstanding bookings.
