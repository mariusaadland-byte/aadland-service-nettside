-- A combined statement is a dated snapshot, not a new invoice or new payment.
create table if not exists public.invoice_payment_statements (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.invoice_drafts(id),
 fingerprint text not null,
 snapshot jsonb not null,
 pdf_base64 text,
 created_at timestamptz not null default now(),
 first_send_at timestamptz,
 sent_at timestamptz,
 resend_id text,
 delivery_error text,
 unique(invoice_id,fingerprint)
);
create index if not exists invoice_payment_statements_invoice_idx
 on public.invoice_payment_statements(invoice_id,created_at desc);
alter table public.invoice_payment_statements enable row level security;
revoke all on public.invoice_payment_statements from public,anon,authenticated;
grant select,insert,update on public.invoice_payment_statements to service_role;

create or replace function public.protect_invoice_payment_statement()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' then raise exception 'Betalingsoversikt kan ikke slettes.'; end if;
 if (new.id,new.invoice_id,new.fingerprint,new.snapshot,new.created_at)
  is distinct from (old.id,old.invoice_id,old.fingerprint,old.snapshot,old.created_at)
 then raise exception 'Utstedt betalingsoversikt kan ikke endres.'; end if;
 if old.pdf_base64 is not null and new.pdf_base64 is distinct from old.pdf_base64
 then raise exception 'Lagret betalingsoversikt-PDF kan ikke endres.'; end if;
 if old.sent_at is not null and new.sent_at is distinct from old.sent_at
 then raise exception 'Registrert utsending kan ikke endres.'; end if;
 return new;
end $$;
revoke all on function public.protect_invoice_payment_statement() from public,anon,authenticated;
drop trigger if exists protect_invoice_payment_statement on public.invoice_payment_statements;
create trigger protect_invoice_payment_statement
 before update or delete on public.invoice_payment_statements
 for each row execute function public.protect_invoice_payment_statement();

create or replace function public.preview_invoice_payment_statement(p_invoice_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 i public.invoice_drafts%rowtype;
 gross bigint;
 payment_total bigint;
 credit_total bigint;
 vipps_net bigint;
 payments jsonb;
 credits jsonb;
 refunds jsonb;
 active_count integer;
 p_count integer;
 c_count integer;
 v_count integer;
begin
 select * into i from public.invoice_drafts where id=p_invoice_id;
 if not found or i.status='draft' or i.invoice_number is null
 then raise exception 'Velg en utstedt faktura.'; end if;
 select coalesce(sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)
  +round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100)),0)::bigint
 into gross from jsonb_array_elements(i.line_items) l;

 select count(*),coalesce(sum(p.amount_ore),0)::bigint,
  coalesce(jsonb_agg(jsonb_build_object('id',p.id,'paidOn',p.paid_on,
   'recordedAt',p.recorded_at,'amountOre',p.amount_ore,
   'method',case when p.vipps_reference is null then 'manual' else 'vipps' end,
   'note',case when p.vipps_reference is null then left(coalesce(p.note,''),180) else '' end)
   order by p.paid_on,p.recorded_at,p.id),'[]'::jsonb)
 into p_count,payment_total,payments
 from public.invoice_payments p where p.invoice_id=p_invoice_id and p.reversed_at is null;

 select count(*),coalesce(sum(c.total_ore),0)::bigint,
  coalesce(jsonb_agg(jsonb_build_object('number',c.credit_number,
   'date',c.credit_date,'amountOre',c.total_ore)
   order by c.credit_date,c.credit_number),'[]'::jsonb)
 into c_count,credit_total,credits
 from public.invoice_credit_notes c where c.invoice_id=p_invoice_id;

 select count(*),coalesce(sum(p.captured_ore-p.refunded_ore),0)::bigint,
  coalesce(sum(case when p.state in ('pending','authorized') then 1 else 0 end),0)::integer,
  coalesce(jsonb_agg(jsonb_build_object('reference',p.reference,
   'capturedOre',p.captured_ore,'refundedOre',p.refunded_ore)
   order by p.created_at,p.id) filter (where p.refunded_ore>0),'[]'::jsonb)
 into v_count,vipps_net,active_count,refunds
 from public.invoice_vipps_payments p where p.invoice_id=p_invoice_id;

 if p_count>500 or c_count>500 or v_count>500 then
  raise exception 'For mange transaksjoner. Ta kontakt med administrator.'; end if;
 if payment_total<>i.paid_ore or credit_total<>i.credited_ore
  or gross<credit_total+payment_total
  or vipps_net<>(select coalesce(sum(amount_ore),0)::bigint from public.invoice_payments
    where invoice_id=p_invoice_id and reversed_at is null and vipps_reference is not null)
 then raise exception 'Betalingshistorikken stemmer ikke med fakturaen. Kontroller før utsending.'; end if;
 if p_count=0 and c_count=0 then raise exception 'Ingen registrerte innbetalinger eller kreditnotaer å vise.'; end if;
 return jsonb_build_object(
  'invoiceId',i.id,'invoiceNumber',i.invoice_number,'invoiceDate',i.issued_date,
  'dueDate',i.due_date,'customer',i.customer,'title',i.title,
  'asOfDate',(now() at time zone 'Europe/Oslo')::date,
  'grossOre',gross,'creditedOre',credit_total,'paidOre',payment_total,
  'outstandingOre',gross-credit_total-payment_total,
  'payments',payments,'credits',credits,'refunds',refunds,
  'activeVipps',active_count
 );
end $$;
revoke all on function public.preview_invoice_payment_statement(uuid) from public,anon,authenticated;
grant execute on function public.preview_invoice_payment_statement(uuid) to service_role;

create or replace function public.issue_invoice_payment_statement(
 p_invoice_id uuid,p_expected_paid_ore bigint,p_expected_credited_ore bigint,p_expected_outstanding_ore bigint
) returns public.invoice_payment_statements language plpgsql
security invoker set search_path=pg_catalog,public as $$
declare
 i public.invoice_drafts%rowtype;
 data jsonb;
 key text;
 result public.invoice_payment_statements%rowtype;
begin
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found then raise exception 'Fakturaen finnes ikke.'; end if;
 data=public.preview_invoice_payment_statement(p_invoice_id);
 if (data->>'paidOre')::bigint is distinct from p_expected_paid_ore
   or (data->>'creditedOre')::bigint is distinct from p_expected_credited_ore
   or (data->>'outstandingOre')::bigint is distinct from p_expected_outstanding_ore then
  raise exception 'Betalingsbeløpene har endret seg. Oppdater fakturaen før du sender.'; end if;
 if (data->>'activeVipps')::integer>0 then
  raise exception 'En Vipps-betaling er fortsatt åpen. Oppdater Vipps-status først.'; end if;
 key=md5((data-'asOfDate')::text);
 insert into public.invoice_payment_statements(invoice_id,fingerprint,snapshot)
 values(p_invoice_id,key,data)
 on conflict(invoice_id,fingerprint) do nothing;
 select * into result from public.invoice_payment_statements
 where invoice_id=p_invoice_id and fingerprint=key;
 if not found then raise exception 'Oversikten kunne ikke lagres.'; end if;
 return result;
end $$;
revoke all on function public.issue_invoice_payment_statement(uuid,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.issue_invoice_payment_statement(uuid,bigint,bigint,bigint) to service_role;
