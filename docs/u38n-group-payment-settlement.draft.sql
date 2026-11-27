-- Isolated design draft, no live migration or runtime grants.
begin;
create table public.rental_group_payment_claims(
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 agreement_id uuid not null references public.aadland_signing_evidence(agreement_id) on delete restrict,
 document_digest text not null check(document_digest ~ '^[0-9a-f]{64}$'),
 evidence_seal text not null check(evidence_seal ~ '^[0-9a-f]{64}$'),
 reference text not null unique, amount_ore integer not null check(amount_ore>=100),
 psp_reference text unique, captured_at timestamptz,
 check((psp_reference is null)=(captured_at is null))
);
alter table public.rental_group_payment_claims enable row level security;
revoke all on public.rental_group_payment_claims from public,anon,authenticated,service_role;
-- Caller must freshly verify canonical quote, PDF and HMAC on trusted server.
-- This comparison is not a cryptographic verifier; no client permission.
create function public.draft_group_payment_binding(p_group uuid,p_agreement uuid,p_document text,p_seal text)
returns boolean language sql security invoker set search_path=pg_catalog,public as $$
 select exists(
 select 1 from public.rental_order_groups g
 join public.aadland_agreement_current c on c.group_id=g.id
 join public.aadland_agreements a on a.id=c.agreement_id and a.group_id=g.id and a.customer_user_id=g.customer_user_id
 join public.aadland_signing_evidence e on e.agreement_id=a.id
 join public.aadland_signing_challenges ch on ch.id=e.challenge_id and ch.agreement_id=a.id
 where g.id=p_group and a.id=p_agreement and a.document_digest=p_document and e.evidence_seal=p_seal
 and a.quote_digest=g.quote_digest and a.terms_version=g.terms_version
 and ch.state='consumed' and ch.code_mac is null
 and e.signed_at>=a.created_at and e.signed_at<g.expires_at
 )
