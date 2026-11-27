-- Actual SQL functions, synthetic trusted decisions only.
do $$
declare
 u uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); goods uuid:=gen_random_uuid();
 g uuid; a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); report uuid:=gen_random_uuid();
 booking uuid; unit uuid:=gen_random_uuid(); maintenance uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); settlement uuid:=gen_random_uuid();
 q text:=repeat('e',64); mac text:=repeat('b',64); seal text:=repeat('c',64);
 day date:=(clock_timestamp() at time zone 'Europe/Oslo')::date; snap jsonb;
 pdf bytea:=convert_to('%PDF-1.4 synthetic terminal','UTF8'); digest text; evidence text; ref text;
begin
 insert into auth.users values(u,'terminal@example.invalid',clock_timestamp());
 insert into public.rental_items(id,name,slug,quantity,daily_price_ore,deposit_ore) values(item,'Demo saw','ci-'||item::text,2,30000,50000);
 insert into public.rental_consumables(id,rental_item_id,name,sku,price_ore,stock_quantity,active) values(goods,item,'Demo blade','CI-TERMINAL',2500,5,true);
 snap:=jsonb_build_object('version',1,'termsVersion','2026-11-25','fulfillment','pickup',
 'rentals',jsonb_build_array(jsonb_build_object('itemId',item,'name','Demo saw','startDate',day,'endDate',day,'quantity',1,'totalOre',30000,'depositOre',50000)),
 'goods',jsonb_build_array(jsonb_build_object('id',goods,'name','Demo blade','sku','CI-TERMINAL','quantity',2,'unitOre',2500,'totalOre',5000)),
 'rentalOre',30000,'salesOre',5000,'depositOre',50000,'payableOre',35000);
 g:=public.draft_group_reserve(u,gen_random_uuid(),q,snap);
 ref:='AUG-'||g::text; digest:=encode(sha256(pdf),'hex');
 insert into public.aadland_agreements(id,group_id,customer_user_id,revision,document_bytes,document_digest,quote_digest,terms_version) values(a,g,u,1,pdf,digest,q,'2026-11-25');
 insert into public.aadland_agreement_current values(g,a);
 perform pg_temp.require(public.draft_group_payment_claim(g,u,a,digest,seal,35000)='review','unsigned payment claim blocked');
 perform pg_temp.require(public.draft_signing_issue(a,u,'terminal@example.invalid',c,'test',mac,clock_timestamp()-interval '1 second',digest,q,'2026-11-25')='reserved','settlement OTP issued');
 evidence:=jsonb_build_object('version','aadland-email-otp-v1','method','typed_name_email_otp','agreementId',a::text,'customerId',u::text,'challengeId',c::text,'email','terminal@example.invalid','documentDigest',digest,'quoteDigest',q,'termsVersion','2026-11-25','statement','Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.','name','Demo Kunde','signedAt',clock_timestamp())::text;
 perform pg_temp.require(public.draft_signing_commit(a,u,'terminal@example.invalid',c,mac,0,'test','consume_and_record',evidence,seal)='signed','settlement signature');
 perform pg_temp.require(public.draft_group_payment_claim(g,u,a,digest,seal,85000)='review','deposit not included in payment');
 perform pg_temp.require(public.draft_group_payment_claim(g,u,a,digest,seal,35000)='claimed','payment claim atomic');
 perform pg_temp.require(public.draft_group_payment_claim(g,u,a,digest,seal,35000)='existing','payment claim replay');
 perform pg_temp.require(not public.draft_group_expire(g),'claimed payment hold protected');

 perform pg_temp.require(public.draft_group_release_terminal(g,ref,'terminal-ci','CREATED','NOK',0,0,0,0,clock_timestamp())='review','nonterminal hold retained');
 perform pg_temp.require(public.draft_group_release_terminal(g,ref,'terminal-ci','ABORTED','NOK',35000,0,0,0,clock_timestamp())='review','open funds hold retained');
 perform pg_temp.require(public.draft_group_release_terminal(g,ref,'terminal-ci','ABORTED','NOK',35000,0,35000,0,clock_timestamp())='review','captured funds hold retained');
 perform pg_temp.require(public.draft_group_release_terminal(g,ref,'terminal-ci','EXPIRED','NOK',0,0,0,0,clock_timestamp()-interval '2 minutes')='review','stale evidence rejected');
 perform pg_temp.require((select reserved_quantity=2 from public.rental_consumables where id=goods),'unknown status retains goods');
 perform pg_temp.require(public.draft_group_release_terminal(g,ref,'terminal-ci','ABORTED','NOK',35000,35000,0,0,clock_timestamp())='released','verified terminal no-capture releases');
 perform pg_temp.require(public.draft_group_release_terminal(g,ref,'terminal-ci','ABORTED','NOK',35000,35000,0,0,clock_timestamp())='existing','terminal replay');
 perform pg_temp.require((select stock_quantity=5 and reserved_quantity=0 from public.rental_consumables where id=goods),'goods released exactly once');
 perform pg_temp.require((select status='released' and payment_reference=ref from public.rental_order_groups where id=g),'payment reference retained');
 perform pg_temp.require((select count(*)=1 from public.rental_group_terminal_payments where group_id=g),'proof retained');
 perform pg_temp.require(public.draft_group_payment_confirm(g,ref,'terminal-ci','NOK',35000,35000,0,0)='review','late capture cannot reopen released group');
 perform pg_temp.require(not has_function_privilege('authenticated','public.draft_group_release_terminal(uuid,text,text,text,text,integer,integer,integer,integer,timestamptz)','EXECUTE'),'no client terminal release grant');
end $$;
