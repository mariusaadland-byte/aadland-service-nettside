create or replace function public.create_rental_booking_if_available(booking_record jsonb,buffered_start date,buffered_end date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 item_id uuid; item_quantity integer; item_status text; buffer_days integer;
 first_day date; last_day date; booked_count integer; new_id uuid;
begin
 item_id=(booking_record->>'rental_item_id')::uuid;
 first_day=(booking_record->>'start_date')::date;
 last_day=(booking_record->>'end_date')::date;
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>=365 then
  raise exception 'RENTAL_INVALID_DATES';
 end if;
 perform pg_advisory_xact_lock(hashtext(item_id::text));
 select quantity,status,greatest(0,coalesce(rental_items.buffer_days,0))
 into item_quantity,item_status,buffer_days
 from public.rental_items where id=item_id and active=true for update;
 if not found or item_status<>'available' then raise exception 'RENTAL_UNAVAILABLE'; end if;
 -- Recompute the buffer from the locked item rather than trusting callers.
 buffered_start=first_day-buffer_days; buffered_end=last_day+buffer_days;
 if exists(select 1 from public.rental_blocks where rental_item_id=item_id
  and start_date<=buffered_end and end_date>=buffered_start) then raise exception 'RENTAL_UNAVAILABLE'; end if;
 select coalesce(max(day_count),0) into booked_count from (
  select count(b.id) as day_count
  from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') as days(day)
  left join public.rental_bookings b on b.rental_item_id=item_id
   and b.status in ('new','confirmed','active')
   and b.start_date<=days.day::date+buffer_days and b.end_date>=days.day::date-buffer_days
  group by days.day
 ) counts;
 if booked_count>=greatest(1,item_quantity) then raise exception 'RENTAL_UNAVAILABLE'; end if;
 insert into public.rental_bookings(
  customer_user_id,booking_number,rental_item_id,customer,start_date,end_date,status,
  price_snapshot,total_ore,deposit_ore,terms_version
 ) values (
  nullif(booking_record->>'customer_user_id','')::uuid,
  booking_record->>'booking_number',item_id,booking_record->'customer',
  first_day,last_day,'confirmed',booking_record->'price_snapshot',
  (booking_record->>'total_ore')::integer,(booking_record->>'deposit_ore')::integer,
  booking_record->>'terms_version'
 ) returning id into new_id;
 return new_id;
end; $$;
revoke all on function public.create_rental_booking_if_available(jsonb,date,date) from public,anon,authenticated;
grant execute on function public.create_rental_booking_if_available(jsonb,date,date) to service_role;
