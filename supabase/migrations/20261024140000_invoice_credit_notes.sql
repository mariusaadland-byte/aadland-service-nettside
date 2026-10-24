
-- Separate, immutable credit notes. All issued invoice fields and PDFs are preserved.
alter table public.invoice_drafts
 add column if not exists credited_ore bigint not null default 0 check (credited_ore >= 0);

create table if not exists public.invoice_credit_notes (
 id uuid primary key,
 invoice_id uuid not null references public.invoice_drafts(id),
 credit_number text not null unique,
 credit_date date not null,
 issued_at timestamptz not null default now(),
 reason text not null check (length(btrim(reason)) between 5 and 500),
 customer jsonb not null,
 original_invoice_number text not null,
 original_invoice_date date not null,
 work_date text,
 work_address text,
 lines jsonb not null,
 subtotal_ore bigint not null check (subtotal_ore > 0),
 vat_ore bigint not null check (vat_ore >= 0),
 total_ore bigint not null check (total_ore > 0),
 pdf_base64 text,
 created_by uuid
);
create index if not exists invoice_credit_notes_invoice_idx on public.invoice_credit_notes(invoice_id,issued_at);
alter table public.invoice_credit_notes enable row level security;
revoke all on public.invoice_credit_notes from public,anon,authenticated;
grant select,insert,update on public.invoice_credit_notes to service_role;

create or replace function public.protect_issued_credit_note()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $function$
begin
 if tg_op='DELETE' then raise exception 'Utstedte kreditnotaer kan ikke slettes.'; end if;
 if (new.id,new.invoice_id,new.credit_number,new.credit_date,new.issued_at,new.reason,new.customer,
     new.original_invoice_number,new.original_invoice_date,new.work_date,new.work_address,
     new.lines,new.subtotal_ore,new.vat_ore,new.total_ore,new.created_by)
 is distinct from
    (old.id,old.invoice_id,old.credit_number,old.credit_date,old.issued_at,old.reason,old.customer,
     old.original_invoice_number,old.original_invoice_date,old.work_date,old.work_address,
     old.lines,old.subtotal_ore,old.vat_ore,old.total_ore,old.created_by)
 then raise exception 'Kreditnotaen er utstedt og kan ikke endres.'; end if;
 if old.pdf_base64 is not null and new.pdf_base64 is distinct from old.pdf_base64
 then raise exception 'Kreditnota-PDF kan ikke endres.'; end if;
 return new;
end;
$function$;
revoke all on function public.protect_issued_credit_note() from public,anon,authenticated;
drop trigger if exists protect_issued_credit_note on public.invoice_credit_notes;
create trigger protect_issued_credit_note before update or delete
 on public.invoice_credit_notes for each row execute function public.protect_issued_credit_note();

