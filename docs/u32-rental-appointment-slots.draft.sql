-- U-32 draft only. Do not apply to production until isolated staging is verified.
create table public.rental_appointment_slots (
 id uuid primary key,
 slot_date date not null,
 slot_time time without time zone not null check (extract(minute from slot_time) in (0,30) and extract(second from slot_time)=0 and slot_time<time '24:00'),
 kind text not null check (kind in ('pickup','return','either')),
 booking_id uuid references public.rental_bookings(id) on delete restrict,
 assigned_kind text check (assigned_kind in ('pickup','return')),
 created_at timestamptz not null default now(),
 unique (slot_date,slot_time),
 unique (booking_id,assigned_kind),
 check ((booking_id is null)=(assigned_kind is null)),
 check (assigned_kind is null or kind='either' or kind=assigned_kind)
);
alter table public.rental_appointment_slots enable row level security;
revoke all on public.rental_appointment_slots from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.rental_appointment_slots to service_role;

create function public.assign_rental_appointment(p_slot uuid,p_booking uuid,p_kind text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare sl public.rental_appointment_slots%rowtype; bk public.rental_bookings%rowtype;
begin
 if p_kind not in ('pickup','return') then raise exception 'APPOINTMENT_INVALID'; end if;
 select * into bk from public.rental_bookings where id=p_booking for update;
 if not found or bk.archived_at is not null or (bk.customer->>'fulfillment') is distinct from 'pickup'
 or (p_kind='pickup' and bk.status not in ('new','confirmed'))
 or (p_kind='return' and bk.status not in ('new','confirmed','active')) then raise exception 'APPOINTMENT_BOOKING'; end if;
 select * into sl from public.rental_appointment_slots where id=p_slot for update;
 if not found or sl.slot_date<>(case when p_kind='pickup' then bk.start_date else bk.end_date end)
 or (sl.kind<>'either' and sl.kind<>p_kind)
 or (sl.slot_date+sl.slot_time) <= (now() at time zone 'Europe/Oslo')
 or (sl.booking_id is not null and (sl.booking_id<>p_booking or sl.assigned_kind<>p_kind)) then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
 update public.rental_appointment_slots set booking_id=p_booking,assigned_kind=p_kind where id=p_slot;
 return p_slot;
end; $$;
revoke all on function public.assign_rental_appointment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.assign_rental_appointment(uuid,uuid,text) to service_role;
-- For customer self-service, cancellation/rebooking and cross-appointment consistency,
-- extend the booking transaction; do not expose this RPC directly to customers.
