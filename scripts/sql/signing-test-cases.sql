-- Verify actual U-38D SQL transaction decisions in a disposable database.
create function pg_temp.require(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
do $$
declare
 u uuid:='00000000-0000-4000-8000-000000000001';
 other_u uuid:='00000000-0000-4000-8000-000000000002';
 g uuid:='00000000-0000-4000-8000-000000000003';
 a uuid:='00000000-0000-4000-8000-000000000004';
 c uuid:='00000000-0000-4000-8000-000000000005';
 c2 uuid:='00000000-0000-4000-8000-000000000006';
 q text:=repeat('a',64); mac text:=repeat('b',64);
 pdf bytea:=convert_to('%PDF-1.4 synthetic fixture','UTF8');
 digest text; issued timestamptz; evidence text; result text;
begin
 digest:=encode(sha256(pdf),'hex');
 insert into auth.users values(u,'test@example.invalid',clock_timestamp()),(other_u,'other@example.invalid',clock_timestamp());
 insert into public.rental_order_groups(id,customer_user_id,request_id,quote_digest,quote_snapshot,terms_version,rental_ore,sales_ore,deposit_ore,payable_ore,expires_at)
 values(g,u,gen_random_uuid(),q,'{}','2026-11-25',60000,0,150000,60000,clock_timestamp()+interval '30 minutes');
 insert into public.aadland_agreements(id,group_id,customer_user_id,revision,document_bytes,document_digest,quote_digest,terms_version)
 values(a,g,u,1,pdf,digest,q,'2026-11-25');
 insert into public.aadland_agreement_current values(g,a);
 issued:=clock_timestamp()-interval '1 second';
 perform pg_temp.require(public.draft_signing_issue(a,other_u,'other@example.invalid',c,'test',mac,issued,digest,q,'2026-11-25')='unavailable','foreign account denied');
 perform pg_temp.require(public.draft_signing_issue(a,u,'other@example.invalid',c,'test',mac,issued,digest,q,'2026-11-25')='unavailable','wrong email denied');
 perform pg_temp.require(public.draft_signing_issue(a,u,'test@example.invalid',c,'test',mac,issued,digest,q,'2026-11-25')='reserved','issue stored');
 perform pg_temp.require(public.draft_signing_issue(a,u,'test@example.invalid',c2,'test',mac,issued,digest,q,'2026-11-25')='limited','resend cooldown');
 perform pg_temp.require(public.draft_signing_commit(a,u,'test@example.invalid',c,mac,0,'test','record_failure',null,null)='wrong_code','failed attempt persists');
 perform pg_temp.require((select attempts=1 from public.aadland_signing_challenges where id=c),'attempt count');
 perform pg_temp.require(public.draft_signing_commit(a,u,'test@example.invalid',c,mac,0,'test','record_failure',null,null)='stale','stale compare-and-swap rejected');
 -- SQL trusts a server-verified HMAC decision. Here a synthetic seal exercises
 -- the database transaction ONLY; Node cryptographic tests remain separate.
 evidence:=jsonb_build_object('version','aadland-email-otp-v1','method','typed_name_email_otp','agreementId',a::text,'customerId',u::text,'challengeId',c::text,'email','test@example.invalid','documentDigest',digest,'quoteDigest',q,'termsVersion','2026-11-25','statement','Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.','name','Demo Kunde','signedAt',clock_timestamp())::text;
 perform pg_temp.require(public.draft_signing_commit(a,u,'test@example.invalid',c,mac,1,'test','consume_and_record',evidence,repeat('c',64))='signed','consume and evidence commit');
 perform pg_temp.require((select state='consumed' and code_mac is null from public.aadland_signing_challenges where id=c),'secret cleared');
 perform pg_temp.require((select count(*)=1 from public.aadland_signing_evidence where agreement_id=a),'single evidence');
 perform pg_temp.require(public.draft_signing_commit(a,u,'test@example.invalid',c,mac,1,'test','consume_and_record',evidence,repeat('c',64))='closed','replay denied');
 perform pg_temp.require(public.draft_signing_issue(a,u,'test@example.invalid',c2,'test',mac,issued,digest,q,'2026-11-25')='unavailable','already signed cannot issue');
 perform pg_temp.require(not has_table_privilege('anon','public.aadland_agreements','SELECT'),'anon no archive read');
 perform pg_temp.require(not has_table_privilege('authenticated','public.aadland_signing_evidence','SELECT'),'authenticated no evidence read');
 perform pg_temp.require(not has_function_privilege('authenticated','public.draft_signing_commit(uuid,uuid,text,uuid,text,integer,text,text,text,text)','EXECUTE'),'client no commit RPC');
 perform pg_temp.require(not has_function_privilege('service_role','public.draft_signing_commit(uuid,uuid,text,uuid,text,integer,text,text,text,text)','EXECUTE'),'draft service RPC disabled');
 perform pg_temp.require((select relrowsecurity from pg_class where oid='public.aadland_agreements'::regclass),'archive RLS enabled');
end $$;
