-- Disposable CI helpers only. No production migration.
create schema signing_ci;
create function signing_ci.uid(label text) returns uuid language sql immutable as $$select md5('signing-ci:'||label)::uuid$$;
create function signing_ci.require(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function signing_ci.seed(label text,account_label text default null) returns void language plpgsql as $$
declare u uuid:=signing_ci.uid(coalesce(account_label,label)||':user');
 g uuid:=signing_ci.uid(label||':group'); a uuid:=signing_ci.uid(label||':agreement');
 pdf bytea:=convert_to('%PDF-1.4 synthetic '||label,'UTF8');
begin
 insert into auth.users values(u,u::text||'@example.invalid',clock_timestamp()) on conflict(id) do nothing;
 insert into public.rental_order_groups(id,customer_user_id,request_id,quote_digest,quote_snapshot,terms_version,rental_ore,sales_ore,deposit_ore,payable_ore,expires_at)
 values(g,u,gen_random_uuid(),repeat('a',64),'{}','2026-11-25',60000,0,150000,60000,clock_timestamp()+interval '30 minutes');
 insert into public.aadland_agreements(id,group_id,customer_user_id,revision,document_bytes,document_digest,quote_digest,terms_version)
 values(a,g,u,1,pdf,encode(sha256(pdf),'hex'),repeat('a',64),'2026-11-25');
 insert into public.aadland_agreement_current values(g,a);
end $$;
create function signing_ci.issue(label text,challenge_label text) returns text language plpgsql as $$
declare a public.aadland_agreements%rowtype;
begin
 select * into strict a from public.aadland_agreements where id=signing_ci.uid(label||':agreement');
 return public.draft_signing_issue(a.id,a.customer_user_id,a.customer_user_id::text||'@example.invalid',signing_ci.uid(challenge_label),'test',repeat('b',64),clock_timestamp(),a.document_digest,a.quote_digest,a.terms_version);
end $$;
create function signing_ci.commit(label text,challenge_label text,expected_attempts integer,action text) returns text language plpgsql as $$
declare a public.aadland_agreements%rowtype; evidence text; cid uuid:=signing_ci.uid(challenge_label);
begin
 select * into strict a from public.aadland_agreements where id=signing_ci.uid(label||':agreement');
 evidence:=jsonb_build_object('version','aadland-email-otp-v1','method','typed_name_email_otp','agreementId',a.id::text,'customerId',a.customer_user_id::text,'challengeId',cid::text,'email',a.customer_user_id::text||'@example.invalid','documentDigest',a.document_digest,'quoteDigest',a.quote_digest,'termsVersion',a.terms_version,'statement','Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.','name','Demo Kunde','signedAt',clock_timestamp())::text;
 return public.draft_signing_commit(a.id,a.customer_user_id,a.customer_user_id::text||'@example.invalid',cid,repeat('b',64),expected_attempts,'test',action,evidence,repeat('c',64));
end $$;
-- Age existing synthetic records instead of sleeping for minutes. Never used in real data.
-- One clock value ensures exact TTL constraint.
create function signing_ci.age(challenge_label text,age interval) returns void language plpgsql as $$
declare t timestamptz:=clock_timestamp()-age;
begin update public.aadland_signing_challenges set issued_at=t,expires_at=t+interval '10 minutes' where id=signing_ci.uid(challenge_label); end $$;
do $$
begin
 perform signing_ci.seed('parallel-sign');
 perform signing_ci.require(signing_ci.issue('parallel-sign','parallel-sign-code')='reserved','parallel signing fixture');
 perform signing_ci.seed('parallel-fail');
 perform signing_ci.require(signing_ci.issue('parallel-fail','parallel-fail-code')='reserved','parallel failures fixture');
 perform signing_ci.seed('parallel-issue');
 perform signing_ci.seed('expired-code');
 perform signing_ci.require(signing_ci.issue('expired-code','expired-code-1')='reserved','expiry fixture');
 perform signing_ci.age('expired-code-1',interval '11 minutes');
 perform signing_ci.require(signing_ci.commit('expired-code','expired-code-1',0,'record_failure')='expired','expired OTP rejected');
 perform signing_ci.require((select state='expired' and code_mac is null from public.aadland_signing_challenges where id=signing_ci.uid('expired-code-1')),'expired MAC cleared');
 perform signing_ci.seed('expired-group');
 perform signing_ci.require(signing_ci.issue('expired-group','expired-group-1')='reserved','reservation fixture');
 update public.rental_order_groups set expires_at=clock_timestamp()-interval '1 second' where id=signing_ci.uid('expired-group:group');
 perform signing_ci.require(signing_ci.commit('expired-group','expired-group-1',0,'consume_and_record')='unavailable','expired reservation prevents signature');
 perform signing_ci.require(not exists(select 1 from public.aadland_signing_evidence where agreement_id=signing_ci.uid('expired-group:agreement')),'expired reservation no evidence');
 perform signing_ci.seed('quota');
 perform signing_ci.seed('quota-other','quota');
 perform signing_ci.require(signing_ci.issue('quota','quota-1')='reserved','quota first issue');
 perform signing_ci.age('quota-1',interval '5 minutes');
 perform signing_ci.require(signing_ci.issue('quota','quota-2')='reserved','quota replacement');
 perform signing_ci.require((select state='revoked' and code_mac is null from public.aadland_signing_challenges where id=signing_ci.uid('quota-1')),'old OTP revoked');
 perform signing_ci.age('quota-2',interval '3 minutes');
 perform signing_ci.require(signing_ci.issue('quota','quota-3')='reserved','quota third issue');
 perform signing_ci.age('quota-3',interval '2 minutes');
 perform signing_ci.require(signing_ci.issue('quota-other','quota-4')='limited','account-wide fourth issue denied');
 perform signing_ci.seed('attempts');
 perform signing_ci.seed('attempts-other','attempts');
 perform signing_ci.require(signing_ci.issue('attempts','attempt-1')='reserved','attempt fixture');
 perform signing_ci.age('attempt-1',interval '2 minutes');
 perform signing_ci.require(signing_ci.issue('attempts-other','attempt-2')='reserved','second agreement same account');
 for i in 0..2 loop
  perform signing_ci.require(signing_ci.commit('attempts','attempt-1',i,'record_failure')='wrong_code','first agreement failure');
 end loop;
 for i in 0..1 loop
  perform signing_ci.require(signing_ci.commit('attempts-other','attempt-2',i,'record_failure')='wrong_code','second agreement failure');
 end loop;
 perform signing_ci.require(signing_ci.commit('attempts-other','attempt-2',2,'consume_and_record')='limited','account-wide five failures block signature');
 perform signing_ci.seed('five');
 perform signing_ci.require(signing_ci.issue('five','five-1')='reserved','per-code fixture');
 for i in 0..4 loop
  perform signing_ci.require(signing_ci.commit('five','five-1',i,'record_failure')='wrong_code','failed code attempt');
 end loop;
 perform signing_ci.require((select state='locked' and attempts=5 and code_mac is null from public.aadland_signing_challenges where id=signing_ci.uid('five-1')),'fifth failure locks and clears MAC');
end $$;
