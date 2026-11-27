-- Draft only; no live installation. Conservative administrative capacity protection.
begin;
create function public.draft_admin_block_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.rental_items%rowtype; today date:=(clock_timestamp() at time zone 'Europe/Oslo')::date; buf integer;
begin
 if tg_op='DELETE' then
  if not pg_try_advisory_xact_lock(hashtext(old.rental_item_id::text)) then raise exception 'RENTAL_CAPACITY_BUSY';end if;
  return old;
 end if;
 if tg_op='UPDATE' then
  if new.rental_item_id is distinct from old.rental_item_id then raise exception 'RENTAL_UNAVAILABLE';end if;
  if new.start_date=old.start_date and new.end_date=old.end_date then return new;end if;
 end if;
 if not pg_try_advisory_xact_lock(hashtext(new.rental_item_id::text)) then raise exception 'RENTAL_CAPACITY_BUSY';end if;
 select * into i from public.rental_items where id=new.rental_item_id;
 if not found or new.start_date is null or new.end_date is null or new.end_date<new.start_date then raise exception 'RENTAL_UNAVAILABLE';end if;
 buf:=greatest(0,coalesce(i.buffer_days,0));
 if exists(select 1 from public.rental_bookings b where b.rental_item_id=i.id and (
  (b.status in ('new','confirmed','active') and (b.group_id is not null or b.status<>'new' or b.payment_due_at is null or b.payment_due_at>clock_timestamp() or b.payment_status is distinct from 'unpaid' or b.payment_reference is not null)
  and b.start_date<=new.end_date+buf and (b.end_date>=new.start_date-buf or b.status='active' and b.end_date<today))
  or exists(select 1 from public.rental_group_unit_assignments a where a.booking_id=b.id and a.released_at is null and (b.end_date<today or b.status not in ('new','confirmed','active') or exists(select 1 from public.rental_group_returns r where r.booking_id=b.id)))
 )) then raise exception 'RENTAL_UNAVAILABLE';end if;
 return new;
end $$;
revoke all on function public.draft_admin_block_guard() from public,anon,authenticated,service_role;
create trigger draft_admin_block_guard before insert or update or delete on public.rental_blocks for each row execute function public.draft_admin_block_guard();
create function public.draft_admin_item_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and new.quantity=old.quantity and new.buffer_days=old.buffer_days and new.status=old.status and new.active=old.active then return new;end if;
 -- UPDATE/DELETE may already hold row lock: never wait in opposite lock order.
 if not pg_try_advisory_xact_lock(hashtext(old.id::text)) then raise exception 'RENTAL_CAPACITY_BUSY';end if;
 if tg_op='DELETE' then
  if exists(select 1 from public.rental_bookings where rental_item_id=old.id) or exists(select 1 from public.rental_blocks where rental_item_id=old.id) or exists(select 1 from public.rental_equipment_units where rental_item_id=old.id) or exists(select 1 from public.rental_consumables where rental_item_id=old.id) then raise exception 'RENTAL_UNAVAILABLE';end if;
  return old;
 end if;
 if new.quantity<(select count(*) from public.rental_equipment_units where rental_item_id=old.id) then raise exception 'RENTAL_UNAVAILABLE';end if;
 -- Deliberately conservative: no reduction or buffer extension with open
 -- commitments. Closing the item to new business is always permitted.
 if (new.quantity<old.quantity or new.buffer_days>old.buffer_days) and (
  exists(select 1 from public.rental_bookings b where b.rental_item_id=old.id and b.status in ('new','confirmed','active'))
  or exists(select 1 from public.rental_group_unit_assignments a join public.rental_bookings b on b.id=a.booking_id where b.rental_item_id=old.id and a.released_at is null)
 ) then raise exception 'RENTAL_UNAVAILABLE';end if;
 return new;
end $$;
revoke all on function public.draft_admin_item_guard() from public,anon,authenticated,service_role;
create trigger draft_admin_item_guard before update or delete on public.rental_items for each row execute function public.draft_admin_item_guard();
-- Legacy reactivation / movement can bypass the create RPC. Protect the
-- changed reservation only; ordinary group workflow uses separate guards.
create function public.draft_legacy_booking_change_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare was_counted boolean; will_count boolean; available integer;
begin
 if old.group_id is not null or new.group_id is not null then return new;end if;
 if new.rental_item_id is distinct from old.rental_item_id or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then raise exception 'RENTAL_UNAVAILABLE';end if;
 was_counted:=old.status in ('new','confirmed','active') and (old.status<>'new' or old.payment_due_at is null or old.payment_due_at>clock_timestamp() or old.payment_status is distinct from 'unpaid' or old.payment_reference is not null);
 will_count:=new.status in ('new','confirmed','active') and (new.status<>'new' or new.payment_due_at is null or new.payment_due_at>clock_timestamp() or new.payment_status is distinct from 'unpaid' or new.payment_reference is not null);
 if not was_counted and will_count then
  if not pg_try_advisory_xact_lock(hashtext(new.rental_item_id::text)) then raise exception 'RENTAL_CAPACITY_BUSY';end if;
  -- A past-due active reactivation has unknown return time; reject instead.
  if new.end_date<(clock_timestamp() at time zone 'Europe/Oslo')::date then raise exception 'RENTAL_UNAVAILABLE';end if;
  select min(free_units) into available from public.draft_rental_availability_days(new.rental_item_id,new.start_date,new.end_date);
  if available is null or available<1 then raise exception 'RENTAL_UNAVAILABLE';end if;
 end if;
 return new;
end $$;
revoke all on function public.draft_legacy_booking_change_guard() from public,anon,authenticated,service_role;
create trigger draft_legacy_booking_change_guard before update on public.rental_bookings for each row execute function public.draft_legacy_booking_change_guard();
rollback;
