create or replace function public.create_rental_booking_if_available(
  booking_record jsonb,
  buffered_start date,
  buffered_end date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item_id uuid;
  item_quantity integer;
  item_status text;
  booked_count integer;
  is_manually_blocked boolean;
  new_id uuid;
begin
  item_id := (booking_record->>'rental_item_id')::uuid;
  perform pg_advisory_xact_lock(hashtext(item_id::text));

  select quantity,status into item_quantity,item_status
  from public.rental_items
  where id=item_id and active=true
  for update;

  if not found or item_status <> 'available' then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  select exists(
    select 1
    from public.rental_blocks
    where rental_item_id=item_id
      and start_date <= buffered_end
      and end_date >= buffered_start
  ) into is_manually_blocked;

  if is_manually_blocked then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  select count(*)
  into booked_count
  from public.rental_bookings
  where rental_item_id=item_id
    and status in ('new','confirmed','active')
    and start_date <= buffered_end
    and end_date >= buffered_start;

  if booked_count >= greatest(1,item_quantity) then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  insert into public.rental_bookings(
    customer_user_id,booking_number,rental_item_id,customer,start_date,end_date,status,
    price_snapshot,total_ore,deposit_ore,terms_version
  ) values (
    nullif(booking_record->>'customer_user_id','')::uuid,
    booking_record->>'booking_number',item_id,booking_record->'customer',
    (booking_record->>'start_date')::date,(booking_record->>'end_date')::date,
    'new',booking_record->'price_snapshot',(booking_record->>'total_ore')::integer,
    (booking_record->>'deposit_ore')::integer,booking_record->>'terms_version'
  )
  returning id into new_id;

  return new_id;
end;
$$;
revoke all on function public.create_rental_booking_if_available(jsonb,date,date) from public, anon, authenticated;
grant execute on function public.create_rental_booking_if_available(jsonb,date,date) to service_role;
