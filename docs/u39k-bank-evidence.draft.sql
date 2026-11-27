-- Isolated only. Private retained sanitized image; no live grants.
begin;
create table public.rental_group_bank_evidence(
 group_id uuid not null references public.rental_order_groups(id),
 kind text not null check(kind in ('deposit','record_refund')),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 reference text not null check(length(trim(reference)) between 1 and 200),
 amount_ore integer not null check(amount_ore>0),
 request_id uuid,
 actor_id uuid not null,
 image_bytes bytea not null check(octet_length(image_bytes) between 32 and 2097152 and substring(image_bytes from 1 for 3)=decode('ffd8ff','hex')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(group_id,kind,digest),
 check(digest=encode(sha256(image_bytes),'hex')),
 check((kind='deposit')=(request_id is null))
);
alter table public.rental_group_bank_evidence enable row level security;
revoke all on public.rental_group_bank_evidence from public,anon,authenticated,service_role;
create function public.draft_group_bank_evidence_store(p_group uuid,p_kind text,p_digest text,p_reference text,p_amount integer,p_request uuid,p_actor uuid,p_bytes bytea)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; e public.rental_group_bank_evidence%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or p_actor is null or p_amount is null or p_amount<=0 or p_kind is null or p_kind not in ('deposit','record_refund') or p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_bytes is null or octet_length(p_bytes) not between 32 and 2097152 or substring(p_bytes from 1 for 3)<>decode('ffd8ff','hex') or p_digest is distinct from encode(sha256(p_bytes),'hex') then return 'review';end if;
 if p_kind='deposit' and (p_request is not null or g.status not in ('payment_pending','confirmed') or p_amount<>g.deposit_ore) then return 'review';end if;
 if p_kind='record_refund' and not exists(select 1 from public.rental_group_return_settlements where group_id=g.id and request_id=p_request and refund_ore=p_amount and closed_at is null) then return 'review';end if;
 select * into e from public.rental_group_bank_evidence where group_id=g.id and kind=p_kind and digest=p_digest;
 if found then if e.reference=p_reference and e.amount_ore=p_amount and e.request_id is not distinct from p_request then return 'existing';end if;return 'review';end if;
 if (select count(*) from public.rental_group_bank_evidence where group_id=g.id and kind=p_kind)>=5 then return 'review';end if;
 insert into public.rental_group_bank_evidence(group_id,kind,digest,reference,amount_ore,request_id,actor_id,image_bytes) values(g.id,p_kind,p_digest,p_reference,p_amount,p_request,p_actor,p_bytes);
 return 'stored';
end $$;
revoke all on function public.draft_group_bank_evidence_store(uuid,text,text,text,integer,uuid,uuid,bytea) from public,anon,authenticated,service_role;
create function public.draft_group_deposit_with_evidence(p_group uuid,p_reference text,p_amount integer,p_proof text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.rental_order_groups where id=p_group for update;
 if not found or not exists(select 1 from public.rental_group_bank_evidence where group_id=p_group and kind='deposit' and digest=p_proof and reference=p_reference and amount_ore=p_amount) then return 'review';end if;
 return public.draft_group_handover_deposit(p_group,p_reference,p_amount,p_proof,p_actor);
end $$;
revoke all on function public.draft_group_deposit_with_evidence(uuid,text,integer,text,uuid) from public,anon,authenticated,service_role;
create function public.draft_group_refund_with_evidence(p_group uuid,p_request uuid,p_actor uuid,p_amount integer,p_reference text,p_proof text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.rental_order_groups where id=p_group for update;
 if not found or (p_amount>0 and not exists(select 1 from public.rental_group_bank_evidence where group_id=p_group and kind='record_refund' and digest=p_proof and request_id=p_request and reference=p_reference and amount_ore=p_amount)) then return 'review';end if;
 return public.draft_group_record_deposit_refund(p_group,p_request,p_actor,p_amount,p_reference,p_proof);
end $$;
revoke all on function public.draft_group_refund_with_evidence(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
rollback;
