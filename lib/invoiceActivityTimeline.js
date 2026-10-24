// Read-only timeline of events already persisted in the invoice system.
// Dates of historical refunds are not guessed when the individual refund receipt
// did not exist yet. The net settlement panel owns the authoritative totals.
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
const push=(events,key,kind,title,occurredAt,amountOre=null,detail="",link=null)=>{
 events.push({id:key,kind,title,occurredAt:occurredAt||null,
  amountOre:Number.isSafeInteger(amountOre)?amountOre:null,
  detail:String(detail||"").slice(0,350),link:link||null});
};
export function buildInvoiceActivityTimeline({
 invoice,payments=[],vipps=[],refundNotices=[],creditNotes=[],reminders=[]
}){
 if(!invoice?.id||invoice.status==="draft")return [];
 const events=[];
 const n=invoice.invoice_number||"fakturaen";
 push(events,"issued:"+invoice.id,"invoice","Faktura utstedt",
  invoice.issued_at||invoice.issued_date,null,n);
 if(invoice.sent_at)push(events,"invoice-sent:"+invoice.id,"email","Faktura sendt på e-post",
  invoice.sent_at,null,"Utsendelsen er registrert som sendt.");
 for(const item of payments){
  const sum=positive(item.amount_ore);
  if(!sum)continue;
  const vippsPayment=Boolean(item.vipps_reference);
  push(events,"payment:"+item.id,"payment",vippsPayment?"Vipps-innbetaling registrert":"Innbetaling registrert",
   item.recorded_at||item.paid_on,sum,
   (item.paid_on?"Betalingsdato: "+item.paid_on+". ":"")+
   (vippsPayment?"Vipps-betaling. ":"")+(item.note||""));
  if(item.reversed_at)push(events,"payment-reversed:"+item.id,"reversal",
   vippsPayment?"Vipps-regnskapsføring justert":"Manuell innbetaling angret",
   item.reversed_at,-sum,
   vippsPayment?"Regnskapsposten er korrigert. Se Vipps-refusjoner for reelle tilbakebetalinger.":
    "Denne registreringen er angret og teller ikke lenger i innbetalt beløp.");
 }
 for(const p of vipps){
  push(events,"vipps-request:"+p.id,"vipps","Vipps-betalingsforespørsel opprettet",
   p.created_at,null,
   p.delivery_method==="vipps_push"?"Betalingsvarsel i Vipps.":"Vipps-betalingslenke.");
  if(p.receipt_sent_at)push(events,"vipps-receipt:"+p.id,"email","Vipps-kvittering sendt",
    p.receipt_sent_at,null,"Kvittering på e-post er registrert sendt.");
 }
 const refundedByPayment=new Map();
 for(const note of refundNotices){
  if(!note.payment_id)continue;
  const delta=positive(note.refunded_delta_ore);
  if(!delta)continue;
  refundedByPayment.set(note.payment_id,(refundedByPayment.get(note.payment_id)||0)+delta);
  push(events,"refund:"+note.id,"refund","Vipps-refusjon bekreftet",
   note.created_at,-delta,"Tilbakebetalt via Vipps, ikke en kreditnota.");
  if(note.sent_at)push(events,"refund-mail:"+note.id,"email","Refusjonsbekreftelse sendt",
   note.sent_at,null,"E-postbekreftelse for refusjonen er sendt.");
 }
 for(const p of vipps){
  const remainder=positive(p.refunded_ore)-(refundedByPayment.get(p.id)||0);
  if(remainder>0){
   // Older provider refunds can predate the durable refund notice table.
   // Do not use the provider's last-updated timestamp as a fake refund time.
   push(events,"refund-historical:"+p.id,"refund","Tidligere Vipps-refusjon registrert",
    null,-remainder,"Nøyaktig refusjonstidspunkt er ikke lagret. Beløpet inngår i samlet refusjon.");
  }
 }
 for(const c of creditNotes){
  push(events,"credit:"+c.id,"credit","Kreditnota "+(c.credit_number||"utstedt"),
   c.issued_at||c.credit_date,-positive(c.total_ore),c.reason||"",
   "/api/admin/invoices/credit-notes?invoiceId="+encodeURIComponent(invoice.id)+"&documentId="+encodeURIComponent(c.id));
  if(c.sent_at)push(events,"credit-sent:"+c.id,"email","Kreditnota sendt på e-post",
   c.sent_at,null,c.credit_number||"");
 }
 for(const m of reminders){
  const name=m.kind==="inkasso"?"Inkassovarsel":"Purring";
  const sent=m.status==="sent"&&Boolean(m.sent_at);
  const detail=sent?"Registrert sendt til kunden.":"Utsending er ikke bekreftet.";
  push(events,"reminder:"+m.id,"reminder",
   name+(sent?" sendt":" – sendeforsøk"),sent?m.sent_at:m.created_at,null,detail,
   m.hasPdf?"/api/admin/invoices/reminders?invoiceId="+encodeURIComponent(invoice.id)+"&documentId="+encodeURIComponent(m.id):null);
 }
 // Latest first; undated historic events are collected last. Date-only values
 // remain date-only in the UI and are not invented as exact timestamps.
 return events.sort((a,b)=>{
  const av=a.occurredAt?Date.parse(a.occurredAt):NaN;
  const bv=b.occurredAt?Date.parse(b.occurredAt):NaN;
  if(!Number.isFinite(av))return Number.isFinite(bv)?1:a.id.localeCompare(b.id);
  if(!Number.isFinite(bv))return -1;
  return bv-av||a.id.localeCompare(b.id);
 });
}
