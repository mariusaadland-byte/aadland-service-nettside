create table public.invoice_vipps_payments (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoice_drafts(id),
 reference text not null unique default ('INV-'||gen_random_uuid()::text), amount_ore bigint not null check(amount_ore>=100),
 state text not null default 'pending' check(state in ('pending','authorized','paid','partial','cancelled','refunded')),
 captured_ore bigint not null default 0, refunded_ore bigint not null default 0,
 ledger_payment_id uuid references public.invoice_payments(id), redirect_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), captured_at timestamptz,
 request_email_first_at timestamptz, request_email_sent_at timestamptz,
 receipt_payload jsonb, receipt_first_at timestamptz, receipt_sent_at timestamptz, receipt_error text,
 check(captured_ore between 0 and amount_ore), check(refunded_ore between 0 and captured_ore)
);
create unique index invoice_vipps_one_active on public.invoice_vipps_payments(invoice_id) where state in ('pending','authorized');
create index invoice_vipps_invoice on public.invoice_vipps_payments(invoice_id,created_at desc);
alter table public.invoice_vipps_payments enable row level security;
revoke all on public.invoice_vipps_payments from anon,authenticated;
grant select,insert,update on public.invoice_vipps_payments to service_role;
alter table public.invoice_payments add column vipps_reference text references public.invoice_vipps_payments(reference);

create function public.prepare_invoice_vipps(p_invoice_id uuid) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare i public.invoice_drafts%rowtype; p public.invoice_vipps_payments%rowtype; total bigint;
begin
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found or i.status='draft' then raise exception 'Utsted fakturaen først.'; end if;
 select * into p from public.invoice_vipps_payments where invoice_id=i.id and state in ('pending','authorized') limit 1;
 if found then return to_jsonb(p); end if;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
 if total-i.paid_ore<100 then raise exception 'Fakturaen er betalt eller restbeløpet er under 1 krone.'; end if;
 insert into public.invoice_vipps_payments(invoice_id,amount_ore) values(i.id,total-i.paid_ore) returning * into p;
 return to_jsonb(p);
end $$;

create function public.sync_invoice_vipps(p_reference text,p_state text,p_captured bigint,p_refunded bigint) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare i public.invoice_drafts%rowtype; p public.invoice_vipps_payments%rowtype; net bigint; previous_net bigint; paid bigint; total bigint; last_date date; ledger_id uuid; today date;
begin
 select * into p from public.invoice_vipps_payments where reference=p_reference;
 if not found then raise exception 'Betalingen ble ikke funnet.'; end if;
 select * into i from public.invoice_drafts where id=p.invoice_id for update;
 select * into p from public.invoice_vipps_payments where reference=p_reference for update;
 if p_captured<0 or p_captured>p.amount_ore or p_refunded<0 or p_refunded>p_captured then raise exception 'Ugyldig Vipps-beløp.'; end if;
 p_captured=greatest(p_captured,p.captured_ore); p_refunded=greatest(p_refunded,p.refunded_ore);
 net=p_captured-p_refunded; previous_net=p.captured_ore-p.refunded_ore;
 today=(now() at time zone 'Europe/Oslo')::date;
 ledger_id=p.ledger_payment_id;
 if net<>previous_net then
  if ledger_id is not null then update public.invoice_payments set reversed_at=now() where id=ledger_id and reversed_at is null; end if;
  ledger_id=null;
  if net>0 then
   insert into public.invoice_payments(invoice_id,amount_ore,paid_on,note,vipps_reference)
   values(i.id,net,coalesce((p.captured_at at time zone 'Europe/Oslo')::date,today),'Bekreftet Vipps-betaling: '||p.reference,p.reference) returning id into ledger_id;
  end if;
  select coalesce(sum(amount_ore),0),max(paid_on) into paid,last_date from public.invoice_payments where invoice_id=i.id and reversed_at is null;
  select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
  update public.invoice_drafts set paid_ore=paid,paid_date=case when paid>=total then last_date else null end,payment_updated_at=now() where id=i.id;
 end if;
 update public.invoice_vipps_payments set captured_ore=p_captured,refunded_ore=p_refunded,ledger_payment_id=ledger_id,
 captured_at=case when p_captured>0 then coalesce(captured_at,now()) else captured_at end,
 state=case when p_captured>0 and net=0 then 'refunded' when net=amount_ore then 'paid' when net>0 then 'partial' when upper(p_state) in ('ABORTED','EXPIRED','TERMINATED') then 'cancelled' when upper(p_state)='AUTHORIZED' then 'authorized' when state='cancelled' then 'cancelled' else 'pending' end,
 updated_at=now() where id=p.id returning * into p;
 return to_jsonb(p);
