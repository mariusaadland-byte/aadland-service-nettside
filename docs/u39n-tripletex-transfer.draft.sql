-- Isolated design only. Never grant to client roles or activate transfer.
begin;
create table public.rental_group_tripletex_transfers(
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 company_id bigint not null check(company_id>0),
 customer_id bigint not null check(customer_id>0),
 vat_type_id bigint not null check(vat_type_id>0),
 gross_ore integer not null check(gross_ore>0),
 source_digest text not null check(source_digest ~ '^[0-9a-f]{64}$'),
 marker text not null unique,
 state text not null default 'claimed' check(state in ('claimed','review','confirmed')),
 remote_invoice_id bigint check(remote_invoice_id>0),
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(company_id,remote_invoice_id),
 check((state='confirmed')=(remote_invoice_id is not null))
);
alter table public.rental_group_tripletex_transfers enable row level security;
revoke all on public.rental_group_tripletex_transfers from public,anon,authenticated,service_role;
-- Caller must verify provider account, VAT, accounting dates, duplicate search,
-- fresh payment, archive signature and fingerprint BEFORE claim.
create function public.draft_group_tripletex_claim(p_group uuid,p_company bigint,p_customer bigint,p_vat bigint,p_gross integer,p_digest text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; t public.rental_group_tripletex_transfers%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_actor is null or p_company is null or p_company<=0 or p_customer is null or p_customer<=0 or p_vat is null or p_vat<=0 or p_gross is distinct from g.payable_ore or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then return 'review';end if;
 select * into c from public.rental_group_payment_claims where group_id=g.id;
 if not found or c.captured_at is null or c.psp_reference is null or c.reference is distinct from g.payment_reference or c.amount_ore is distinct from g.payable_ore or not public.draft_group_payment_binding(g.id,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review';end if;
 select * into t from public.rental_group_tripletex_transfers where group_id=g.id;
 if found then
  if t.company_id=p_company and t.customer_id=p_customer and t.vat_type_id=p_vat and t.gross_ore=p_gross and t.source_digest=p_digest then return 'existing';end if;
  return 'review';
 end if;
 insert into public.rental_group_tripletex_transfers(group_id,company_id,customer_id,vat_type_id,gross_ore,source_digest,marker,actor_id) values(g.id,p_company,p_customer,p_vat,p_gross,p_digest,'AU-GROUP-'||g.id::text,p_actor);
 return 'claimed';
end $$;
revoke all on function public.draft_group_tripletex_claim(uuid,bigint,bigint,bigint,integer,text,uuid) from public,anon,authenticated,service_role;
-- Never retry creation automatically after ambiguous provider outcome.
-- Confirmation requires trusted remote readback, exact marker, company, customer and gross.
create function public.draft_group_tripletex_finish(p_group uuid,p_digest text,p_company bigint,p_customer bigint,p_gross integer,p_marker text,p_invoice bigint)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t public.rental_group_tripletex_transfers%rowtype;
begin
 select * into t from public.rental_group_tripletex_transfers where group_id=p_group for update;
 if not found or t.source_digest is distinct from p_digest or t.company_id is distinct from p_company or t.customer_id is distinct from p_customer or t.gross_ore is distinct from p_gross or t.marker is distinct from p_marker or p_invoice is not null and p_invoice<=0 then return 'review';end if;
 if t.state='confirmed' then if t.remote_invoice_id=p_invoice then return 'existing';end if;return 'review';end if;
 update public.rental_group_tripletex_transfers set state=case when p_invoice is null then 'review' else 'confirmed' end,remote_invoice_id=p_invoice where group_id=p_group;
 return case when p_invoice is null then 'review' else 'confirmed' end;
end $$;
revoke all on function public.draft_group_tripletex_finish(uuid,text,bigint,bigint,integer,text,bigint) from public,anon,authenticated,service_role;
rollback;
