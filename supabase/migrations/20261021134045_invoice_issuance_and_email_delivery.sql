
alter table public.invoice_drafts drop constraint invoice_drafts_status_check;
alter table public.invoice_drafts add constraint invoice_drafts_status_check check(status in ('draft','issued','sent'));
alter table public.invoice_drafts
 add column invoice_number text unique,
 add column issued_date date,
 add column issued_at timestamptz,
 add column pdf_base64 text,
 add column first_send_at timestamptz,
 add column sent_at timestamptz,
 add column resend_id text,
 add column delivery_error text;
create table public.invoice_number_counters(series text primary key,last_number bigint not null check(last_number>0));
alter table public.invoice_number_counters enable row level security;
revoke all on public.invoice_number_counters from anon,authenticated;
grant select,insert,update on public.invoice_number_counters to service_role;

create function public.protect_issued_invoice() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.status<>'draft' then
  if tg_op='DELETE' then raise exception 'Utstedte fakturaer kan ikke slettes.'; end if;
  if new.status not in ('issued','sent') or (old.status='sent' and new.status<>'sent') then raise exception 'Utstedte fakturaer kan ikke settes tilbake til kladd.'; end if;
  if (new.invoice_number,new.issued_date,new.issued_at,new.source_quote_id,new.customer,new.title,new.pricing_model,new.line_items,new.due_date,new.notes,new.installment_index,new.installment_label,new.installment_percent,new.installment_trigger)
  is distinct from
  (old.invoice_number,old.issued_date,old.issued_at,old.source_quote_id,old.customer,old.title,old.pricing_model,old.line_items,old.due_date,old.notes,old.installment_index,old.installment_label,old.installment_percent,old.installment_trigger)
  then raise exception 'Fakturaen er utstedt og kan ikke endres. Feil må korrigeres med kreditnota.'; end if;
  if old.pdf_base64 is not null and new.pdf_base64 is distinct from old.pdf_base64 then raise exception 'Utstedt PDF kan ikke endres.'; end if;
  if old.first_send_at is not null and new.first_send_at is distinct from old.first_send_at then raise exception 'Sendeloggen kan ikke nullstilles.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function public.protect_issued_invoice() from public,anon,authenticated;
create trigger protect_issued_invoice before update or delete on public.invoice_drafts for each row execute function public.protect_issued_invoice();

create function public.issue_invoice_draft(p_id uuid,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.invoice_drafts%rowtype; today date; series_key text; seq bigint; amount numeric;
begin
 select * into i from public.invoice_drafts where id=p_id for update;
 if not found then raise exception 'Fakturaen ble ikke funnet.'; end if;
 if i.status<>'draft' then return to_jsonb(i); end if;
 if i.updated_at is distinct from p_expected_updated_at then raise exception 'Kladden ble endret. Last inn på nytt før sending.'; end if;
 today=(now() at time zone 'Europe/Oslo')::date;
 if btrim(coalesce(i.customer->>'name',''))='' or btrim(coalesce(i.customer->>'address',''))='' then raise exception 'Fyll inn kundenavn og kundens adresse før sending.'; end if;
 if coalesce(i.customer->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Fyll inn en gyldig e-postadresse.'; end if;
 if coalesce(i.customer->>'workDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Velg leveringsdato før sending.'; end if;
 perform (i.customer->>'workDate')::date;
 if i.due_date is null or i.due_date<today then raise exception 'Velg en gyldig forfallsdato før sending.'; end if;
 if jsonb_array_length(i.line_items)=0 or exists(
  select 1 from jsonb_array_elements(i.line_items) l where btrim(coalesce(l->>'description',''))='' or (l->>'quantity')::numeric<0 or (l->>'unitPriceOre')::numeric<0 or (l->>'vatRate')::numeric not in(0,12,15,25)
 ) then raise exception 'Kontroller fakturalinjene før sending.'; end if;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))
 into amount from jsonb_array_elements(i.line_items) l;
 if coalesce(amount,0)<=0 then raise exception 'Fakturaen må ha et beløp over null.'; end if;
 series_key='AS-WEB-'||extract(year from today)::text;
 insert into public.invoice_number_counters(series,last_number) values(series_key,1)
 on conflict(series) do update set last_number=invoice_number_counters.last_number+1 returning last_number into seq;
 update public.invoice_drafts set invoice_number=series_key||'-'||lpad(seq::text,6,'0'),issued_date=today,issued_at=now(),status='issued',updated_at=now() where id=p_id returning * into i;
 return to_jsonb(i);
end; $$;
revoke all on function public.issue_invoice_draft(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_invoice_draft(uuid,timestamptz) to service_role;
