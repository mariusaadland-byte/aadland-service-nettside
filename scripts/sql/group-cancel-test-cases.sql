do $$
declare u uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); goods uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); req2 uuid:=gen_random_uuid(); req3 uuid:=gen_random_uuid(); g uuid; g2 uuid; q text:=repeat('c',64); day date:=(clock_timestamp() at time zone 'Europe/Oslo')::date+2; snap jsonb; rejected boolean:=false;
begin
 insert into auth.users values(u,'cancel-ci@example.invalid',clock_timestamp());
 insert into public.rental_items(id,name,quantity,daily_price_ore,deposit_ore) values(item,'Cancel demo',3,30000,50000);
 insert into public.rental_consumables(id,rental_item_id,name,sku,price_ore,stock_quantity,active) values(goods,item,'Cancel bit','CI-CANCEL',2500,5,true);
 snap:=jsonb_build_object('version',1,'termsVersion','2026-11-25','fulfillment','pickup','rentals',jsonb_build_array(jsonb_build_object('itemId',item,'name','Cancel demo','startDate',day,'endDate',day,'quantity',1,'totalOre',30000,'depositOre',50000)),'goods',jsonb_build_array(jsonb_build_object('id',goods,'name','Cancel bit','sku','CI-CANCEL','quantity',2,'unitOre',2500,'totalOre',5000)),'rentalOre',30000,'salesOre',5000,'depositOre',50000,'payableOre',35000);
 g:=public.draft_group_reserve(u,req,q,snap);
 perform pg_temp.require(public.draft_group_cancel_request(u,req)='cancelled','unpaid cancellation');
 perform pg_temp.require(public.draft_group_cancel_request(u,req)='cancelled','cancel replay');
 perform pg_temp.require((select status='released' from public.rental_order_groups where id=g),'group released');
 perform pg_temp.require((select stock_quantity=5 and reserved_quantity=0 from public.rental_consumables where id=goods),'stock released once');
 perform pg_temp.require(public.draft_group_cancel_request(u,req2)='cancelled','pre-reserve tombstone');
 begin perform public.draft_group_reserve(u,req2,q,snap);exception when raise_exception then if sqlerrm<>'GROUP_REQUEST_CANCELLED' then raise;end if;rejected:=true;end;
 perform pg_temp.require(rejected,'delayed reserve rejected');
 g2:=public.draft_group_reserve(u,req3,q,snap);
 update public.rental_order_groups set status='payment_pending',payment_reference='AUG-'||g2::text where id=g2;
 perform pg_temp.require(public.draft_group_cancel_request(u,req3)='payment_review','payment pending blocked');
 perform pg_temp.require((select reserved_quantity=2 from public.rental_consumables where id=goods),'payment pending stock retained');
 perform pg_temp.require(not has_function_privilege('authenticated','public.draft_group_cancel_request(uuid,uuid)','EXECUTE'),'client cannot call RPC');
end $$;
