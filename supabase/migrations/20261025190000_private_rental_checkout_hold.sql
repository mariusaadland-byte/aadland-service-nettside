-- Only checkouts created after rental Vipps is ready receive a deadline.
-- Legacy and already-confirmed bookings keep their current status.
alter table public.rental_bookings add column if not exists payment_due_at timestamptz;
create index if not exists rental_checkout_pending_due_idx on public.rental_bookings(payment_due_at)
 where status='new' and payment_status='unpaid' and payment_reference is null;

create or replace function public.rental_checkout_payment_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if old.status='new' and new.status='new' then
  if (new.payment_status='authorized' and coalesce(new.payment_reserved_ore,0)>=greatest(coalesce(new.total_ore,0),1))
   or (new.payment_status='paid' and coalesce(new.payment_captured_ore,0)>=greatest(coalesce(new.total_ore,0),1)) then
   new.status:='confirmed';
   new.payment_due_at:=null;
  elsif new.payment_status='cancelled' and coalesce(new.payment_captured_ore,0)=0 and coalesce(new.payment_reserved_ore,0)=0 then
   new.status:='cancelled';
   new.payment_due_at:=null;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.rental_checkout_payment_transition() from public,anon,authenticated;
drop trigger if exists rental_checkout_payment_transition on public.rental_bookings;
create trigger rental_checkout_payment_transition before update on public.rental_bookings
 for each row execute function public.rental_checkout_payment_transition();

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
 where rental_item_id=item_id and status='new' and payment_due_at<=now()
  and payment_status='unpaid' and payment_reference is null;
 select coalesce(max(day_count),0) into booked_count from (
  select count(b.id) as day_count
  from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') as days(day)
  left join public.rental_bookings b on b.rental_item_id=item_id
   and b.status in ('new','confirmed','active')
   and (b.status<>'new' or b.payment_due_at is null or b.payment_due_at>now()
        or b.payment_status<>'unpaid' or b.payment_reference is not null)
   and b.start_date<=days.day::date+buffer_days and b.end_date>=days.day::date-buffer_days
  group by days.day
 ) counts;
 if booked_count>=greatest(1,item_quantity) then raise exception 'RENTAL_UNAVAILABLE'; end if;
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
grant execute on function public.create_rental_booking_if_available(jsonb,date,date) to service_role;