$$;
revoke all on function public.draft_group_payment_binding(uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function public.draft_group_payment_claim(p_group uuid,p_customer uuid,p_agreement uuid,p_document text,p_seal text,p_amount integer)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; ref text:='AUG-'||p_group::text;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.customer_user_id is distinct from p_customer or p_amount is distinct from g.payable_ore or g.payable_ore<100 then return 'review'; end if;
 if not public.draft_group_payment_binding(p_group,p_agreement,p_document,p_seal) then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=p_group;
 if found then
  if c.agreement_id=p_agreement and c.document_digest=p_document and c.evidence_seal=p_seal and c.amount_ore=p_amount and c.reference=g.payment_reference then return 'existing'; end if;
  return 'review';
 end if;
 if g.status<>'held' or g.expires_at<=clock_timestamp() or g.payment_reference is not null then return 'review'; end if;
 insert into public.rental_group_payment_claims(group_id,agreement_id,document_digest,evidence_seal,reference,amount_ore)
 values(p_group,p_agreement,p_document,p_seal,ref,p_amount);
 update public.rental_order_groups set status='payment_pending',payment_reference=ref where id=p_group;
 insert into public.rental_group_events(group_id,event,source_reference) values(p_group,'payment_start',ref);
 return 'claimed';
end $$;
revoke all on function public.draft_group_payment_claim(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
-- Fresh authenticated provider GET only, after server-side reconciliation.
-- No webhook or browser status is sufficient. No capture/provider call in SQL.
create function public.draft_group_payment_confirm(p_group uuid,p_reference text,p_psp text,p_currency text,p_authorized integer,p_captured integer,p_cancelled integer,p_refunded integer)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; n integer;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=p_group;
 if not found or g.payment_reference is distinct from p_reference or c.reference is distinct from p_reference
 or p_psp is null or length(trim(p_psp)) not between 1 and 200 or p_currency is distinct from 'NOK'
 or p_authorized is distinct from c.amount_ore or p_captured is distinct from c.amount_ore
 or p_cancelled is distinct from 0 or p_refunded is distinct from 0 or c.amount_ore is distinct from g.payable_ore then return 'review'; end if;
 if not public.draft_group_payment_binding(p_group,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review'; end if;
 if g.status in ('confirmed','fulfilled') and c.psp_reference=p_psp and c.captured_at is not null then return 'existing'; end if;
 if g.status<>'payment_pending' or c.psp_reference is not null then return 'review'; end if;
 if exists(select 1 from public.rental_group_payment_claims where psp_reference=p_psp and group_id<>p_group) then return 'review'; end if;
 select count(*) into n from public.rental_bookings where group_id=p_group and status='new' and payment_status='unpaid' and payment_reference is null;
 if n is distinct from (select sum((x->>'quantity')::integer) from jsonb_array_elements(g.quote_snapshot->'rentals') x)
 or n<>(select count(*) from public.rental_bookings where group_id=p_group) then return 'review'; end if;
 update public.rental_group_payment_claims set psp_reference=p_psp,captured_at=clock_timestamp() where group_id=p_group;
 -- Child payment fields stay untouched: group is sole payment ledger.
 update public.rental_bookings set status='confirmed',updated_at=clock_timestamp() where group_id=p_group;
 update public.rental_order_groups set status='confirmed' where id=p_group;
 insert into public.rental_group_events(group_id,event,source_reference) values(p_group,'confirm',p_psp);
 return 'confirmed';
end $$;
revoke all on function public.draft_group_payment_confirm(uuid,text,text,text,integer,integer,integer,integer) from public,anon,authenticated,service_role;
-- Trusted server must verify fresh payment, deposit and signed handover report;
-- this candidate takes explicit bound reference and a unique report ID, not a browser flag.
create function public.draft_group_fulfill(p_group uuid,p_reference text,p_psp text,p_report uuid,p_deposit integer)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; r record; n integer;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=p_group;
 if not found or p_report is null or c.captured_at is null or p_reference is distinct from c.reference or p_psp is distinct from c.psp_reference
 or p_deposit is distinct from g.deposit_ore or g.payment_reference is distinct from c.reference then return 'review'; end if;
 if not public.draft_group_payment_binding(p_group,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review'; end if;
 if g.status='fulfilled' then
  if exists(select 1 from public.rental_group_events where group_id=p_group and event='fulfill' and source_reference=p_report::text) then return 'existing'; end if;
  return 'review';
 end if;
 if g.status<>'confirmed' then return 'review'; end if;
 -- Same per-item locks as availability. Group is locked before item/stock.
 for r in select distinct rental_item_id from public.rental_bookings where group_id=p_group order by rental_item_id loop
  perform pg_advisory_xact_lock(hashtext(r.rental_item_id::text));
 end loop;
 select count(*) into n from public.rental_bookings where group_id=p_group and status='confirmed';
 if n is distinct from (select sum((x->>'quantity')::integer) from jsonb_array_elements(g.quote_snapshot->'rentals') x)
 or n<>(select count(*) from public.rental_bookings where group_id=p_group) then return 'review'; end if;
 -- Confirm all reserved goods match the immutable snapshot before stock writes.
 if exists(
  (select consumable_id,quantity,unit_ore from public.rental_group_goods where group_id=p_group
   except select (x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unitOre')::integer from jsonb_array_elements(g.quote_snapshot->'goods') x)
  union all
  (select (x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unitOre')::integer from jsonb_array_elements(g.quote_snapshot->'goods') x
   except select consumable_id,quantity,unit_ore from public.rental_group_goods where group_id=p_group)
 ) then return 'review'; end if;
 for r in select consumable_id,quantity from public.rental_group_goods where group_id=p_group order by consumable_id loop
  update public.rental_consumables set stock_quantity=stock_quantity-r.quantity,reserved_quantity=reserved_quantity-r.quantity,revision=revision+1
  where id=r.consumable_id and reserved_quantity>=r.quantity and stock_quantity>=r.quantity and revision<2147483646;
  if not found then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 end loop;
 update public.rental_bookings set status='active',updated_at=clock_timestamp() where group_id=p_group;
 update public.rental_order_groups set status='fulfilled' where id=p_group;
 insert into public.rental_group_events(group_id,event,source_reference) values(p_group,'fulfill',p_report::text);
 return 'fulfilled';
end $$;
revoke all on function public.draft_group_fulfill(uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
-- No runtime grant. Deposit and report proof need durable binding before activation;
-- refund/release/return settlement and provider capture are separate unfinished flows.
rollback;
