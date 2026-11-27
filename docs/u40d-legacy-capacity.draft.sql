-- Draft candidate based on repository legacy RPC. Compare deployed definition before any rollout. No grants.
begin;
create or replace function public.create_rental_booking_if_available(
 booking_record jsonb, buffered_start date, buffered_end date
) returns uuid language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare
 item_id uuid; item_quantity integer; item_status text; buffer_days integer;
 first_day date; last_day date; booked_count integer; new_id uuid; pending_payment boolean;
begin
 item_id=(booking_record->>'rental_item_id')::uuid;
 first_day=(booking_record->>'start_date')::date;
 last_day=(booking_record->>'end_date')::date;
 pending_payment=coalesce((booking_record->>'pending_payment')::boolean,false);
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>=365 then
  raise exception 'RENTAL_INVALID_DATES';
 end if;
 perform pg_advisory_xact_lock(hashtext(item_id::text));
 select quantity,status,greatest(0,coalesce(rental_items.buffer_days,0))
 into item_quantity,item_status,buffer_days
 from public.rental_items where id=item_id and active=true for update;
 if not found or item_status<>'available' then raise exception 'RENTAL_UNAVAILABLE'; end if;
 buffered_start=first_day-buffer_days; buffered_end=last_day+buffer_days;
 if exists(select 1 from public.rental_blocks where rental_item_id=item_id
  and start_date<=buffered_end and end_date>=buffered_start) then raise exception 'RENTAL_UNAVAILABLE'; end if;
 -- Under the same per-item lock, only expire never-started and never-paid checkouts.
 -- Any Vipps reference or payment progress prevents automatic release.
 update public.rental_bookings set status='cancelled',updated_at=now()
 where rental_item_id=item_id and group_id is null and status='new' and payment_due_at<=now()
  and payment_status='unpaid' and payment_reference is null;
 select min(free_units) into booked_count from public.draft_rental_availability_days(item_id,first_day,last_day);
 if booked_count is null or booked_count<1 then raise exception 'RENTAL_UNAVAILABLE'; end if;
 insert into public.rental_bookings(
  customer_user_id,booking_number,rental_item_id,customer,start_date,end_date,status,
  price_snapshot,total_ore,deposit_ore,terms_version,payment_due_at
 ) values (
  nullif(booking_record->>'customer_user_id','')::uuid,
  booking_record->>'booking_number',item_id,booking_record->'customer',
  first_day,last_day,case when pending_payment then 'new' else 'confirmed' end,
  booking_record->'price_snapshot',
  (booking_record->>'total_ore')::integer,(booking_record->>'deposit_ore')::integer,
  booking_record->>'terms_version',
  case when pending_payment then now()+interval '30 minutes' else null end
 ) returning id into new_id;
 return new_id;
end;
$$;
revoke execute on function public.create_rental_booking_if_available(jsonb,date,date) from public,anon,authenticated;
revoke execute on function public.create_rental_booking_if_available(jsonb,date,date) from service_role;

rollback;
