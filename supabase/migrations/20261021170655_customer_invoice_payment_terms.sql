alter table public.admin_customer_contacts add column payment_terms_days integer not null default 14 check(payment_terms_days between 0 and 365);
alter table public.invoice_drafts add column due_date_mode text not null default 'auto' check(due_date_mode in ('auto','manual'));
create function public.invoice_customer_terms(p_customer jsonb) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce((select jsonb_build_object('contactId',id,'days',payment_terms_days) from public.admin_customer_contacts
 where id::text=p_customer->>'contactId' or (coalesce(p_customer->>'email','')<>'' and lower(email)=lower(p_customer->>'email'))
 order by (id::text=coalesce(p_customer->>'contactId','')) desc limit 1),jsonb_build_object('days',14))
$$;
revoke all on function public.invoice_customer_terms(jsonb) from public,anon,authenticated;
grant execute on function public.invoice_customer_terms(jsonb) to service_role;
create function public.update_invoice_customer_contact_terms(p_id uuid,p_expected_updated_at timestamptz,p_name text,p_email text,p_phone text,p_address text,p_payment_terms_days integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if p_payment_terms_days is null or p_payment_terms_days not between 0 and 365 then raise exception 'Betalingsfrist må være fra 0 til 365 dager.'; end if;
 result:=public.update_invoice_customer_contact(p_id,p_expected_updated_at,p_name,p_email,p_phone,p_address);
 update public.admin_customer_contacts set payment_terms_days=p_payment_terms_days where id=p_id returning to_jsonb(admin_customer_contacts.*) into result;
 update public.invoice_drafts set customer=customer||jsonb_build_object('paymentTermsDays',p_payment_terms_days),updated_at=now() where status='draft' and customer->>'contactId'=p_id::text;
 return result;
end $$;
revoke all on function public.update_invoice_customer_contact_terms(uuid,timestamptz,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.update_invoice_customer_contact_terms(uuid,timestamptz,text,text,text,text,integer) to service_role;
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
