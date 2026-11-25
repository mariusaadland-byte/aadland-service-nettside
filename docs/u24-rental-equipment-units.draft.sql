-- U-24 draft only. Verify in isolated staging before applying.
create table public.rental_equipment_units(
 id uuid primary key default gen_random_uuid(),
 rental_item_id uuid not null references public.rental_items(id) on delete restrict,
 serial_number text check (serial_number is null or length(serial_number)<=100),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 unique(rental_item_id,serial_number)
);
alter table public.rental_equipment_units enable row level security;
revoke all on public.rental_equipment_units from public,anon,authenticated;
grant select,insert on public.rental_equipment_units to service_role;
-- Registry is identification only. Do not interpret unit count as available quantity.
-- Before assigning to bookings, add atomic assignment/return rules and reconcile
-- physical units with rental_items.quantity; avoid double assignment.
