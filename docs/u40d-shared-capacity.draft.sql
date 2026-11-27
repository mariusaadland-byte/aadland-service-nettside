-- Draft only; shared capacity read for group and legacy bookings.
begin;
create function public.draft_rental_availability_days(p_item uuid,p_start date,p_end date)
returns table(day date,free_units integer)
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.rental_items%rowtype; today date:=(clock_timestamp() at time zone 'Europe/Oslo')::date; buf integer; unsafe_count integer; registered integer;
begin
 if p_item is null or p_start is null or p_end is null or p_end<p_start or p_end-p_start>=365 then return;end if;
 -- Shared lock with reservations, unit registration, maintenance and return.
 perform pg_advisory_xact_lock(hashtext(p_item::text));
 select * into i from public.rental_items where id=p_item;
 if not found then return;end if;
 buf:=greatest(0,coalesce(i.buffer_days,0));
 select count(*) into registered from public.rental_equipment_units u where u.rental_item_id=i.id;
 -- Unassigned unsafe units reduce capacity. Assigned unsafe units are counted
 -- once as blocked bookings below, not also as a reduction in stock.
 select count(*) into unsafe_count from public.rental_equipment_units u
 where u.rental_item_id=i.id and not exists(select 1 from public.rental_group_unit_assignments a where a.unit_id=u.id and a.released_at is null)
 and not exists(select 1 from (select m.condition,m.performed_on,m.next_due_on from public.rental_unit_maintenance_events m where m.unit_id=u.id order by m.performed_on desc,m.created_at desc,m.id desc limit 1) m where m.condition='ok' and m.performed_on<=today and (m.next_due_on is null or m.next_due_on>=today));
 -- Registry count higher than stock is inconsistent: fail closed.
 return query select d.d::date,
 case when not i.active or i.status<>'available' or registered>i.quantity or exists(select 1 from public.rental_blocks k where k.rental_item_id=i.id and k.start_date<=d.d::date+buf and k.end_date>=d.d::date-buf) then 0
 else greatest(0,i.quantity-unsafe_count-(select count(*)::integer from public.rental_bookings b
 where b.rental_item_id=i.id and (
  (b.status in ('new','confirmed','active') and (b.group_id is not null or b.status<>'new' or b.payment_due_at is null or b.payment_due_at>clock_timestamp() or b.payment_status is distinct from 'unpaid' or b.payment_reference is not null)
   and b.start_date<=d.d::date+buf and (b.end_date>=d.d::date-buf or (b.status='active' and b.end_date<today)))
  or exists(select 1 from public.rental_group_unit_assignments a where a.booking_id=b.id and a.released_at is null and (b.status not in ('new','confirmed','active') or b.end_date<today or exists(select 1 from public.rental_group_returns rr where rr.booking_id=b.id) or not exists(select 1 from (select m.condition,m.performed_on,m.next_due_on from public.rental_unit_maintenance_events m where m.unit_id=a.unit_id order by m.performed_on desc,m.created_at desc,m.id desc limit 1) mm where mm.condition='ok' and mm.performed_on<=today and (mm.next_due_on is null or mm.next_due_on>=today))))
  ))) end
 from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d(d) order by d.d;
end $$;
revoke all on function public.draft_rental_availability_days(uuid,date,date) from public,anon,authenticated,service_role;
rollback;
