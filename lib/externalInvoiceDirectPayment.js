import crypto from "node:crypto";
import {findTripletexVatType} from "./tripletexInvoiceMapping";
import {nokToOre} from "./tripletexInvoiceReconciliation";

export const validInvoiceDay=value=>typeof value==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&
 !Number.isNaN(Date.parse(value+"T12:00:00Z"))&&
 new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
export const safePositive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
export const invoiceNet=x=>Number(x)/100;
export const externalDirectHash=(invoice,record,customerId,paymentTypeId)=>crypto.createHash("sha256")
 .update(JSON.stringify({id:invoice.id,sha256:invoice.sha256,
  invoiceNumber:invoice.invoice_number,issuedOn:invoice.issued_on,dueOn:invoice.due_on,
  customer:invoice.customer_name,amountOre:invoice.amount_ore,status:invoice.status,
  paidOn:invoice.paid_on||null,customerId,importNumber:record.import_number,
  baseOre:record.base_ore,vatOre:record.vat_ore,rate:record.vat_rate,
  paymentTypeId:paymentTypeId||null})).digest("hex");
export function externalDirectBody(invoice,record,customerId,types){
 const gross=Number(invoice?.amount_ore),base=Number(record?.base_ore),vat=Number(record?.vat_ore);
 const type=findTripletexVatType(record?.vat_rate,types);
 if(!safePositive(customerId)||!type.id||!validInvoiceDay(invoice?.issued_on)||
  !validInvoiceDay(invoice?.due_on)||invoice.due_on<invoice.issued_on||
  !Number.isSafeInteger(gross)||gross<=0||!Number.isSafeInteger(base)||base<=0||
  !Number.isSafeInteger(vat)||vat<=0||base+vat!==gross||
  Math.round(base*Number(record.vat_rate)/100)!==vat)
  throw Error("Fakturaens dato, kunde, MVA-kode eller beløp kunne ikke kontrolleres for direkte overføring.");
 const original=String(invoice.invoice_number||"").trim();
 const source=String(invoice.source_system||"").trim();
 if(!original||original.length>90||!source)return null;
 return {invoiceNumber:0,invoiceDate:invoice.issued_on,
  invoiceDueDate:invoice.due_on,
  comment:("Allerede utstedt i "+source+"; opprinnelig faktura "+original+
   "; Aadland ekstern-ID "+invoice.id+"; IKKE send til kunde.").slice(0,220),
  orders:[{orderDate:invoice.issued_on,deliveryDate:invoice.issued_on,
   customer:{id:customerId},isPrioritizeAmountsIncludingVat:false,
   orderLines:[{description:("Ekstern faktura "+original+
    " fra "+source+" – allerede sendt til kunden").slice(0,210),
    count:1,unitPriceExcludingVatCurrency:base/100,vatType:{id:type.id}}]}]};
}
export function safeTripletexPaymentTypes(rows){
 if(!Array.isArray(rows)||rows.length>=200)
  throw Error("Tripletex returnerte en ufullstendig liste over betalingstyper.");
 const seen=new Set();
 return rows.filter(row=>{
  const id=safePositive(row?.id);
  if(!id||seen.has(id)||row.isInactive===true||row.isDeleted===true)return false;
  seen.add(id);return true;
 }).map(row=>({id:Number(row.id),
  name:String(row.description||row.name||row.displayName||
    ("Betalingstype "+row.id)).slice(0,90),
  code:String(row.code||"").slice(0,50),
  account:row.account?.number?String(row.account.number):null}));
}
export function invoiceIsDuplicate(rows,customerId,issuedOn,grossOre,importNumber){
 if(!Array.isArray(rows)||rows.length>=1000)
  return {safe:false,reason:"Ufullstendig fakturaliste i Tripletex."};
 for(const row of rows){
  const id=safePositive(row?.id),cust=safePositive(row?.customer?.id);
  const amount=nokToOre(row?.amount);
  if(!id||!cust||amount===null)
   return {safe:false,reason:"En faktura i Tripletex kan ikke sammenlignes sikkert."};
  if(Number(row.invoiceNumber)===Number(importNumber)||
   (cust===customerId&&String(row.invoiceDate).slice(0,10)===issuedOn&&
    amount===grossOre&&!row.isCreditNote&&!row.isCredited))
   return {safe:false,reason:"Det kan allerede finnes en tilsvarende faktura i Tripletex. Kontroller før du overfører."};
 }
 return {safe:true};
}
export function verifyDirectExternalInvoice(remote,customerId,issuedOn,grossOre){
 const id=safePositive(remote?.id);
 const invoiceNumber=safePositive(remote?.invoiceNumber);
 const paid=nokToOre(remote?.amountOutstanding),gross=nokToOre(remote?.amount);
 if(!id||!invoiceNumber||gross!==grossOre||paid!==grossOre||
  safePositive(remote?.customer?.id)!==customerId||
  String(remote.invoiceDate).slice(0,10)!==issuedOn||
  remote.isCreditNote||remote.isCredited||
  (remote.currency?.code&&remote.currency.code!=="NOK"))
  throw Error("Tripletex opprettet fakturaen, men den har ukjent kunde, dato, sum eller restbeløp. Må kontrolleres manuelt.");
 return {id,number:invoiceNumber};
}
export function assertReadyToPostHistoricalPayment(invoice,remote,paymentTypeId,today){
 const id=safePositive(remote?.id),gross=Number(invoice.amount_ore);
 const outstanding=nokToOre(remote?.amountOutstanding),amount=nokToOre(remote?.amount);
 if(invoice.status!=="paid"||!validInvoiceDay(invoice.paid_on)||
  invoice.paid_on>today||!safePositive(paymentTypeId)||!id||
  !Number.isSafeInteger(gross)||gross<=0||
  amount!==gross||outstanding!==gross||
  remote.isCreditNote||remote.isCredited||
  (remote.currency?.code&&remote.currency.code!=="NOK"))
  throw Error("Innbetalingen er allerede ført, eller original dato, beløp og betalingsmåte stemmer ikke. Ingen ny betaling kan sendes.");
 return {date:invoice.paid_on,amountOre:gross,paymentTypeId:Number(paymentTypeId)};
}
