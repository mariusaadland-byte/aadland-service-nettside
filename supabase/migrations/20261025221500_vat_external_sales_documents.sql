-- Historical customer invoices from other systems. Standalone archive and VAT preview only:
-- not a bill to send, not a payment claim, never silently synced to an accounting ledger.
create table if not exists public.vat_external_sales_documents(
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check(length(btrim(customer_name)) between 2 and 160),
 source_system text not null check(length(btrim(source_system)) between 2 and 100),
 document_number text not null check(length(btrim(document_number)) between 1 and 90),
 document_date date not null,
 kind text not null check(kind in ('invoice','credit')),
 original_document_number text,
 vat_groups jsonb not null,
 base_ore bigint not null check(base_ore>0),
 vat_ore bigint not null check(vat_ore>=0),
 confirmed_by uuid not null,
 confirmed_at timestamptz not null default now(),
 voided_at timestamptz,
 void_reason text,
 voided_by uuid,
 created_at timestamptz not null default now()
);
create unique index if not exists vat_external_sales_unique_active
 on public.vat_external_sales_documents(lower(btrim(source_system)),lower(btrim(document_number)),kind)
 where voided_at is null;
create index if not exists vat_external_sales_date_idx
 on public.vat_external_sales_documents(document_date,created_at desc);
alter table public.vat_external_sales_documents enable row level security;
revoke all on table public.vat_external_sales_documents from public,anon,authenticated;
grant select,insert,update on table public.vat_external_sales_documents to service_role;

create or replace function public.protect_vat_external_sale()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare key text; line jsonb; net bigint;tax bigint;rate integer;
 base_total bigint:=0;vat_total bigint:=0;
begin
 if tg_op='UPDATE' then
  if old.voided_at is not null or new.voided_at is null or
   new.id is distinct from old.id or
   new.customer_name is distinct from old.customer_name or
   new.source_system is distinct from old.source_system or
   new.document_number is distinct from old.document_number or
   new.document_date is distinct from old.document_date or
   new.kind is distinct from old.kind or
   new.original_document_number is distinct from old.original_document_number or
   new.vat_groups is distinct from old.vat_groups or
   new.base_ore is distinct from old.base_ore or
   new.vat_ore is distinct from old.vat_ore or
   new.confirmed_by is distinct from old.confirmed_by or
   new.confirmed_at is distinct from old.confirmed_at or
   new.created_at is distinct from old.created_at then
   raise exception 'En importert faktura kan ikke endres. Opphev med begrunnelse og registrer nytt.';
  end if;
  if length(btrim(coalesce(new.void_reason,'')))<8 or new.voided_by is null then
   raise exception 'Oppheving krever begrunnelse og ansvarlig eier.';
  end if;
  return new;
 end if;
 if jsonb_typeof(new.vat_groups)<>'object' then raise exception 'MVA-linjer mangler.';end if;
 for key,line in select key,value from jsonb_each(new.vat_groups) loop
  if key not in ('0','12','15','25') then raise exception 'Ugyldig MVA-sats.';end if;
  if jsonb_typeof(line)<>'object' then raise exception 'MVA-linjen er ugyldig.';end if;
  begin
   rate=key::integer;net=(line->>'baseOre')::bigint;tax=(line->>'vatOre')::bigint;
  exception when others then raise exception 'MVA-beløpet er ugyldig.';end;
  if net<=0 or tax<0 or abs(tax-round(net::numeric*rate/100))>5 then
   raise exception 'MVA-linjene stemmer ikke.';end if;
  base_total=base_total+net;vat_total=vat_total+tax;
 end loop;
 if base_total<>new.base_ore or vat_total<>new.vat_ore then
  raise exception 'Fakturasummen stemmer ikke med MVA-linjene.';end if;
 if new.kind='credit' and length(btrim(coalesce(new.original_document_number,'')))<1 then
  raise exception 'Kreditnotaen må vise opprinnelig fakturanummer.';end if;
 return new;
end $$;
revoke all on function public.protect_vat_external_sale() from public,anon,authenticated;
drop trigger if exists protect_vat_external_sale on public.vat_external_sales_documents;
create trigger protect_vat_external_sale before insert or update on public.vat_external_sales_documents
 for each row execute function public.protect_vat_external_sale();

create table if not exists public.vat_external_sales_files(
 id uuid primary key default gen_random_uuid(),
 external_document_id uuid not null unique references public.vat_external_sales_documents(id),
 storage_path text not null unique check(storage_path like 'vat-external-sales/%'),
 original_filename text not null check(length(original_filename) between 1 and 160),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 4194304),
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 uploaded_by uuid not null,
 uploaded_at timestamptz not null default now()
);
alter table public.vat_external_sales_files enable row level security;
revoke all on table public.vat_external_sales_files from public,anon,authenticated;
grant select,insert on table public.vat_external_sales_files to service_role;
-- Append-only by DB rule. Never alter or remove original invoice files.
create or replace function public.protect_vat_external_sales_file()
returns trigger language plpgsql as $$
begin
 raise exception 'En lagret ekstern faktura kan ikke endres eller slettes.';
end $$;
revoke all on function public.protect_vat_external_sales_file() from public,anon,authenticated;
drop trigger if exists protect_vat_external_sales_file on public.vat_external_sales_files;
create trigger protect_vat_external_sales_file before update or delete
 on public.vat_external_sales_files for each row execute function public.protect_vat_external_sales_file();
