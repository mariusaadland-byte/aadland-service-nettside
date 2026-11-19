import crypto from "node:crypto";
import {invoiceGrossOre} from "./invoicePaymentStatus";
import {previewTripletexInvoice} from "./tripletexInvoiceMapping";
import {nokToOre,positiveId,nextInvoiceDate} from "./tripletexInvoiceReconciliation";

// Includes all accounting-relevant immutable source values, including the
// already sent original PDF. Only a digest reaches the browser.
export function directInvoiceDigest(invoice,customerId){
 return crypto.createHash("sha256").update(JSON.stringify({
  id:invoice.id,status:invoice.status,invoiceNumber:invoice.invoice_number,
  issuedDate:invoice.issued_date,dueDate:invoice.due_date,sentAt:invoice.sent_at,
  customer:invoice.customer,lines:invoice.line_items,paidOre:invoice.paid_ore,
  creditedOre:invoice.credited_ore,customerId,
  pdfDigest:crypto.createHash("sha256").update(String(invoice.pdf_base64||"")).digest("hex")
 })).digest("hex");
}
export function directInvoicePilotPreview(invoice,customerId,vatTypes){
 if(!invoice||invoice.status!=="sent"||!invoice.sent_at||!invoice.pdf_base64||
  Number(invoice.paid_ore)!==0||Number(invoice.credited_ore)!==0||
  !positiveId(customerId))
  return {ready:false,reason:"Bare bekreftet utsendte, helt ubetalte og ukrediterte fakturaer kan inngå i piloten."};
 const gross=invoiceGrossOre(invoice);
 if(!Number.isSafeInteger(gross)||gross<=0)
  return {ready:false,reason:"Fakturabeløpet kunne ikke kontrolleres."};
 const prepared=previewTripletexInvoice({
  state:"unpaid",invoice,payment:{paid:0,gross}
 },[],vatTypes,customerId);
 if(!prepared.ready)return {ready:false,reason:prepared.reason};
 // Preserve original invoice reference; Tripletex generates its own accounting number.
 const body={
  ...prepared.body,invoiceNumber:0,
  comment:"Aadland Service, opprinnelig faktura "+String(invoice.invoice_number).slice(0,90)+
   "; kilde-ID "+invoice.id+". Allerede sendt; ikke send på nytt."
 };
 return {ready:true,body,grossOre:gross,customerId,
  digest:directInvoiceDigest(invoice,customerId)};
}
export function duplicateDirectInvoiceSearch(rows,customerId,issuedDate,grossOre){
 if(!Array.isArray(rows)||rows.length>=1000)
  return {safe:false,reason:"Tripletex sin fakturaliste er ufullstendig. Kontroller manuelt."};
 for(const row of rows){
  // Unreadable invoice fields mean we cannot rule out a prior accounting copy.
  if(!positiveId(row?.id)||!positiveId(row?.customer?.id)||
   nokToOre(row?.amount)===null)
   return {safe:false,reason:"Tripletex returnerte en faktura som ikke kan sammenlignes sikkert."};
  if(Number(row.customer.id)===Number(customerId)&&
   String(row.invoiceDate||"").slice(0,10)===issuedDate&&
   nokToOre(row.amount)===grossOre)
   return {safe:false,reason:"Det finnes allerede en mulig lik faktura med samme kunde, dato og beløp i Tripletex."};
 }
 return {safe:true};
}
export function directInvoiceVerification(remote,customerId,issuedDate,grossOre){
 const id=positiveId(remote?.id),invoiceNumber=positiveId(remote?.invoiceNumber),
  amount=nokToOre(remote?.amount),outstanding=nokToOre(remote?.amountOutstanding);
 const good=id&&invoiceNumber&&amount===grossOre&&outstanding===grossOre&&
  Number(remote?.customer?.id)===Number(customerId)&&
  String(remote?.invoiceDate||"").slice(0,10)===issuedDate&&
  !remote?.isCreditNote&&!remote?.isCredited&&
  (!remote?.currency?.code||remote.currency.code==="NOK");
 return good?{ok:true,id,invoiceNumber,grossOre,outstandingOre:outstanding}:
  {ok:false,reason:"Tripletex-fakturaen ble opprettet, men kunde, dato, beløp eller restbeløp kan ikke bekreftes."};
}
export function directInvoiceSearchPath(date,customerId){
 const tomorrow=nextInvoiceDate(date);
 if(!tomorrow||!positiveId(customerId))throw Error("Ugyldig direkte fakturasøk.");
 return "/invoice?invoiceDateFrom="+date+"&invoiceDateTo="+tomorrow+
  "&customerId="+customerId+"&count=1000&fields=id,invoiceNumber,invoiceDate,customer,amount";
}
