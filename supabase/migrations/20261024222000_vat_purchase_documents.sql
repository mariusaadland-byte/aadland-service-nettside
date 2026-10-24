-- Owner-confirmed manual references to actual supplier invoices, NOT a duplicate
-- accounting system. External original invoices remain in the accounting archive.
create table if not exists public.vat_purchase_documents(
 id uuid primary key default gen_random_uuid(),
 supplier_name text not null check(length(btrim(supplier_name)) between 2 and 160),
 supplier_document_number text not null check(length(btrim(supplier_document_number)) between 1 and 90),
 document_date date not null,
 kind text not null check(kind in ('purchase','credit')),
 original_document_number text,
 evidence_reference text not null check(length(btrim(evidence_reference)) between 3 and 260),
 business_purpose text not null check(length(btrim(business_purpose)) between 5 and 500),
 vat_groups jsonb not null,
 deduction_percent integer not null check(deduction_percent between 0 and 100),
 base_ore bigint not null check(base_ore>0),
 vat_ore bigint not null check(vat_ore>=0),
 deductible_vat_ore bigint not null check(deductible_vat_ore>=0),
 confirmed_by uuid not null,
 confirmed_at timestamptz not null default now(),
 voided_at timestamptz,
 void_reason text,
 voided_by uuid,
 created_at timestamptz not null default now()
);
create unique index if not exists vat_purchase_document_active_unique
 on public.vat_purchase_documents(lower(btrim(supplier_name)),lower(btrim(supplier_document_number)),kind)
 where voided_at is null;
create index if not exists vat_purchase_document_date_idx
 on public.vat_purchase_documents(document_date,created_at desc);
alter table public.vat_purchase_documents enable row level security;
revoke all on public.vat_purchase_documents from public,anon,authenticated;
grant select,insert,update on public.vat_purchase_documents to service_role;
create or replace function public.protect_vat_purchase_document()
returns trigger language plpgsql set search_path=pg_catalog,public as $body$
declare
 k text;
 line jsonb;
 group_base bigint:=0;
 group_vat bigint:=0;
 rate integer;
 net bigint;
 vat bigint;
 eligible bigint;
begin
 if tg_op='UPDATE' then
  if old.voided_at is not null or new.voided_at is null or
   new.id is distinct from old.id or
   new.supplier_name is distinct from old.supplier_name or
   new.supplier_document_number is distinct from old.supplier_document_number or
   new.document_date is distinct from old.document_date or
   new.kind is distinct from old.kind or
   new.original_document_number is distinct from old.original_document_number or
   new.evidence_reference is distinct from old.evidence_reference or
   new.business_purpose is distinct from old.business_purpose or
   new.vat_groups is distinct from old.vat_groups or
   new.deduction_percent is distinct from old.deduction_percent or
   new.base_ore is distinct from old.base_ore or
   new.vat_ore is distinct from old.vat_ore or
   new.deductible_vat_ore is distinct from old.deductible_vat_ore or
   new.confirmed_by is distinct from old.confirmed_by or
   new.confirmed_at is distinct from old.confirmed_at or
   new.created_at is distinct from old.created_at then
    raise exception 'Et godkjent leverandørbilag kan ikke endres. Opphev det med begrunnelse og registrer nytt.';
  end if;
  if length(btrim(coalesce(new.void_reason,'')))<8 or new.voided_by is null then
   raise exception 'Oppheving krever begrunnelse (minst 8 tegn) og ansvarlig eier.';
  end if;
  return new;
 end if;
 if jsonb_typeof(new.vat_groups)<>'object' then raise exception 'MVA-satsene mangler.'; end if;
 for k,line in select key,value from jsonb_each(new.vat_groups) loop
  if k not in ('0','12','15','25') then raise exception 'Ugyldig MVA-sats.'; end if;
  if jsonb_typeof(line)<>'object' or (line->>'baseOre') is null or (line->>'vatOre') is null
   then raise exception 'MVA-linjen mangler grunnlag eller avgift.';end if;
  begin
   rate=k::integer;
   net=(line->>'baseOre')::bigint;
   vat=(line->>'vatOre')::bigint;
  exception when others then raise exception 'Ugyldig MVA-beløp på bilag.';end;
  if net<0 or vat<0 or (net=0 and vat<>0)
     or abs(vat-round(net::numeric*rate/100))>5 then
   raise exception 'MVA-linjen stemmer ikke med satsen og dokumentbeløpet.';
  end if;
  group_base=group_base+net;
  group_vat=group_vat+vat;
 end loop;
 eligible=round(group_vat::numeric*new.deduction_percent/100)::bigint;
 if group_base<>new.base_ore or group_vat<>new.vat_ore or eligible<>new.deductible_vat_ore then
  raise exception 'Bilagets summer og fradragsbeløp stemmer ikke.';
 end if;
 if new.kind='credit' and length(btrim(coalesce(new.original_document_number,'')))<1 then
  raise exception 'Kreditnota fra leverandør må vise hvilket kjøpsbilag den gjelder.';
 end if;
 return new;
end;$body$;
revoke all on function public.protect_vat_purchase_document() from public,anon,authenticated;
drop trigger if exists protect_vat_purchase_document on public.vat_purchase_documents;
create trigger protect_vat_purchase_document before insert or update on public.vat_purchase_documents
for each row execute function public.protect_vat_purchase_document();
