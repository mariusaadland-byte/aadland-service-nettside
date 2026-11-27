-- Disposable synthetic race fixture, after signing concurrency tests.
do $$
declare label text; item uuid; u uuid; unit uuid;
begin
 if current_database()<>'aadland_signing_test' then raise exception 'WRONG_DATABASE';end if;
 foreach label in array array['group-group','group-legacy','legacy-group','maintenance-group','block-group','group-block','group-reduce','closed-group'] loop
  item:=signing_ci.uid('capacity:'||label);
  insert into public.rental_items(id,name,slug,quantity,daily_price_ore,deposit_ore) values(item,'Race drill','race-'||label,case when label='group-reduce' then 2 else 1 end,30000,0);
  foreach u in array array[signing_ci.uid(label||':a'),signing_ci.uid(label||':b')] loop
   insert into auth.users values(u,u::text||'@example.invalid',clock_timestamp());
  end loop;
  if label='maintenance-group' then
   unit:=signing_ci.uid(label||':unit');
   insert into public.rental_equipment_units(id,rental_item_id,created_by) values(unit,item,signing_ci.uid(label||':a'));
   insert into public.rental_unit_maintenance_events(id,unit_id,kind,condition,performed_on,note,created_by) values(gen_random_uuid(),unit,'inspection','ok',(clock_timestamp() at time zone 'Europe/Oslo')::date,'Synthetic safe equipment',signing_ci.uid(label||':a'));
  end if;
 end loop;
end $$;
create function signing_ci.capacity_attempt(label text,side text,kind text)
returns text language plpgsql as $$
declare item uuid:=signing_ci.uid('capacity:'||label); u uuid:=signing_ci.uid(label||':'||side);
 d date:=(clock_timestamp() at time zone 'Europe/Oslo')::date+2;
 snap jsonb; record_data jsonb; result uuid;
begin
 if kind='block' then
  insert into public.rental_blocks(rental_item_id,start_date,end_date) values(item,d,d);
  return 'blocked';
 elsif kind='close' then
  update public.rental_items set status='maintenance' where id=item;
  return 'blocked';
 elsif kind='reduce' then
  update public.rental_items set quantity=1 where id=item;
  return 'reduced';
 end if;
 if kind='fault' then
  insert into public.rental_unit_maintenance_events(id,unit_id,kind,condition,performed_on,note,created_by)
  values(gen_random_uuid(),signing_ci.uid(label||':unit'),'fault','out_of_service',d-2,'Synthetic competing maintenance',u);
  return 'blocked';
 end if;
 if kind='group' then
  snap:=jsonb_build_object('version',1,'termsVersion','2026-11-25','fulfillment','pickup','rentals',jsonb_build_array(jsonb_build_object('itemId',item,'name','Race drill','startDate',d,'endDate',d,'quantity',1,'totalOre',30000,'depositOre',0)),'goods','[]'::jsonb,'rentalOre',30000,'salesOre',0,'depositOre',0,'payableOre',30000);
  result:=public.draft_group_reserve(u,signing_ci.uid(label||':'||side||':request'),repeat('a',64),snap);
 elsif kind='legacy' then
  record_data:=jsonb_build_object('customer_user_id',u,'booking_number','RACE-'||label||'-'||side,'rental_item_id',item,'customer','{}'::jsonb,'start_date',d,'end_date',d,'price_snapshot','{}'::jsonb,'total_ore',30000,'deposit_ore',0,'terms_version','2026-11-25','pending_payment',false);
  result:=public.create_rental_booking_if_available(record_data,d,d);
 else raise exception 'UNKNOWN_TEST_KIND';
 end if;
 if result is null then raise exception 'NULL_RESERVATION';end if;
 return 'reserved';
exception when raise_exception then
 if sqlerrm in ('GROUP_UNAVAILABLE','RENTAL_UNAVAILABLE','RENTAL_CAPACITY_BUSY') then return 'unavailable';end if;
 raise;
end $$;
