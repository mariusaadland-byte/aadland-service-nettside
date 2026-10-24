-- Freeze a manual payment receipt snapshot without modifying the issued invoice.
alter table public.invoice_payments
 add column if not exists receipt_payload jsonb,
 add column if not exists receipt_pdf_base64 text,
 add column if not exists receipt_first_send_at timestamptz,
 add column if not exists receipt_sent_at timestamptz,
 add column if not exists receipt_resend_id text,
 add column if not exists receipt_delivery_error text;

create or replace function public.freeze_invoice_manual_receipt_snapshot(p_payment_id uuid,p_invoice_id uuid)
returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $function$
declare p public.invoice_payments%rowtype;
 i public.invoice_drafts%rowtype;
 original_total bigint;
 effective_total bigint;
 snapshot jsonb;
begin
 if p_payment_id is null or p_invoice_id is null then
  raise exception 'Mangler faktura eller betalingsregistrering.';
 end if;
 -- Lock the parent first, as the payment/reversal RPCs do.
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found or i.status='draft' or i.invoice_number is null then
  raise exception 'Kvittering krever en utstedt faktura.';
 end if;
 select * into p from public.invoice_payments where id=p_payment_id
  and invoice_id=p_invoice_id for update;
 if not found then raise exception 'Betalingen tilhører ikke denne fakturaen.'; end if;
 if p.vipps_reference is not null then raise exception 'Vipps-kvitteringer sendes gjennom Vipps-flyten.'; end if;
 if p.reversed_at is not null then raise exception 'En angret innbetaling kan ikke få ny kvittering.'; end if;
 if p.receipt_payload is not null then return p.receipt_payload; end if;
 select coalesce(sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)
  +round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100)),0)::bigint
  into original_total from jsonb_array_elements(i.line_items) l;
 effective_total=greatest(0,original_total-i.credited_ore);
 if p.amount_ore<=0 or p.amount_ore>i.paid_ore then
  raise exception 'Betalingsregistreringen har ikke en gyldig saldo.';
 end if;
 snapshot=jsonb_build_object(
  'invoiceNumber',i.invoice_number,'invoiceDate',i.issued_date,
  'dueDate',i.due_date,'title',i.title,'customer',i.customer,
  'lineItems',i.line_items,'invoiceNotes',i.notes,
  'paymentId',p.id,'paymentAmountOre',p.amount_ore,'paidOn',p.paid_on,
  'paymentNote',p.note,'receiptCreatedOn',(now() at time zone 'Europe/Oslo')::date,
  'otherPaymentsOre',greatest(0,i.paid_ore-p.amount_ore),
  'outstandingOre',greatest(0,effective_total-i.paid_ore)
 );
 update public.invoice_payments set receipt_payload=snapshot where id=p.id;
 return snapshot;
end;
$function$;
revoke all on function public.freeze_invoice_manual_receipt_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freeze_invoice_manual_receipt_snapshot(uuid,uuid) to service_role;
