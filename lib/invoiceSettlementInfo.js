import {invoicePaymentState} from "./invoicePaymentStatus";

// Sums come from stored payment and issued credit-note records. No provider calls.
const ore=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
export function summarizeInvoiceActivity(invoices,vippsPayments,creditNotes){
 const records=new Map((invoices||[]).map(i=>[i.id,{
  vippsCapturedOre:0,vippsRefundedOre:0,vippsActiveCount:0,
  creditNoteCount:0,creditNoteSentCount:0,creditDocumentsOre:0
 }]));
 for(const p of vippsPayments||[]){
  const row=records.get(p.invoice_id);if(!row)continue;
  row.vippsCapturedOre+=ore(p.captured_ore);
  row.vippsRefundedOre+=ore(p.refunded_ore);
  if(["pending","authorized"].includes(p.state))row.vippsActiveCount++;
 }
 for(const n of creditNotes||[]){
  const row=records.get(n.invoice_id);if(!row)continue;
  row.creditDocumentsOre+=ore(n.total_ore);
  row.creditNoteCount++;
  if(n.sent_at)row.creditNoteSentCount++;
 }
 return (invoices||[]).map(invoice=>({...invoice,activity:records.get(invoice.id)}));
}

// A refund reverses a payment, not the customer's debt. Never infer that a
// refund automatically gives the customer a credit or that a credit refunds cash.
export function invoiceSettlementInfo(invoice,today){
 const payment=invoicePaymentState(invoice,today);
 const a=invoice.activity||null;
 const refunded=a?ore(a.vippsRefundedOre):0;
 const captured=a?ore(a.vippsCapturedOre):0;
 const netVipps=Math.max(0,captured-refunded);
 const active=a?ore(a.vippsActiveCount):0;
 const creditDocs=a?ore(a.creditDocumentsOre):0;
 const mismatch=a!==null&&(
  creditDocs!==payment.credited||
  refunded>captured||
  netVipps>payment.paid
 );
 if(invoice.status==="draft")return {...payment,label:"Kladd",needsReview:false,kind:"draft",refunded,netVipps,active,mismatch:false};
 if(mismatch)return {...payment,label:"Kontroller beløpsavvik",needsReview:true,kind:"mismatch",refunded,netVipps,active,mismatch:true,
  guidance:"Kontroller kreditnotaer og Vipps-innbetalinger mot fakturaens betalingshistorikk før ny betaling, purring eller kreditnota."};
 if(active>0)return {...payment,label:"Vipps-betaling pågår",needsReview:true,kind:"activeVipps",refunded,netVipps,active,mismatch:false,
  guidance:"Det finnes en åpen Vipps-forespørsel. Kontroller oppdatert Vipps-status før ny betaling, kreditnota eller purring."};
 if(refunded>0&&payment.outstanding>0)return {...payment,label:"Refusjon – restkrav må avklares",needsReview:true,kind:"refundedOutstanding",refunded,netVipps,active,mismatch:false,
  guidance:"Vipps-refusjon er registrert, men fakturaen har fortsatt et restkrav. Avklar om kunden skylder restbeløpet eller om det skal krediteres før purring."};
 if(payment.outstanding===0&&refunded>0&&payment.credited>0)
  return {...payment,label:"Oppgjort med refusjon og kreditnota",needsReview:false,kind:"settledWithCreditAndRefund",refunded,netVipps,active,mismatch:false};
 if(payment.outstanding===0&&payment.credited>0)
  return {...payment,label:payment.total===0?"Fullt kreditert":"Oppgjort etter kreditnota",needsReview:false,kind:"settledWithCredit",refunded,netVipps,active,mismatch:false};
 if(payment.outstanding===0&&refunded>0)
  return {...payment,label:"Oppgjort etter Vipps-refusjon",needsReview:false,kind:"settledWithRefund",refunded,netVipps,active,mismatch:false};
 return {...payment,needsReview:false,kind:"ordinary",refunded,netVipps,active,mismatch:false};
}