create or replace function public.issue_invoice_credit_note(
 p_invoice_id uuid,p_request_id uuid,p_reason text,p_lines jsonb,
 p_expected_credited_ore bigint,p_admin_id uuid
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare
 i public.invoice_drafts%rowtype;
 existing public.invoice_credit_notes%rowtype;
 selected jsonb;
 source jsonb;
 output_lines jsonb='[]'::jsonb;
 idx integer;
 qty numeric;
 prev_qty numeric;
 prev_total bigint;
 net bigint;
 line_vat bigint;
 line_total bigint;
 subtotal bigint=0;
 vat bigint=0;
 total bigint;
 gross bigint;
 today date;
 serial bigint;
 series_key text;
 raw_idx text;
 raw_qty text;
 reason text;
begin
 if p_invoice_id is null or p_request_id is null or p_admin_id is null
 then raise exception 'Mangler nødvendig identifikasjon.'; end if;
 select * into existing from public.invoice_credit_notes where id=p_request_id;
 if found then
  if existing.invoice_id<>p_invoice_id then raise exception 'Forespørselen tilhører en annen faktura.'; end if;
  return to_jsonb(existing);
 end if;
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found or i.status='draft' or i.invoice_number is null then
  raise exception 'Kreditnota krever en utstedt faktura.'; end if;
 if i.credited_ore is distinct from p_expected_credited_ore then
  raise exception 'Fakturaen er endret. Oppdater siden og kontroller kreditnotaen på nytt.'; end if;
 if exists(select 1 from public.invoice_vipps_payments
   where invoice_id=i.id and state in ('pending','authorized')) then
  raise exception 'Det pågår en Vipps-betaling. Avslutt denne før du krediterer.'; end if;
 if not jsonb_typeof(p_lines)='array' or jsonb_array_length(p_lines)<1
   or jsonb_array_length(p_lines)>120 then raise exception 'Velg fakturalinjer som skal krediteres.'; end if;
 reason=btrim(coalesce(p_reason,''));
 if length(reason)<5 or length(reason)>500 then raise exception 'Oppgi en årsak til kreditnotaen (5–500 tegn).'; end if;
 for selected in select value from jsonb_array_elements(p_lines) as e(value) loop
  if jsonb_typeof(selected)<>'object' then raise exception 'Ugyldig fakturalinje.'; end if;
  raw_idx=selected->>'sourceIndex';
  raw_qty=selected->>'quantity';
  if raw_idx is null or raw_idx !~ '^[0-9]{1,3}$'
     or raw_qty is null or raw_qty !~ '^[0-9]+([.][0-9]{1,3})?$' then
   raise exception 'Oppgi gyldig linjenummer og antall (inntil tre desimaler).'; end if;
  idx=raw_idx::integer;
  qty=raw_qty::numeric;
  if idx<0 or idx>=jsonb_array_length(i.line_items) or qty<=0 or qty>100000 then
   raise exception 'Antall eller fakturalinje er ugyldig.'; end if;
  if exists(select 1 from jsonb_array_elements(output_lines) l where (l->>'sourceIndex')::int=idx)
   then raise exception 'Samme fakturalinje kan bare krediteres én gang per kreditnota.'; end if;
  source=i.line_items->idx;
  select coalesce(sum((l->>'quantity')::numeric),0),
         coalesce(sum((l->>'totalOre')::bigint),0)
   into prev_qty,prev_total
   from public.invoice_credit_notes c
   cross join lateral jsonb_array_elements(c.lines) l
   where c.invoice_id=i.id and (l->>'sourceIndex')::int=idx;
  if qty+prev_qty>(source->>'quantity')::numeric then
   raise exception 'Kreditert antall overstiger opprinnelig antall.'; end if;
  net=round(qty*(source->>'unitPriceOre')::numeric)::bigint;
  line_vat=round(net*(source->>'vatRate')::numeric/100)::bigint;
  line_total=net+line_vat;
  if net<=0 or line_total<=0 then raise exception 'Kreditert beløp må være større enn null.'; end if;
  if prev_total+line_total>
      (round((source->>'quantity')::numeric*(source->>'unitPriceOre')::numeric) +
       round(round((source->>'quantity')::numeric*(source->>'unitPriceOre')::numeric)*(source->>'vatRate')::numeric/100))::bigint
  then raise exception 'Kreditert beløp overstiger fakturalinjens opprinnelige beløp.'; end if;
  output_lines=output_lines||jsonb_build_array(jsonb_build_object(
   'sourceIndex',idx,'description',source->>'description','type',source->>'type',
   'unit',source->>'unit','quantity',qty,'unitPriceOre',(source->>'unitPriceOre')::bigint,
   'vatRate',(source->>'vatRate')::numeric,'netOre',net,'vatOre',line_vat,'totalOre',line_total));
  subtotal=subtotal+net;
  vat=vat+line_vat;
 end loop;
 total=subtotal+vat;
 select coalesce(sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)
     +round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100)),0)::bigint
  into gross from jsonb_array_elements(i.line_items) l;
 if total<=0 or total>gross-i.credited_ore-i.paid_ore then
  raise exception 'Kreditnotaen overstiger ubetalt beløp. Refunder eventuelle innbetalinger først.'; end if;
 today=(now() at time zone 'Europe/Oslo')::date;
 series_key='AS-KN-'||extract(year from today)::text;
 insert into public.invoice_number_counters(series,last_number) values(series_key,1)
 on conflict(series) do update set last_number=invoice_number_counters.last_number+1
 returning last_number into serial;
 insert into public.invoice_credit_notes(id,invoice_id,credit_number,credit_date,reason,customer,
 original_invoice_number,original_invoice_date,work_date,work_address,lines,subtotal_ore,vat_ore,total_ore,created_by)
 values(p_request_id,i.id,series_key||'-'||lpad(serial::text,6,'0'),today,reason,i.customer,
 i.invoice_number,i.issued_date,i.customer->>'workDate',i.customer->>'workAddress',
 output_lines,subtotal,vat,total,p_admin_id)
 returning * into existing;
 update public.invoice_drafts
  set credited_ore=credited_ore+total,payment_updated_at=now()
  where id=i.id;
 return to_jsonb(existing);
end;
$function$;
revoke all on function public.issue_invoice_credit_note(uuid,uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.issue_invoice_credit_note(uuid,uuid,text,jsonb,bigint,uuid) to service_role;

-- Update existing invoice ledgers so credit notes reduce only the remaining
-- liability. Never rewrite the original invoice items or original PDF.
do $adjust$
declare fname text;
 signature regprocedure;
 ddl text;
 revised text;
begin
 for fname in select unnest(array['record_invoice_payment','reverse_invoice_payment',
                                    'prepare_invoice_vipps_v2','sync_invoice_vipps']) loop
  select p.oid::regprocedure into signature
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=fname limit 1;
  if signature is null then raise exception 'Invoice payment RPC % was not found',fname; end if;
  select pg_get_functiondef(signature::oid) into ddl;
  revised=replace(ddl,'total-i.paid_ore','total-i.credited_ore-i.paid_ore');
  revised=replace(revised,'total-paid','total-i.credited_ore-paid');
  revised=replace(revised,'paid>=total','paid>=greatest(0,total-i.credited_ore)');
  if revised=ddl then raise exception 'No payable balance expression found in %',fname; end if;
  execute revised;
 end loop;
end $adjust$;