end $$;
revoke all on function public.prepare_invoice_vipps(uuid),public.sync_invoice_vipps(text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.prepare_invoice_vipps(uuid),public.sync_invoice_vipps(text,text,bigint,bigint) to service_role;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id uuid, p_amount_ore bigint, p_paid_on date, p_request_id uuid, p_admin_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare i public.invoice_drafts%rowtype; existing public.invoice_payments%rowtype; amount bigint; total bigint; paid bigint; last_date date;
begin
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found or i.status='draft' then raise exception 'Velg en utstedt faktura.'; end if;
 select * into existing from public.invoice_payments where id=p_request_id;
 if found then
  if existing.invoice_id<>p_invoice_id or existing.paid_on<>p_paid_on or (p_amount_ore is not null and existing.amount_ore<>p_amount_ore) then raise exception 'Betalingsforespørselen er allerede brukt.'; end if;
  return jsonb_build_object('id',existing.id,'alreadyRecorded',true);
 end if;
 if exists(select 1 from public.invoice_vipps_payments where invoice_id=p_invoice_id and state in ('pending','authorized')) then raise exception 'Et Vipps-forsøk pågår. Kontroller eller avbryt betalingen hos Vipps før manuell registrering.'; end if;
 if p_paid_on is null or p_paid_on>(now() at time zone 'Europe/Oslo')::date or p_paid_on<i.issued_date then raise exception 'Velg en betalingsdato mellom fakturadato og i dag.'; end if;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
 amount=coalesce(p_amount_ore,total-i.paid_ore);
 if amount<=0 then raise exception 'Fakturaen er allerede betalt, eller beløpet er ugyldig.'; end if;
 if amount>total-i.paid_ore then raise exception 'Beløpet er større enn gjenstående beløp.'; end if;
 insert into public.invoice_payments(id,invoice_id,amount_ore,paid_on,note,recorded_by) values(p_request_id,p_invoice_id,amount,p_paid_on,left(coalesce(p_note,''),500),p_admin_id);
 select coalesce(sum(amount_ore),0),max(paid_on) into paid,last_date from public.invoice_payments where invoice_id=p_invoice_id and reversed_at is null;
 update public.invoice_drafts set paid_ore=paid,paid_date=case when paid>=total then last_date else null end,payment_updated_at=now() where id=p_invoice_id;
 return jsonb_build_object('id',p_request_id,'paidOre',paid,'outstandingOre',total-paid);
end; $function$
;

CREATE OR REPLACE FUNCTION public.reverse_invoice_payment(p_payment_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare p public.invoice_payments%rowtype; i public.invoice_drafts%rowtype; total bigint; paid bigint; last_date date;
begin
 select * into p from public.invoice_payments where id=p_payment_id;
 if not found then raise exception 'Betalingen ble ikke funnet.'; end if;
 if p.vipps_reference is not null then raise exception 'Vipps-betaling følger bekreftet status hos Vipps og kan ikke angres manuelt.'; end if;
 select * into i from public.invoice_drafts where id=p.invoice_id for update;
 update public.invoice_payments set reversed_at=now(),reversed_by=p_admin_id where id=p_payment_id and reversed_at is null;
 select coalesce(sum(amount_ore),0),max(paid_on) into paid,last_date from public.invoice_payments where invoice_id=p.invoice_id and reversed_at is null;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
 update public.invoice_drafts set paid_ore=paid,paid_date=case when paid>=total then last_date else null end,payment_updated_at=now() where id=p.invoice_id;
 return jsonb_build_object('paidOre',paid,'outstandingOre',total-paid);
end; $function$
;
