import "server-only";
import {createHash} from "node:crypto";
import {getVippsPayment,refundVippsPayment} from "./vippsClient";
import {invoiceVippsReference} from "./invoiceVipps";

// The owner must confirm the exact provider snapshot and invoice number.
// No refund can happen merely from loading/synchronizing an invoice.
export function refundSnapshot(payment,attempt){
 if(!payment||payment.reference!==attempt.reference||payment.amount?.currency!=="NOK"||
    payment.amount.value!==Number(attempt.amount_ore)||payment.state!=="AUTHORIZED")
  throw Error("Vipps-betalingen er ikke klar for refusjon. Kontroller status først.");
 const value=key=>{
  const field=payment.aggregate?.[key];
  if(!field)return 0;
  if(field.currency!=="NOK"||!Number.isSafeInteger(field.value)||field.value<0)
   throw Error("Vipps returnerte ugyldige beløp. Refusjon er stoppet.");
  return field.value;
 };
 const captured=value("capturedAmount"),refunded=value("refundedAmount");
 if(captured>Number(attempt.amount_ore)||refunded>captured)
  throw Error("Vipps returnerte ugyldig innbetalt/refundert beløp.");
 return {captured,refunded,available:captured-refunded};
}

export async function refundInvoiceVipps(s,invoice,request){
 if(process.env.VERCEL_ENV==="preview")throw Error("Ekte refusjon er sperret i forhåndsvisning.");
 const reference=String(request?.reference||"");
 const amountOre=request?.amountOre;
 if(!invoice?.id||!invoice?.invoice_number||invoice.status==="draft"||
    request?.confirmedInvoiceNumber!==invoice.invoice_number)
  throw Error("Bekreft riktig utstedt faktura før refusjon.");
 if(!invoiceVippsReference(reference))throw Error("Ugyldig Vipps-referanse.");
 if(!Number.isSafeInteger(amountOre)||amountOre<=0)
  throw Error("Skriv inn et gyldig refusjonsbeløp.");
 if(!Number.isSafeInteger(request?.expectedCapturedOre)||!Number.isSafeInteger(request?.expectedRefundedOre))
  throw Error("Hent oppdatert betalingsstatus før refusjon.");
 const found=await s.from("invoice_vipps_payments").select("*")
  .eq("invoice_id",invoice.id).eq("reference",reference).maybeSingle();
 if(found.error)throw Error("Betalingsforsøket kunne ikke kontrolleres.");
 const attempt=found.data;
 if(!attempt)throw Error("Vipps-betalingen tilhører ikke denne fakturaen.");
 const before=refundSnapshot(await getVippsPayment("service",reference),attempt);
 if(before.captured!==request.expectedCapturedOre||before.refunded!==request.expectedRefundedOre||
    before.captured!==Number(attempt.captured_ore)||before.refunded!==Number(attempt.refunded_ore))
  throw Error("Beløp eller Vipps-status har endret seg. Oppdater fakturaen og kontroller før refusjon.");
 if(amountOre>before.available)throw Error("Refusjonsbeløpet er høyere enn tilgjengelig beløp.");
 // Same request and provider snapshot get the same key even after a network timeout.
 // A fresh partial refund after synchronizing the provider gets a different key.
 const idempotencyKey="inv-refund-"+createHash("sha256")
  .update([attempt.id,reference,before.captured,before.refunded,amountOre].join("|"))
  .digest("hex").slice(0,32);
 await refundVippsPayment("service",reference,amountOre,{idempotencyKey});
 // Provider is the source of truth; reconcile the net amount using the
 // existing atomic SQL function which reverses the old ledger row first.
 const after=refundSnapshot(await getVippsPayment("service",reference),attempt);
 if(after.refunded<before.refunded+amountOre)
  throw Error("Vipps mottok refusjonskallet, men bekreftelse mangler. Kontroller status før du prøver igjen.");
 const synced=await s.rpc("sync_invoice_vipps",{
  p_reference:reference,p_state:"AUTHORIZED",
  p_captured:after.captured,p_refunded:after.refunded
 });
 if(synced.error)throw Error("Vipps har behandlet refusjonen, men regnskapet ble ikke oppdatert. Kontroller Vipps-status.");
 return synced.data;
}
