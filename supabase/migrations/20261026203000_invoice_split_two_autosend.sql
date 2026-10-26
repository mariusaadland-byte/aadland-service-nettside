-- Two independent invoices from one unsent fixed-price draft. No existing invoice rows changed.
alter table public.invoice_drafts
 add column if not exists split_group_id uuid,
 add column if not exists split_part integer,
 add column if not exists payment_terms_override_days integer,
 add column if not exists planned_send_on date,
 add column if not exists automatic_send boolean not null default false,
 add column if not exists auto_send_state text;
alter table public.invoice_drafts
 add constraint invoice_split_part_valid check (split_part is null or split_part in (1,2)),
 add constraint invoice_split_group_consistent check ((split_group_id is null)=(split_part is null)),
 add constraint invoice_split_term_days_valid check (payment_terms_override_days is null or payment_terms_override_days between 0 and 365),
 add constraint invoice_auto_send_state_valid check (auto_send_state is null or auto_send_state in ('manual','scheduled','processing','sent','needs_review','cancelled')),
 add constraint invoice_auto_send_requires_plan check (not automatic_send or (planned_send_on is not null and split_part=2));
create unique index if not exists invoice_split_group_unique on public.invoice_drafts(split_group_id,split_part)
 where split_group_id is not null;

-- Only override the due date when a split-part draft actually becomes an issued
-- invoice. The authoritative issuance procedure still assigns invoice number/date.
create or replace function public.set_split_invoice_due_at_issue() returns trigger
 language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.status='draft' and new.status='issued' and old.payment_terms_override_days is not null then
  new.due_date:=new.issued_date+old.payment_terms_override_days;
  new.customer:=new.customer||jsonb_build_object('paymentTermsDays',old.payment_terms_override_days);
 end if;
 return new;
end $$;
revoke all on function public.set_split_invoice_due_at_issue() from public,anon,authenticated;
create trigger set_split_invoice_due_at_issue before update of status on public.invoice_drafts
 for each row execute function public.set_split_invoice_due_at_issue();

