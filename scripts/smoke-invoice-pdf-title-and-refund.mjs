import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Test-only PDF creation. No customer, payment provider or mail network access.
const pdfSource=readFileSync("lib/invoiceDraftPdf.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const mockSharp=()=>({
 resize(){return this;},flatten(){return this;},jpeg(){return this;},
 async toBuffer(){return {data:Buffer.from("not-a-real-jpeg"),info:{width:400,height:100}};}
});
const {invoicePdfHeading,buildInvoiceDraftPdf}=new Function("sharp","path",
 pdfSource+";return {invoicePdfHeading,buildInvoiceDraftPdf};")(
 mockSharp,{join:()=>"/fake-logo.webp"}
);
const record={
 invoice_number:"AS-WEB-TEST-123456",status:"sent",issued_date:"2026-10-23",
 due_date:"2026-11-06",paid_ore:100,title:"Ny faktura",
 customer:{
  name:"Eksempelkunde",email:"test@example.invalid",address:"Eksempelgata 1, 5000 Bergen",
  workDate:"2026-10-23",workDescription:"Reparasjon av dør og utskifting av beslag"
 },
 line_items:[{description:"Arbeid",unit:"stk",quantity:1,unitPriceOre:80,vatRate:25}],
 notes:""
};
assert.equal(invoicePdfHeading(record),"Reparasjon av dør og utskifting av beslag");
assert.equal(invoicePdfHeading({...record,title:"Vedlikehold av inngangsdør"}),"Vedlikehold av inngangsdør");
assert.equal(invoicePdfHeading({...record,title:"Faktura",customer:{},line_items:[{description:"Ny terrasse"}]}),"Ny terrasse");
assert.equal(invoicePdfHeading({...record,title:"Oppdrag",customer:{},line_items:[{description:"Arbeid"}]}),"Utført arbeid");
assert.equal(invoicePdfHeading({...record,title:"Ny faktura",customer:{workDescription:["  ","Montering av skuffeskinner","Maling av dør"].join(String.fromCharCode(10))}}),"Montering av skuffeskinner");
assert.equal(invoicePdfHeading({...record,title:"X".repeat(100)}).length,64,"Keep headings within printable line length");
assert.equal(record.title,"Ny faktura","Never rewrite already issued invoice data");

const original=(await buildInvoiceDraftPdf({...record})).toString("latin1");
assert.ok(original.startsWith("%PDF-1.4"));
assert.ok(original.includes("FAKTURA"));
assert.ok(original.includes("Reparasjon av d"));
assert.ok(!original.includes("(Ny faktura)"),"Never show the generic title on future invoice PDFs");
assert.ok(original.includes("AS-WEB-TEST-123456"),"Preserve invoice number");
assert.ok(original.includes("MVA 25 %"),"Preserve 25 percent VAT");
assert.ok(original.includes("0,80 kr"),"Preserve ex VAT amount");
assert.ok(original.includes("0,20 kr"),"Preserve VAT amount");
assert.ok(original.includes("1,00 kr"),"Preserve payable total");
assert.ok(original.includes("Kontonummer: 8450 46 22699"),"Ordinary bank invoices keep bank details");
const vippsDocument=(await buildInvoiceDraftPdf({...record,customer:{...record.customer,paymentMethod:"vipps"}})).toString("latin1");
assert.ok(vippsDocument.includes("Betalingsm"),"Vipps invoice identifies the correct payment method");
assert.ok(vippsDocument.includes("Vipps-lenken"),"Vipps invoice explains the payment link");
assert.ok(!vippsDocument.includes("Kontonummer: 8450 46 22699"),"Vipps invoice must not offer a competing bank payment route");
assert.ok(vippsDocument.includes("MVA 25 %")&&vippsDocument.includes("1,00 kr"),"Vipps payment instructions must preserve original VAT and total");
const receipt=(await buildInvoiceDraftPdf({...record,paymentReceipt:{
 amountOre:100,outstandingOre:0,reference:"INV-12345678-1234-4234-8234-123456789abc",
 paidAt:"2026-10-23T21:35:19Z"
}})).toString("latin1");
assert.ok(receipt.includes("KVITTERING"));
assert.ok(receipt.includes("BETALING REGISTRERT"));
assert.ok(receipt.includes("0,00 kr"),"Show no outstanding amount");
assert.ok(receipt.includes("BETALT MED VIPPS N"));
assert.ok(receipt.includes("Fakturaen er fullt oppgjort"));
assert.ok(receipt.includes("Reparasjon av d"),"Receipt uses same meaningful title");

// Simulate a subsequent 100 øre full refund. Never issue a real refund.
// Verify that reconciliation reverses net credit and does not re-send paid receipt.
const source=readFileSync("lib/invoiceVipps.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const payment={id:"mock-refund-id",reference:"INV-12345678-1234-4234-8234-123456789abc",
 invoice_id:record.invoice_number,state:"paid",amount_ore:100,captured_ore:100,refunded_ore:0,
 receipt_sent_at:"2026-10-23T21:35:20Z"};
let readCalls=0,captureCalls=0,refundCalls=0,synced=null;
const refundSnapshot={
 reference:payment.reference,state:"AUTHORIZED",
 amount:{currency:"NOK",value:100},
 aggregate:{
  authorizedAmount:{currency:"NOK",value:100},
  capturedAmount:{currency:"NOK",value:100},
  refundedAmount:{currency:"NOK",value:100},
  cancelledAmount:{currency:"NOK",value:0}
 }
};
const s={from(table){
  assert.equal(table,"invoice_vipps_payments");
  return {select(){return this;},eq(){return this;},async single(){return {data:{...payment},error:null};}};
 },async rpc(name,params){
  assert.equal(name,"sync_invoice_vipps");synced=params;
  return {data:{...payment,state:"refunded",captured_ore:100,refunded_ore:100},error:null};
 }};
const {reconcileInvoiceVipps}=new Function("getVippsPayment","captureVippsPayment","process",
 source+";return {reconcileInvoiceVipps};")(
 async()=>{readCalls++;return refundSnapshot;},
 async()=>{captureCalls++;throw Error("No capture on refund recheck");},
 {env:{VERCEL_ENV:"production"}}
);
const result=await reconcileInvoiceVipps(s,payment.reference);
assert.equal(result.state,"refunded");
assert.equal(result.captured_ore-result.refunded_ore,0);
assert.equal(readCalls,1);
assert.equal(captureCalls,0);
assert.equal(refundCalls,0,"Simulation must never invoke the real Vipps refund endpoint");
assert.equal(synced.p_captured,100);
assert.equal(synced.p_refunded,100);
assert.equal(synced.p_state,"AUTHORIZED");
const api=readFileSync("app/api/admin/vipps-payment/route.js","utf8");
assert.ok(api.includes('s.from("orders")')&&api.includes('s.from("rental_bookings")'));
assert.ok(!api.includes('s.from("invoice_drafts")'),"Existing manual refund endpoint does not cover invoices; block real refund tests here");
console.log("Faktura/PDF og simulert Vipps-refusjon bestått: tydelig oppdragsoverskrift, MVA, full betaling, null restbeløp, refusjon uten nytt trekk eller faktisk refund.");
