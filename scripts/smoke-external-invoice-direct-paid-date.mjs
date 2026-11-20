import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/externalInvoiceDirectPayment.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {externalDirectBody,externalDirectHash,safePositive,safeTripletexPaymentTypes,
 invoiceIsDuplicate,verifyDirectExternalInvoice,assertReadyToPostHistoricalPayment,
 validInvoiceDay}=new Function("crypto","findTripletexVatType","nokToOre",
 source+";return {externalDirectBody,externalDirectHash,safePositive,safeTripletexPaymentTypes,invoiceIsDuplicate,verifyDirectExternalInvoice,assertReadyToPostHistoricalPayment,validInvoiceDay};")(
 crypto,(rate,types)=>({id:types.find(x=>x.number===(rate===25?"3":rate===15?"31":"33"))?.id||null}),
 amount=>typeof amount==="number"?Math.round(amount*100):null
);
const invoice={id:"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
 invoice_number:"10035",source_system:"faktura.no",customer_name:"Example Test Customer",
 issued_on:"2026-09-03",due_on:"2026-09-10",amount_ore:1793755,
 status:"paid",paid_on:"2026-09-28",sha256:"a".repeat(64)};
const claim={import_number:90000001,base_ore:1435004,vat_ore:358751,vat_rate:25};
const remoteTypes=[{id:17,number:"3"}];
const prepared=externalDirectBody(invoice,claim,321,remoteTypes);
assert.equal(prepared.invoiceNumber,0,"Tripletex must generate a new invoice number");
assert.equal(prepared.invoiceDate,"2026-09-03");
assert.equal(prepared.invoiceDueDate,"2026-09-10");
assert.equal(prepared.orders[0].orderLines[0].unitPriceExcludingVatCurrency,14350.04);
assert.equal(prepared.orders[0].orderLines[0].vatType.id,17);
assert.equal(prepared.orders[0].customer.id,321);
assert.match(prepared.comment,/10035/);
const hash=externalDirectHash(invoice,claim,321,88);
assert.match(hash,/^[a-f0-9]{64}$/);
assert.notEqual(hash,externalDirectHash({...invoice,paid_on:"2026-09-29"},claim,321,88));
assert.equal(validInvoiceDay("2026-02-30"),false);
assert.equal(validInvoiceDay("2026-09-28"),true);
assert.equal(safePositive("0"),null);
assert.deepEqual(safeTripletexPaymentTypes([
 {id:88,description:"Nettbank",account:{number:1920}},
 {id:89,name:"Vipps",account:{number:1900}},
 {id:88,name:"same"},
 {id:90,name:"inactive",isInactive:true}
]),[{id:88,name:"Nettbank",code:"",account:"1920"},
 {id:89,name:"Vipps",code:"",account:"1900"}]);
assert.throws(()=>safeTripletexPaymentTypes(new Array(200).fill({id:1})),/ufullstendig/);
assert.equal(invoiceIsDuplicate([],321,"2026-09-03",1793755,90000001).safe,true);
assert.equal(invoiceIsDuplicate([
 {id:84,customer:{id:321},invoiceDate:"2026-09-03",invoiceNumber:90000002,
 amount:17937.55}
],321,"2026-09-03",1793755,90000001).safe,false);
assert.equal(invoiceIsDuplicate([
 {id:84,customer:{id:999},invoiceDate:"2026-09-03",invoiceNumber:90000001,
 amount:17937.55}
],321,"2026-09-03",1793755,90000001).safe,false);
assert.equal(invoiceIsDuplicate([{id:88,customer:null,amount:17937.55}],
 321,"2026-09-03",1793755,90000001).safe,false);
const remote={id:124,invoiceNumber:100054,invoiceDate:"2026-09-03",
 customer:{id:321},amount:17937.55,amountOutstanding:17937.55,
 currency:{code:"NOK"},isCreditNote:false,isCredited:false};
assert.deepEqual(verifyDirectExternalInvoice(remote,321,"2026-09-03",1793755),
 {id:124,number:100054});
const payment=assertReadyToPostHistoricalPayment(invoice,remote,88,"2026-11-20");
assert.deepEqual(payment,{date:"2026-09-28",amountOre:1793755,paymentTypeId:88});
assert.throws(()=>assertReadyToPostHistoricalPayment(invoice,{
 ...remote,amountOutstanding:0},88,"2026-11-20"),/allerede/);
assert.throws(()=>assertReadyToPostHistoricalPayment(invoice,{
 ...remote,amountOutstanding:120},88,"2026-11-20"),/allerede/);
assert.throws(()=>assertReadyToPostHistoricalPayment(invoice,remote,0,"2026-11-20"),/allerede/);
assert.throws(()=>assertReadyToPostHistoricalPayment({...invoice,paid_on:"2026-12-02"},
 remote,88,"2026-11-20"),/allerede/);
const api=read("app/api/admin/invoices/external-register/tripletex/direct/route.js");
for(const needed of [
 'user?.role!=="owner"',"sameOriginGuard(req)",
 'process.env.VERCEL_ENV!=="production"',
 "tripletexCreateUnsentedInvoice",
 "tripletexRecordInvoicePayment",
 "payment.date,payment.paymentTypeId",
 "paid_on", 'body.action',
 'status:"processing"',
 'payment_status:"processing"',
 'payment_status:"needs_review"',
 "tripletex_invoice_id:createdId",
 'status:"confirmed"',
 "notBookedElsewhere",
 "invoiceIsDuplicate",
 "verifiedTypes",
 'transfer_method:"api"',
 "tripletex_customer_links",
 "isPrioritizeAmountsIncludingVat"
])assert.ok(api.includes(needed),"Missing direct invoice + historical paid date guard: "+needed);
assert.ok(!api.includes("sendToCustomer=true"));
const writeWrapper=read("lib/tripletexApi.js");
assert.ok(writeWrapper.includes('"/invoice?sendToCustomer=false"'));
assert.ok(writeWrapper.includes('"/invoice/"+invoiceId+"/:payment?paymentDate="+paymentDate+'));
assert.ok(writeWrapper.includes("&paymentTypeId="+typeId+"&paidAmount="+amount"));
const status=read("app/api/admin/invoices/external-register/tripletex/route.js");
assert.ok(status.includes("paymentDate:claim.payment_date"));
assert.ok(status.includes("transferMethod:claim.transfer_method"));
const ui=read("app/admin/faktura/eksterne/ExternalInvoiceTripletexPanel.js");
assert.ok(ui.includes("Overfør faktura + registrer lagret betaling automatisk"));
assert.ok(ui.includes("Registrert betalingsdato:"));
assert.ok(ui.includes("invoice.paid_on"));
assert.ok(ui.includes('action:"transfer-direct"'));
assert.ok(ui.includes("notBookedElsewhere:notImported"));
assert.ok(ui.includes("paymentSourceConfirmed"));
assert.ok(ui.includes("Klargjør CSV-import"));
const sql=read("supabase/migrations/20261120181000_external_invoice_direct_payment_date.sql");
assert.ok(sql.includes("xit_api_payment_values"));
assert.ok(sql.includes("payment_date date"));
assert.ok(sql.includes("transfer_method"));
assert.ok(sql.includes("processing"));
console.log("Direkte Tripletex-faktura + historisk betalt-dato: 10035 / 17 937,55 kr / 2026-09-28; API, antiduplikat, betalt kontroll, egen betalingsmåte og sperre ved usikker utgang bestått.");
