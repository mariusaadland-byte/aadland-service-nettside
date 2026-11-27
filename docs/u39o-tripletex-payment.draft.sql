-- Design only, no runtime grants.
begin;
create table public.rental_group_tripletex_payment_transfers(
 group_id uuid primary key references public.rental_group_tripletex_transfers(group_id),
 company_id bigint not null check(company_id>0),
 remote_invoice_id bigint not null check(remote_invoice_id>0),
 payment_type_id bigint not null check(payment_type_id>0),
 payment_date date not null,
 amount_ore integer not null check(amount_ore>0),
 source_digest text not null check(source_digest ~ '^[0-9a-f]{64}$'),
 payment_digest text not null check(payment_digest ~ '^[0-9a-f]{64}$'),
 state text not null default 'claimed' check(state in ('claimed','review','confirmed')),
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 confirmed_at timestamptz,
 unique(company_id,remote_invoice_id),
 check((state='confirmed')=(confirmed_at is not null))
);
alter table public.rental_group_tripletex_payment_transfers enable row level security;
revoke all on public.rental_group_tripletex_payment_transfers from public,anon,authenticated,service_role;
create function public.draft_group_tripletex_payment_claim(p_group uuid,p_company bigint,p_invoice bigint,p_type bigint,p_date date,p_amount integer,p_source text,p_digest text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; t public.rental_group_tripletex_transfers%rowtype; c public.rental_group_payment_claims%rowtype; p public.rental_group_tripletex_payment_transfers%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_actor is null or p_type is null or p_type<=0 or p_date is null or p_date>(clock_timestamp() at time zone 'Europe/Oslo')::date or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_amount is distinct from g.payable_ore then return 'review';end if;
 select * into t from public.rental_group_tripletex_transfers where group_id=g.id for update;
 if not found or t.state<>'confirmed' or t.company_id is distinct from p_company or t.remote_invoice_id is distinct from p_invoice or t.gross_ore is distinct from p_amount or t.source_digest is distinct from p_source then return 'review';end if;
 select * into c from public.rental_group_payment_claims where group_id=g.id;
 if not found or c.captured_at is null or c.psp_reference is null or c.amount_ore is distinct from p_amount or c.reference is distinct from g.payment_reference or not public.draft_group_payment_binding(g.id,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review';end if;
 select * into p from public.rental_group_tripletex_payment_transfers where group_id=g.id;
 if found then
 if p.company_id=p_company and p.remote_invoice_id=p_invoice and p.payment_type_id=p_type and p.payment_date=p_date and p.amount_ore=p_amount and p.source_digest=p_source and p.payment_digest=p_digest then return 'existing';end if;
 return 'review';end if;
 insert into public.rental_group_tripletex_payment_transfers(group_id,company_id,remote_invoice_id,payment_type_id,payment_date,amount_ore,source_digest,payment_digest,actor_id) values(g.id,p_company,p_invoice,p_type,p_date,p_amount,p_source,p_digest,p_actor);
 return 'claimed';
end $$;
revoke all on function public.draft_group_tripletex_payment_claim(uuid,bigint,bigint,bigint,date,integer,text,text,uuid) from public,anon,authenticated,service_role;
create function public.draft_group_tripletex_payment_finish(p_group uuid,p_invoice bigint,p_digest text,p_confirmed boolean)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.rental_group_tripletex_payment_transfers%rowtype;
begin
 select * into p from public.rental_group_tripletex_payment_transfers where group_id=p_group for update;
 if not found or p.remote_invoice_id is distinct from p_invoice or p.payment_digest is distinct from p_digest or p_confirmed is null then return 'review';end if;
 if p.state='confirmed' then return case when p_confirmed then 'existing' else 'review' end;end if;
 -- Unknown outcome cannot be promoted by this writer. Manual proof reconciliation is separate.
 if p.state<>'claimed' then return 'review';end if;
 update public.rental_group_tripletex_payment_transfers set state=case when p_confirmed then 'confirmed' else 'review' end,confirmed_at=case when p_confirmed then clock_timestamp() else null end where group_id=p_group;
 return case when p_confirmed then 'confirmed' else 'review' end;
end $$;
revoke all on function public.draft_group_tripletex_payment_finish(uuid,bigint,text,boolean) from public,anon,authenticated,service_role;
rollback;