create or replace function public.split_invoice_draft_in_two(
 p_invoice_id uuid,p_first_percent integer,p_first_on date,p_second_on date,
 p_first_days integer,p_second_days integer,p_auto_second boolean
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare original public.invoice_drafts%rowtype; first_items jsonb:='[]'::jsonb;
 second_items jsonb:='[]'::jsonb; line jsonb; amount bigint; first_amount bigint;
 quantum integer; rate integer; first_total bigint:=0; second_total bigint:=0;
 source_total bigint:=0; i uuid:=gen_random_uuid(); date_today date:=(now() at time zone 'Europe/Oslo')::date;
 work_date date; percentage text; num_lines integer:=0;
begin
 select * into original from public.invoice_drafts where id=p_invoice_id for update;
 if not found then raise exception 'Fakturakladden ble ikke funnet.'; end if;
 if original.status<>'draft' or original.split_group_id is not null or
  original.installment_index<>0 or original.source_quote_id is not null then
  raise exception 'Bare en vanlig, usendt og udelt fakturakladd kan deles.'; end if;
 if original.pricing_model<>'fixed' then
  raise exception 'Kontroller et endelig fast beløp før du deler fakturaen.'; end if;
 if p_first_percent is null or p_first_percent not between 1 and 99 or
  p_first_days is null or p_second_days is null or
  p_first_days not between 0 and 365 or p_second_days not between 0 and 365 then
  raise exception 'Velg en fordeling mellom 1 og 99 prosent og gyldige betalingsfrister.'; end if;
 if p_first_on is null or p_second_on is null or p_first_on<date_today or
  p_second_on<=p_first_on then
  raise exception 'Velg to forskjellige sendingsdatoer, den andre etter den første.'; end if;
 if btrim(coalesce(original.customer->>'name',''))='' or btrim(coalesce(original.customer->>'address',''))='' or
  coalesce(original.customer->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Velg en kunde med fakturaadresse og e-post før du deler.'; end if;
 if original.customer->>'paymentMethod'='vipps' then
  raise exception 'Delingen er foreløpig bare tilgjengelig for vanlige bankfakturaer.'; end if;
 if coalesce(original.customer->>'workDate','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'Oppgi faktisk leveringsdato før du deler fakturaen.'; end if;
 work_date:=(original.customer->>'workDate')::date;
 -- Conservative safety boundary for already delivered work. Special construction
 -- schedules require separate assessment, not blind automatic billing.
 if work_date>p_first_on or p_second_on>(work_date+interval '1 month')::date then
  raise exception 'Datoene må gjelde utført arbeid og normalt ligge senest én måned etter levering. Ved andre betalingsplaner må faktureringen vurderes særskilt.'; end if;
 if not jsonb_typeof(original.line_items)='array' or
  jsonb_array_length(original.line_items)=0 then
  raise exception 'Kladden mangler fakturalinjer.'; end if;
 for line in select value from jsonb_array_elements(original.line_items) loop
  num_lines:=num_lines+1;
  rate:=(line->>'vatRate')::integer;
  if rate not in(0,12,15,25) or
    coalesce((line->>'quantity')::numeric,0)<0 or
    coalesce((line->>'unitPriceOre')::numeric,0)<0 or
    btrim(coalesce(line->>'description',''))='' then
   raise exception 'Kontroller fakturalinjer og MVA før deling.'; end if;
  amount:=round((line->>'quantity')::numeric*(line->>'unitPriceOre')::numeric);
  quantum:=case rate when 12 then 25 when 15 then 20 when 25 then 4 else 1 end;
  first_amount:=least(amount,greatest(0,round(amount::numeric*p_first_percent/100/quantum)*quantum));
  source_total:=source_total+amount+round(amount::numeric*rate/100);
  first_total:=first_total+first_amount+round(first_amount::numeric*rate/100);
  second_total:=second_total+(amount-first_amount)+round((amount-first_amount)::numeric*rate/100);
  first_items:=first_items||jsonb_build_array(jsonb_build_object(
   'description',left(line->>'description',440)||' – del 1 ('||p_first_percent||' %)',
   'type',coalesce(line->>'type','work'),'quantity',1,'unit','andel',
   'unitPriceOre',first_amount,'vatRate',rate));
  second_items:=second_items||jsonb_build_array(jsonb_build_object(
   'description',left(line->>'description',440)||' – del 2 ('||(100-p_first_percent)||' %)',
   'type',coalesce(line->>'type','work'),'quantity',1,'unit','andel',
   'unitPriceOre',amount-first_amount,'vatRate',rate));
 end loop;
 if num_lines>120 or first_total<=0 or second_total<=0 or first_total+second_total<>source_total then
  raise exception 'Beløpet er for lite til å deles i to positive fakturaer.'; end if;
 -- The second part is a separate UNISSUED draft. Invoice number assigned on send.
 insert into public.invoice_drafts(
  id,customer,title,pricing_model,line_items,notes,due_date,due_date_mode,
  installment_index,installment_label,installment_percent,installment_trigger,
  split_group_id,split_part,payment_terms_override_days,planned_send_on,
  automatic_send,auto_send_state
 ) values(
  i,original.customer||jsonb_build_object('paymentTermsDays',p_second_days),
  left(original.title||' – del 2 av 2',250),original.pricing_model,
  second_items,original.notes,p_second_on+p_second_days,'auto',
  2,'Del 2 av 2',100-p_first_percent,'Planlagt separat fakturering',
  p_invoice_id,2,p_second_days,p_second_on,coalesce(p_auto_second,false),
  case when coalesce(p_auto_second,false) then 'scheduled' else 'manual' end
 );
 update public.invoice_drafts set
  customer=original.customer||jsonb_build_object('paymentTermsDays',p_first_days),
  title=left(original.title||' – del 1 av 2',250),
  line_items=first_items,due_date=p_first_on+p_first_days,due_date_mode='auto',
  installment_index=1,installment_label='Del 1 av 2',
  installment_percent=p_first_percent,installment_trigger='Første del',
  split_group_id=p_invoice_id,split_part=1,
  payment_terms_override_days=p_first_days,planned_send_on=p_first_on,
  automatic_send=false,auto_send_state='manual',updated_at=now()
 where id=p_invoice_id;
 return jsonb_build_object('firstId',p_invoice_id,'secondId',i,
  'firstGrossOre',first_total,'secondGrossOre',second_total,
  'firstDate',p_first_on,'secondDate',p_second_on);
end $$;
revoke all on function public.split_invoice_draft_in_two(uuid,integer,date,date,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.split_invoice_draft_in_two(uuid,integer,date,date,integer,integer,boolean) to service_role;

create or replace function public.claim_scheduled_invoice_sends(p_today date,p_batch_size integer default 5)
returns table(invoice_id uuid) language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 return query
 with ready as (
  select id from public.invoice_drafts
  where automatic_send=true and auto_send_state='scheduled'
   and status='draft' and planned_send_on<=p_today
  order by planned_send_on,id
  for update skip locked limit least(greatest(p_batch_size,1),10)
 ), claimed as (
  update public.invoice_drafts i set auto_send_state='processing'
  from ready where i.id=ready.id
  returning i.id
 )
 select id from claimed;
end $$;
revoke all on function public.claim_scheduled_invoice_sends(date,integer) from public,anon,authenticated;
grant execute on function public.claim_scheduled_invoice_sends(date,integer) to service_role;
