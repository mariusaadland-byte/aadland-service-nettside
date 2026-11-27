-- Synthetic group return with one damaged unit; no actual claim or transfer.
do $$
declare u uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); claim uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); digest text:=repeat('d',64); photo text:=repeat('a',64); proof text:=repeat('b',64);
begin
 insert into auth.users values(u,'damage-demo@example.invalid',clock_timestamp());
 insert into public.rental_items(id,name,quantity,daily_price_ore,deposit_ore) values(item,'Damage demo',1,30000,50000);
 insert into public.rental_order_groups(id,customer_user_id,request_id,quote_digest,quote_snapshot,terms_version,rental_ore,sales_ore,deposit_ore,payable_ore,status,expires_at) values(g,u,gen_random_uuid(),digest,'{}','2026-11-25',30000,0,50000,30000,'confirmed',clock_timestamp()+interval '30 minutes');
 perform pg_temp.require(public.draft_group_deposit_record(g,'damage-deposit-ci',50000,proof,actor)='recorded','damage fixture deposit');
 update public.rental_order_groups set status='fulfilled' where id=g;
 insert into public.rental_bookings(id,booking_number,rental_item_id,customer_user_id,customer,start_date,end_date,status,price_snapshot,total_ore,deposit_ore,group_id,group_unit) values(b,'DAMAGE-CI',item,u,'{}',current_date,current_date,'active','{}',30000,50000,g,1);
 perform pg_temp.require(public.draft_group_receive_return(g,b,gen_random_uuid(),actor,'damage','Documented damaged housing',digest)='received','damaged unit physically received');
 perform pg_temp.require((select status='active' from public.rental_bookings where id=b),'damaged unit not released');
 perform pg_temp.require(public.draft_group_damage_claim(g,b,claim,actor,'Housing repair',10000,array[]::text[],proof,digest)='review','missing photo rejected');
 perform pg_temp.require(public.draft_group_damage_claim(g,b,claim,actor,'Housing repair',10000,array[photo],proof,digest)='recorded','documented claim');
 perform pg_temp.require(public.draft_group_damage_response(g,claim,actor,digest,'accepted','')='review','foreign customer cannot respond');
 perform pg_temp.require(public.draft_group_agreed_damage_plan(g,req,actor,40000,10000,digest)='review','no deduction without response and inspection');
 perform pg_temp.require(public.draft_group_inspection_resolve(g,b,actor,proof)='resolved','physical inspection resolved');
 perform pg_temp.require(public.draft_group_agreed_damage_plan(g,req,actor,40000,10000,digest)='review','silence is not consent');
 perform pg_temp.require(public.draft_group_damage_response(g,claim,u,repeat('e',64),'accepted','')='review','wrong claim revision rejected');
 perform pg_temp.require(public.draft_group_damage_response(g,claim,u,digest,'accepted','Agreed in synthetic test')='recorded','explicit accepted claim');
 perform pg_temp.require(public.draft_group_damage_response(g,claim,u,digest,'disputed','')='review','cannot overwrite response');
 perform pg_temp.require(public.draft_group_agreed_damage_plan(g,req,actor,30000,20000,digest)='review','excess deduction denied');
 perform pg_temp.require(public.draft_group_agreed_damage_plan(g,req,actor,40000,10000,digest)='planned','agreed partial refund plan');
 perform pg_temp.require(public.draft_group_return_close(g,req,40000,null,null)='review','actual refund proof needed');
 perform pg_temp.require(public.draft_group_return_close(g,req,40000,'damage-refund-ci',proof)='closed','synthetic external partial refund recorded');
 perform pg_temp.require(not has_function_privilege('authenticated','public.draft_group_agreed_damage_plan(uuid,uuid,uuid,integer,integer,text)','EXECUTE'),'client cannot deduct');
end $$;
