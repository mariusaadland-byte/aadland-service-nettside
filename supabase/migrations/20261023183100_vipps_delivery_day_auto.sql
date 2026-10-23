-- Auto-date only Vipps invoices, using the actual Oslo invoice issue date.
-- No existing issued invoices are changed. All other safeguards are preserved.
CREATE OR REPLACE FUNCTION public.issue_invoice_draft(p_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare i public.invoice_drafts%rowtype; today date; series_key text; seq bigint; amount numeric; terms jsonb;
begin
 select * into i from public.invoice_drafts where id=p_id for update;
 if not found then raise exception 'Fakturaen ble ikke funnet.'; end if;
 if i.status<>'draft' then return to_jsonb(i); end if;
 if i.updated_at is distinct from p_expected_updated_at then raise exception 'Kladden ble endret. Last inn på nytt før utstedelse.'; end if;
 today=(now() at time zone 'Europe/Oslo')::date;
 -- Vipps transactions completed immediately are delivered on the issue day.
 -- Ordinary bank invoices keep their actual, user-entered delivery date.
 if i.customer->>'paymentMethod'='vipps' then
  i.customer:=i.customer||jsonb_build_object('workDate',today::text);
 end if;
 if btrim(coalesce(i.customer->>'name',''))='' or btrim(coalesce(i.customer->>'address',''))='' then raise exception 'Fyll inn kundenavn og kundens adresse før utstedelse.'; end if;
 if coalesce(i.customer->>'workDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Velg leveringsdato før utstedelse.'; end if;
 perform (i.customer->>'workDate')::date;
 terms:=public.invoice_customer_terms(i.customer);
 if i.due_date_mode='auto' then
  i.due_date:=today+(terms->>'days')::integer;
 end if;
 i.customer:=i.customer||jsonb_build_object('paymentTermsDays',(terms->>'days')::integer);
 if terms->>'contactId' is not null then i.customer:=i.customer||jsonb_build_object('contactId',terms->>'contactId'); end if;
 if i.due_date is null or i.due_date<today then raise exception 'Velg en gyldig forfallsdato før utstedelse.'; end if;
 if jsonb_array_length(i.line_items)=0 or exists(
  select 1 from jsonb_array_elements(i.line_items) l where btrim(coalesce(l->>'description',''))='' or (l->>'quantity')::numeric<0 or (l->>'unitPriceOre')::numeric<0 or (l->>'vatRate')::numeric not in(0,12,15,25)
 ) then raise exception 'Kontroller fakturalinjene før utstedelse.'; end if;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))
 into amount from jsonb_array_elements(i.line_items) l;
 if coalesce(amount,0)<=0 then raise exception 'Fakturaen må ha et beløp over null.'; end if;
 series_key='AS-WEB-'||extract(year from today)::text;
 insert into public.invoice_number_counters(series,last_number) values(series_key,1)
 on conflict(series) do update set last_number=invoice_number_counters.last_number+1 returning last_number into seq;
 update public.invoice_drafts set due_date=i.due_date,customer=i.customer,invoice_number=series_key||'-'||lpad(seq::text,6,'0'),issued_date=today,issued_at=now(),status='issued',updated_at=now() where id=p_id returning * into i;
 return to_jsonb(i);
end; $function$
