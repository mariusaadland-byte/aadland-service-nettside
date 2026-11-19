import crypto from "node:crypto";
import {invoiceGrossOre} from "./invoicePaymentStatus";
import {previewTripletexInvoice} from "./tripletexInvoiceMapping";
import {nokToOre,positiveId,nextInvoiceDate} from "./tripletexInvoiceReconciliation";

// Includes all accounting-relevant immutable source values, including the
// already sent original PDF. Only a digest reaches the browser.

const validDay=value=>typeof value==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&
 !Number.isNaN(Date.parse(value+"T12:00:00Z"))&&
 new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const paymentFingerprint=values=>crypto.createHash("sha256")
 .update(JSON.stringify(values)).digest("hex");

// Historical payments are validated BEFORE an invoice with earlier income is
// created in Tripletex. The invoice is initially unpaid REMOTELY; each real
// historical payment is then posted separately with its original date/type.
export function directPaidPaymentPlan(invoice,payments=[],vipps=[]){
 const reject=reason=>({ready:false,reason});
 const paid=Number(invoice?.paid_ore);
 if(!Number.isSafeInteger(paid)||paid<0)return reject("Betalt beløp er ugyldig.");
 if(!Array.isArray(payments)||!Array.isArray(vipps)||payments.length>100||
  vipps.length>1000)return reject("Betalingshistorikken er ufullstendig eller for omfattende.");
 if(paid===0){
  if(payments.length||vipps.some(x=>Number(x?.captured_ore||0)>0||
   Number(x?.refunded_ore||0)>0||
   !["paid","cancelled"].includes(x?.state)))
   return reject("Det finnes uavklart betalings- eller refusjonshistorikk for en ubetalt faktura.");
  return {ready:true,paidOre:0,paymentCount:0,paymentDigest:"",
   checkpointAt:null,mode:"unpaid"};
 }
 if(!payments.length||payments.some(p=>p.reversed_at))
  return reject("Innbetalinger mangler eller er angret. Kontroller betalingshistorikken.");
 const keys=new Set(),all=[];
 for(const entry of payments){
  const amount=Number(entry.amount_ore),time=Date.parse(entry.recorded_at||"");
  if(!entry.id||keys.has(entry.id)||!Number.isSafeInteger(amount)||amount<=0||
   !validDay(entry.paid_on)||!Number.isFinite(time)||
   String(entry.vipps_reference||"").length>300)
   return reject("En innbetaling mangler gyldig dato, beløp eller unik identifikasjon.");
  keys.add(entry.id);
  all.push({id:entry.id,amountOre:amount,paidOn:entry.paid_on,
   recordedAt:new Date(time).toISOString(),source:entry.vipps_reference?"vipps":"bank"});
 }
 const total=all.reduce((sum,p)=>sum+p.amountOre,0);
 if(!Number.isSafeInteger(total)||total!==paid)
  return reject("Summen av innbetalingslinjene stemmer ikke med fakturaens betalte beløp.");
 const vippsOre=all.filter(p=>p.source==="vipps").reduce((sum,p)=>sum+p.amountOre,0);
 let providerNet=0;
 for(const event of vipps){
  const captured=Number(event?.captured_ore||0),refunded=Number(event?.refunded_ore||0);
  if(!Number.isSafeInteger(captured)||captured<0||
   !Number.isSafeInteger(refunded)||refunded!==0||
   !["paid","cancelled"].includes(event?.state)||
   (event?.state==="cancelled"&&captured!==0))
   return reject("Vipps-betalingen må avstemmes manuelt på grunn av uklar status eller refusjon.");
  if(event?.state==="paid")providerNet+=captured;
 }
 if(!Number.isSafeInteger(providerNet)||providerNet!==vippsOre)
  return reject("Vipps-oppgjøret stemmer ikke med registrerte Vipps-innbetalinger.");
 all.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.id.localeCompare(b.id));
 const first=Date.parse(all[0].recordedAt);
 const checkpoint=new Date(first-1).toISOString();
 return {ready:true,paidOre:paid,paymentCount:all.length,
  paymentDigest:paymentFingerprint({all,vipps:vipps.map(x=>({
   state:x.state,capturedOre:Number(x.captured_ore||0),refundedOre:Number(x.refunded_ore||0)
  })).sort((a,b)=>String(a.state).localeCompare(String(b.state))||
   a.capturedOre-b.capturedOre||a.refundedOre-b.refundedOre)}),
  checkpointAt:checkpoint,mode:"paid"};
}

export function directInvoiceDigest(invoice,customerId,paymentDigest=""){
 return crypto.createHash("sha256").update(JSON.stringify({
  id:invoice.id,status:invoice.status,invoiceNumber:invoice.invoice_number,
  issuedDate:invoice.issued_date,dueDate:invoice.due_date,sentAt:invoice.sent_at,
  customer:invoice.customer,lines:invoice.line_items,paidOre:invoice.paid_ore,
  creditedOre:invoice.credited_ore,customerId,paymentDigest,
  pdfDigest:crypto.createHash("sha256").update(String(invoice.pdf_base64||"")).digest("hex")
 })).digest("hex");
}
export function directInvoicePilotPreview(invoice,customerId,vatTypes,history=null){
 if(!invoice||invoice.status!=="sent"||!invoice.sent_at||!invoice.pdf_base64||
  Number(invoice.credited_ore)!==0||!positiveId(customerId))
  return {ready:false,reason:"Bare utsendte og ukrediterte fakturaer kan inngå i piloten."};
 const plan=history||directPaidPaymentPlan(invoice,[],[]);
 if(!plan.ready)return {ready:false,reason:plan.reason};
 const gross=invoiceGrossOre(invoice);
 if(!Number.isSafeInteger(gross)||gross<=0||plan.paidOre>gross)
  return {ready:false,reason:"Fakturabeløpet kunne ikke kontrolleres."};
 const prepared=previewTripletexInvoice({
  state:plan.mode,invoice,payment:{paid:plan.paidOre,gross}
 },[],vatTypes,customerId);
 if(!prepared.ready)return {ready:false,reason:prepared.reason};
 // Preserve original invoice reference; Tripletex generates its own accounting number.
 const body={
  ...prepared.body,invoiceNumber:0,
  comment:"Aadland Service, opprinnelig faktura "+String(invoice.invoice_number).slice(0,90)+
   "; kilde-ID "+invoice.id+". Allerede sendt; ikke send på nytt."
 };
 return {ready:true,body,grossOre:gross,customerId,
  mode:plan.mode,paidOre:plan.paidOre,paymentCount:plan.paymentCount,
  paymentDigest:plan.paymentDigest,checkpointAt:plan.checkpointAt,
  digest:directInvoiceDigest(invoice,customerId,plan.paymentDigest)};
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
