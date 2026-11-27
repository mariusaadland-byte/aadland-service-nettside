do $$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); q text:=repeat('a',64); bytes bytea:=convert_to('%PDF-1.4 synthetic agreement','UTF8'); d text;
begin
 insert into auth.users values(u,'checkout@example.invalid',clock_timestamp()),(other,'checkout-other@example.invalid',clock_timestamp());
 insert into public.rental_order_groups(id,customer_user_id,request_id,quote_digest,quote_snapshot,terms_version,rental_ore,sales_ore,deposit_ore,payable_ore,expires_at) values(g,u,gen_random_uuid(),q,'{}','2026-11-25',30000,0,50000,30000,clock_timestamp()+interval '30 minutes');
 d:=encode(sha256(bytes),'hex');
 perform pg_temp.require(public.draft_group_attach_agreement(g,other,'checkout-other@example.invalid',a,bytes,d,q,'2026-11-25') is null,'foreign account cannot attach');
 perform pg_temp.require(public.draft_group_attach_agreement(g,u,'checkout@example.invalid',a,bytes,repeat('b',64),q,'2026-11-25') is null,'wrong document digest rejected');
 perform pg_temp.require(public.draft_group_attach_agreement(g,u,'checkout@example.invalid',a,bytes,d,q,'2026-11-25')=a,'agreement attached');
 perform pg_temp.require(public.draft_group_attach_agreement(g,u,'checkout@example.invalid',gen_random_uuid(),bytes,d,q,'2026-11-25')=a,'attach replay returns original');
 perform pg_temp.require((select signing_email='checkout@example.invalid' from public.aadland_agreements where id=a),'original email pinned');
 update auth.users set email='changed@example.invalid' where id=u;
 perform pg_temp.require(public.draft_group_attach_agreement(g,u,'changed@example.invalid',gen_random_uuid(),bytes,d,q,'2026-11-25') is null,'changed email cannot reuse old agreement');
 update auth.users set email='checkout@example.invalid' where id=u;
 perform pg_temp.require((select count(*)=1 from public.aadland_agreements where group_id=g),'only one agreement');
 update public.rental_order_groups set expires_at=clock_timestamp()-interval '1 second' where id=g;
 perform pg_temp.require(public.draft_group_attach_agreement(g,u,'checkout@example.invalid',gen_random_uuid(),bytes,d,q,'2026-11-25') is null,'expired hold cannot attach');
 perform pg_temp.require(not has_function_privilege('authenticated','public.draft_group_attach_agreement(uuid,uuid,text,uuid,bytea,text,text,text)','EXECUTE'),'no direct client grant');
end $$;
