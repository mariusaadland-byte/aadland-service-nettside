create table public.invoice_reminder_sends (
 id uuid primary key,
 invoice_id uuid not null references public.invoice_drafts(id) on delete restrict,
 reminder_day date not null default (now() at time zone 'Europe/Oslo')::date,
 recipient text not null,
 subject text not null check(length(subject) between 1 and 200),
 body text not null check(length(body) between 1 and 8000),
 outstanding_ore bigint not null check(outstanding_ore>0),
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 resend_id text,
 error_message text,
 sent_by uuid references public.admin_users(id),
 unique(invoice_id,reminder_day)
);
alter table public.invoice_reminder_sends enable row level security;
revoke all on public.invoice_reminder_sends from public,anon,authenticated;
grant select,insert on public.invoice_reminder_sends to service_role;
grant update(status,sent_at,resend_id,error_message) on public.invoice_reminder_sends to service_role;
create function public.prepare_invoice_reminder(
 p_invoice_id uuid,p_request_id uuid,p_subject text,p_body text,p_expected_outstanding bigint,p_admin_id uuid
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare inv public.invoice_drafts; existing public.invoice_reminder_sends; remaining bigint; today date := (now() at time zone 'Europe/Oslo')::date;
begin
 select * into inv from public.invoice_drafts where id=p_invoice_id for update;
 if not found or inv.status not in ('issued','sent') then raise exception 'Velg en utstedt faktura.'; end if;
 select * into existing from public.invoice_reminder_sends where id=p_request_id;
 if found then
  if existing.invoice_id<>p_invoice_id then raise exception 'Ugyldig sendeforsøk.'; end if;
  if existing.status='sent' then return to_jsonb(existing); end if;
 end if;
 select coalesce(sum(net+round(net*coalesce((line->>'vatRate')::numeric,0)/100)),0)::bigint into remaining
 from (select line,round(coalesce((line->>'quantity')::numeric,0)*coalesce((line->>'unitPriceOre')::numeric,0)) net from jsonb_array_elements(inv.line_items) line) t;
 remaining:=greatest(0,remaining-coalesce(inv.paid_ore,0));
 if remaining<=0 then raise exception 'Fakturaen er allerede betalt.'; end if;
 if remaining<>p_expected_outstanding then raise exception 'Restbeløpet er endret. Oppdater fakturaen før du sender.'; end if;
 if inv.due_date is null or inv.due_date>=today then raise exception 'Purring kan sendes etter forfallsdatoen.'; end if;
 if coalesce(inv.customer->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Kunden mangler en gyldig e-postadresse.'; end if;
 if coalesce(inv.pdf_base64,'')='' then raise exception 'Original faktura-PDF mangler. Åpne utskrift av fakturaen først.'; end if;
 select * into existing from public.invoice_reminder_sends
 where invoice_id=p_invoice_id and (reminder_day=today or status<>'sent')
 order by created_at asc limit 1 for update;
 if found then
  if existing.status='sent' then raise exception 'Det er allerede sendt en purring på denne fakturaen i dag.'; end if;
  if existing.created_at<now()-interval '23 hours' then raise exception 'Forrige sendeforsøk må kontrolleres i e-postloggen før ny purring.'; end if;
  if existing.outstanding_ore<>remaining then raise exception 'Restbeløpet er endret etter forrige sendeforsøk. Kontroller e-postloggen.'; end if;
  if existing.id<>p_request_id then raise exception 'Et tidligere sendeforsøk finnes. Oppdater siden og prøv det samme forsøket igjen.'; end if;
  if existing.subject<>p_subject or existing.body<>p_body then raise exception 'Bruk den lagrede teksten når du prøver samme utsending igjen.'; end if;
  return to_jsonb(existing);
 end if;
 insert into public.invoice_reminder_sends(id,invoice_id,recipient,subject,body,outstanding_ore,sent_by)
 values(p_request_id,p_invoice_id,inv.customer->>'email',p_subject,p_body,remaining,p_admin_id) returning * into existing;
 return to_jsonb(existing);
end $$;
revoke all on function public.prepare_invoice_reminder(uuid,uuid,text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.prepare_invoice_reminder(uuid,uuid,text,text,bigint,uuid) to service_role;