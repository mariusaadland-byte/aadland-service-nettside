import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const invoiceSource=readFileSync("lib/invoiceVipps.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/export /g,"")
 .replace('const {Resend}=await import("resend");','const Resend=MockResend;');
const api=new Function("MockResend",invoiceSource+";return {invoiceVippsView};")(class {});
const payment={reference:"INV-12345678-1234-1234-1234-123456789abc",state:"partial",amount_ore:12500,
 captured_ore:8000,refunded_ore:0,receipt_sent_at:null,redirect_url:"https://example.invalid/pay"};
const partial=api.invoiceVippsView(payment);
assert.equal(partial.amountOre,12500,"Keep payment request gross amount");
assert.equal(partial.capturedOre,8000,"Display actual captured amount, not requested amount");
assert.equal(partial.refundedOre,0);
const refunded=api.invoiceVippsView({...payment,state:"partial",refunded_ore:3000});
assert.equal(refunded.capturedOre-refunded.refundedOre,5000,"Net paid amount excludes refunds");
const fullRefund=api.invoiceVippsView({...payment,state:"refunded",refunded_ore:8000});
assert.equal(fullRefund.capturedOre-fullRefund.refundedOre,0,"Full refund leaves no Vipps proceeds");
assert.equal(api.invoiceVippsView(null),null);
const panel=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
for(const label of ["Betalingsforespørsel","Trukket hos Vipps","Refundert hos Vipps","Netto registrert fra dette Vipps-forsøket","Totalt registrert betalt på fakturaen","Gjenstår på fakturaen"]){
 assert.ok(panel.includes(label),"Panel is missing important amount label: "+label);
}
assert.ok(panel.includes("payment.capturedOre"),"Use provider capture, not request amount, as paid value");
assert.ok(panel.includes("payment.refundedOre"),"Show refunds");
assert.ok(panel.includes("invoice.paid_ore"),"Show invoice ledger total");

const source=readFileSync("app/api/cron/payment-receipts/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const NextResponse={json:(body,options={})=>({status:options.status||200,body})};
let errorMode=false;
const s={from(table){
 let q={
  select(){return q},eq(){return q},gt(){return q},is(){return q},neq(){return q},order(){return q},in(){return q},gte(){return q},
  or(){return q},limit(){return q},then(resolve,reject){
   return Promise.resolve(table==="invoice_vipps_payments"?{data:[{reference:payment.reference}],error:null}:{data:[],error:null}).then(resolve,reject);
  }
 };
 return q;
}};
const handler=new Function("NextResponse","cronGuard","reconcileInvoiceVipps","db","sendVippsPaymentReceiptIfNeeded","sendVippsRefundNoticeIfNeeded","sendPaidRentalConfirmationIfNeeded","sendInvoiceVippsRefundNoticeIfNeeded",
 source+";return GET;")(
 NextResponse,()=>null,async()=>errorMode?
 {state:"paid",captured_ore:8000,refunded_ore:0,receipt_sent_at:null,receipt_error:"Temporary email failure"}:
 {state:"paid",captured_ore:8000,refunded_ore:0,receipt_sent_at:"2026-10-22T14:00:00Z",receipt_error:null},
 ()=>s,async()=>({sent:false}),async()=>({sent:false}),async()=>({sent:false}),async()=>({sent:false,reason:"nothing-pending"})
);
const oldLog=console.error;console.error=()=>{};
try{
 let result=await handler({});
 assert.equal(result.status,200);assert.equal(result.body.ok,true);
 assert.equal(result.body.invoice.receiptConfirmed,1);
 errorMode=true;
 result=await handler({});
 assert.equal(result.status,503,"Unsent failed receipts must not report a successful cron job");
 assert.equal(result.body.ok,false);
 assert.equal(result.body.failed,1);
 assert.equal(result.body.invoice.receiptPending,1);
 assert.equal(result.body.failures[0].type,"invoice-receipt");
}finally{console.error=oldLog;}
console.log("Vipps delbetaling/refusjon og gjenoppretting bestått: reelle beløp, restsaldo og synlige kvitteringsfeil.");
