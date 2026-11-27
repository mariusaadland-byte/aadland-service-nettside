-- Actual U-37F and U-38D draft functions, synthetic data only.
do $$
declare
 u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
 item uuid:=gen_random_uuid(); goods uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); g uuid; g2 uuid; a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 q text:=repeat('d',64); mac text:=repeat('b',64);
 day date:=(clock_timestamp() at time zone 'Europe/Oslo')::date+2;
 snap jsonb; goods_short jsonb; rental_short jsonb; altered jsonb;
 pdf bytea:=convert_to('%PDF-1.4 synthetic group agreement','UTF8'); digest text; issued timestamptz; evidence text;
 n integer; rejected boolean;
begin
 insert into auth.users values(u,'group-demo@example.invalid',clock_timestamp()),(u2,'other-group@example.invalid',clock_timestamp());
 insert into public.rental_items(id,name,quantity,daily_price_ore,deposit_ore) values(item,'Demo drill',3,30000,50000);
 insert into public.rental_consumables(id,rental_item_id,name,sku,price_ore,stock_quantity,active) values(goods,item,'Demo bit','CI-BIT',2500,5,true);
 snap:=jsonb_build_object('version',1,'termsVersion','2026-11-25','fulfillment','pickup',
 'rentals',jsonb_build_array(jsonb_build_object('itemId',item,'name','Demo drill','startDate',day,'endDate',day,'quantity',2,'totalOre',60000,'depositOre',100000)),
 'goods',jsonb_build_array(jsonb_build_object('id',goods,'name','Demo bit','sku','CI-BIT','quantity',3,'unitOre',2500,'totalOre',7500)),
 'rentalOre',60000,'salesOre',7500,'depositOre',100000,'payableOre',67500);
 g:=public.draft_group_reserve(u,request_id,q,snap);
 perform pg_temp.require(g is not null,'group created');
 perform pg_temp.require((select count(*)=2 from public.rental_bookings where group_id=g and status='new'),'two physical units held');
 perform pg_temp.require((select stock_quantity=5 and reserved_quantity=3 from public.rental_consumables where id=goods),'physical stock unchanged; three reserved');
 perform pg_temp.require((select payable_ore=67500 and deposit_ore=100000 from public.rental_order_groups where id=g),'deposit separate from payable');
 perform pg_temp.require(public.draft_group_reserve(u,request_id,q,snap)=g,'reservation retry idempotent');
 perform pg_temp.require((select reserved_quantity=3 from public.rental_consumables where id=goods),'retry does not reserve twice');
 -- Same item, two more units: only one remains.
 rejected:=false;
 begin perform public.draft_group_reserve(u2,gen_random_uuid(),q,snap);
 exception when raise_exception then if sqlerrm<>'GROUP_UNAVAILABLE' then raise; end if; rejected:=true; end;
 perform pg_temp.require(rejected,'equipment capacity prevents double booking');
 -- One free unit, but three bits requested with only two available.
 goods_short:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(snap,'{rentals,0,quantity}','1'),'{rentals,0,totalOre}','30000'),'{rentals,0,depositOre}','50000'),'{rentalOre}','30000');
 goods_short:=jsonb_set(jsonb_set(goods_short,'{depositOre}','50000'),'{payableOre}','37500');
 rejected:=false;
 begin perform public.draft_group_reserve(u2,gen_random_uuid(),q,goods_short);
 exception when raise_exception then if sqlerrm<>'GROUP_UNAVAILABLE' then raise; end if; rejected:=true; end;
 perform pg_temp.require(rejected,'insufficient goods prevents reservation');
 perform pg_temp.require((select reserved_quantity=3 from public.rental_consumables where id=goods),'failed orders leave stock unchanged');
 perform pg_temp.require(not exists(select 1 from public.rental_order_groups where customer_user_id=u2),'failed orders create no group');
 -- Price manipulation with available equipment and goods.
 rental_short:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(goods_short,'{goods,0,quantity}','1'),'{goods,0,totalOre}','2500'),'{salesOre}','2500'),'{payableOre}','32500');
 altered:=jsonb_set(rental_short,'{payableOre}','1');
 rejected:=false;
 begin perform public.draft_group_reserve(u2,gen_random_uuid(),q,altered);
 exception when raise_exception then if sqlerrm<>'GROUP_PRICE_CHANGED' then raise; end if; rejected:=true; end;
 perform pg_temp.require(rejected,'tampered payable rejected');
 -- Sign the actual reserved group; SQL tests use synthetic trusted decisions.
 digest:=encode(sha256(pdf),'hex');
 insert into public.aadland_agreements(id,group_id,customer_user_id,revision,document_bytes,document_digest,quote_digest,terms_version) values(a,g,u,1,pdf,digest,q,'2026-11-25');
 insert into public.aadland_agreement_current values(g,a);
 issued:=clock_timestamp()-interval '1 second';
 perform pg_temp.require(public.draft_signing_issue(a,u,'group-demo@example.invalid',c,'test',mac,issued,digest,q,'2026-11-25')='reserved','signing tied to actual reserved group');
 evidence:=jsonb_build_object('version','aadland-email-otp-v1','method','typed_name_email_otp','agreementId',a::text,'customerId',u::text,'challengeId',c::text,'email','group-demo@example.invalid','documentDigest',digest,'quoteDigest',q,'termsVersion','2026-11-25','statement','Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.','name','Demo Kunde','signedAt',clock_timestamp())::text;
 perform pg_temp.require(public.draft_signing_commit(a,u,'group-demo@example.invalid',c,mac,0,'test','consume_and_record',evidence,repeat('c',64))='signed','signature registered');
 perform pg_temp.require((select status='held' and payment_reference is null from public.rental_order_groups where id=g),'signature alone not payment');
 perform pg_temp.require(not public.draft_group_expire(g),'active reservation not released');
 -- Admin stock correction cannot drop physical stock below reserved.
 rejected:=false;
 begin perform public.adjust_rental_consumable_stock(goods,gen_random_uuid(),u,1,-3,'loss','CI test');
 exception when check_violation then rejected:=true; end;
 perform pg_temp.require(rejected,'stock cannot be adjusted below held quantity');
 update public.rental_order_groups set expires_at=clock_timestamp()-interval '1 second' where id=g;
 perform pg_temp.require(public.draft_group_expire(g),'signed unpaid expired hold released');
 perform pg_temp.require((select stock_quantity=5 and reserved_quantity=0 from public.rental_consumables where id=goods),'goods available again');
 perform pg_temp.require((select count(*)=2 from public.rental_bookings where group_id=g and status='cancelled'),'equipment released');
 perform pg_temp.require((select count(*)=1 from public.aadland_signing_evidence where agreement_id=a),'historical signature preserved');
 perform pg_temp.require(not public.draft_group_expire(g),'release idempotent');
 g2:=public.draft_group_reserve(u2,gen_random_uuid(),q,snap);
 perform pg_temp.require(g2 is not null,'new booking after release');
 update public.rental_order_groups set expires_at=clock_timestamp()-interval '1 second',payment_reference='AUG-test' where id=g2;
 perform pg_temp.require(not public.draft_group_expire(g2),'hold with payment reference not auto-released');
 perform pg_temp.require((select reserved_quantity=3 from public.rental_consumables where id=goods),'pending payment stock protected');
 perform pg_temp.require(not has_function_privilege('authenticated','public.draft_group_reserve(uuid,uuid,text,jsonb)','EXECUTE'),'no client reserve RPC');
end $$;
