-- Draft only: append-only classification metadata, original purchase never updated.
begin;
create table public.vat_purchase_cost_history(
 document_id uuid not null references public.vat_purchase_documents(id) on delete restrict,
 revision integer not null check(revision>0),
 previous_unit text check(previous_unit in ('service','rental','shared')),
 cost_unit text not null check(cost_unit in ('service','rental','shared')),
 reason text not null check(length(trim(reason)) between 3 and 300),
 actor_id uuid not null,
 request_id uuid not null unique,
 created_at timestamptz not null default clock_timestamp(),
 primary key(document_id,revision),
 check(previous_unit is distinct from cost_unit)
);
alter table public.vat_purchase_cost_history enable row level security;
revoke all on public.vat_purchase_cost_history from public,anon,authenticated,service_role;
create view public.vat_purchase_cost_effective with (security_invoker=true) as
 select p.id,p.document_date,p.supplier_name,p.supplier_document_number,p.kind,p.base_ore,p.vat_ore,p.deductible_vat_ore,p.voided_at,
 coalesce(h.cost_unit,p.cost_unit) cost_unit,coalesce(h.revision,0) cost_revision
 from public.vat_purchase_documents p left join lateral
 (select x.cost_unit,x.revision from public.vat_purchase_cost_history x where x.document_id=p.id order by x.revision desc limit 1) h on true;
revoke all on public.vat_purchase_cost_effective from public,anon,authenticated,service_role;
create function public.draft_purchase_cost_classify(p_id uuid,p_expected integer,p_unit text,p_reason text,p_actor uuid,p_request uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.vat_purchase_documents%rowtype; h public.vat_purchase_cost_history%rowtype; current_unit text; current_rev integer;
begin
 if p_id is null or p_expected is null or p_expected<0 or p_unit is null or p_unit not in ('service','rental','shared') or p_reason is null or length(trim(p_reason)) not between 3 and 300 or p_actor is null or p_request is null then return 'review';end if;
 select * into d from public.vat_purchase_documents where id=p_id for update;
 if not found or d.voided_at is not null then return 'review';end if;
 select * into h from public.vat_purchase_cost_history where request_id=p_request;
 if found then
  if h.document_id=p_id and h.revision=p_expected+1 and h.cost_unit=p_unit and h.reason=trim(p_reason) and h.actor_id=p_actor then return 'existing';end if;
  return 'review';end if;
 select * into h from public.vat_purchase_cost_history where document_id=p_id order by revision desc limit 1;
 if found then current_rev=h.revision;current_unit=h.cost_unit;else current_rev=0;current_unit=d.cost_unit;end if;
 if current_rev<>p_expected or current_unit is not distinct from p_unit then return 'review';end if;
 insert into public.vat_purchase_cost_history(document_id,revision,previous_unit,cost_unit,reason,actor_id,request_id) values(p_id,current_rev+1,current_unit,p_unit,trim(p_reason),p_actor,p_request);
 return 'recorded';
end $$;
revoke all on function public.draft_purchase_cost_classify(uuid,integer,text,text,uuid,uuid) from public,anon,authenticated,service_role;
rollback;
