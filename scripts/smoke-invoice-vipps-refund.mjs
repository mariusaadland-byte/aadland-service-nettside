import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

// All provider and database operations are mocked. No real refunds or emails.
const reference="INV-12345678-1234-4234-8234-123456789abc";
const invoice={id:"12345678-1234-4234-8234-123456789abc",invoice_number:"AS-WEB-TEST",status:"sent",paid_ore:12500};
const attempt={id:"87654321-4321-4321-8234-123456789abc",invoice_id:invoice.id,reference,amount_ore:12500,
 captured_ore:12500,refunded_ore:0,state:"paid"};
const provider={reference,state:"AUTHORIZED",amount:{currency:"NOK",value:12500},
 aggregate:{authorizedAmount:{currency:"NOK",value:12500},capturedAmount:{currency:"NOK",value:12500},
 refundedAmount:{currency:"NOK",value:0}}};
let calls=[],syncs=0,wrongInvoice=false,invalidOrigin=false,role="owner";
const s={
 from(table){
  assert.equal(table,"invoice_vipps_payments");
  const q={select(){return q;},eq(field,value){if(field==="invoice_id")wrongInvoice=value!==attempt.invoice_id;return q;},
   async maybeSingle(){return {data:wrongInvoice?null:{...attempt},error:null}}};
  return q;
 },
 async rpc(name,args){
  assert.equal(name,"sync_invoice_vipps");syncs++;
  assert.equal(args.p_reference,reference);assert.equal(args.p_state,"AUTHORIZED");
  assert.equal(args.p_captured,12500);
  attempt.refunded_ore=args.p_refunded;
  attempt.captured_ore=args.p_captured;
  invoice.paid_ore=args.p_captured-args.p_refunded;
  return {data:{...attempt},error:null};
 }
};
const lib=readFileSync("lib/invoiceVippsRefund.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const refund=new Function("createHash","getVippsPayment","refundVippsPayment","invoiceVippsReference","process",
 lib+";return refundInvoiceVipps;")(
 createHash,async()=>structuredClone(provider),
 async(unit,ref,amount,{idempotencyKey})=>{
  assert.equal(unit,"service");assert.equal(ref,reference);
  assert.match(idempotencyKey,/^inv-refund-[a-f0-9]{32}$/);
  assert.ok(amount>0&&amount<=12500);
  calls.push({amount,idempotencyKey});
  provider.aggregate.refundedAmount.value+=amount;
 },value=>value===reference,{env:{VERCEL_ENV:"production"}}
);
const request={reference,confirmedInvoiceNumber:"AS-WEB-TEST",amountOre:5000,expectedCapturedOre:12500,expectedRefundedOre:0};
await assert.rejects(refund(s,invoice,{...request,confirmedInvoiceNumber:"OTHER"}),/Bekreft riktig/);
await assert.rejects(refund(s,invoice,{...request,amountOre:15000}),/høyere enn tilgjengelig/);
await assert.rejects(refund(s,invoice,{...request,expectedCapturedOre:12000}),/har endret seg/);
assert.equal(calls.length,0,"Never refund for wrong amounts or invoice");
provider.aggregate.capturedAmount.currency="EUR";
await assert.rejects(refund(s,invoice,request),/ugyldige beløp/);
provider.aggregate.capturedAmount.currency="NOK";
const first=await refund(s,invoice,request);
assert.equal(first.refunded_ore,5000);
assert.equal(invoice.paid_ore,7500,"Partial refund decreases posted invoice payments");
assert.equal(calls.length,1);
await assert.rejects(refund(s,invoice,request),/har endret seg/,"Stale replay never refunds again");
assert.equal(calls.length,1);
const second=await refund(s,invoice,{...request,amountOre:7500,expectedRefundedOre:5000});
assert.equal(second.refunded_ore,12500);
assert.equal(invoice.paid_ore,0,"Full refund reverses the paid ledger balance");
assert.equal(calls.length,2);
assert.notEqual(calls[0].idempotencyKey,calls[1].idempotencyKey);
await assert.rejects(refund(s,invoice,{...request,amountOre:1,expectedRefundedOre:12500}),/høyere enn tilgjengelig/);
assert.equal(calls.length,2);
provider.aggregate.refundedAmount.value=0;attempt.refunded_ore=0;invoice.paid_ore=12500;
const wrongPayment={...attempt,invoice_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"};
const dbWrong={...s,from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:wrongPayment,error:null}}};return q;}};
await assert.rejects(refund(dbWrong,invoice,request),/tilhører ikke denne fakturaen/);
assert.equal(calls.length,2,"Never refund foreign invoice references");

// Owner-only permission and explicit refund action are enforced by the route.
const routeSource=readFileSync("app/api/admin/invoices/vipps/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"").replace(/^export /gm,"");
const NextResponse={json(body,opts={}){return {status:opts.status||200,body,headers:opts.headers||{}}}};
const routeDb={from(table){assert.equal(table,"invoice_drafts");const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:invoice,error:null}}};return q;}};
let refundRouteCalls=0;
const POST=new Function("NextResponse","getAdminUser","db","sameOriginGuard","vippsPublicPaymentsEnabled","startInvoiceVipps","reconcileInvoiceVipps","refundInvoiceVipps","invoiceVippsView","sendInvoiceVippsRefundNoticeIfNeeded",
 routeSource+";return POST;")(
 NextResponse,async()=>({role}),()=>routeDb,()=>invalidOrigin?{status:403}:null,()=>false,
 async()=>{throw Error("No payment start");},async()=>{throw Error("No capture from refunds");},
 async(_db,_invoice,body)=>{refundRouteCalls++;assert.equal(body.confirmedInvoiceNumber,invoice.invoice_number);return {state:"refunded",reference};},
 p=>p,async()=>({sent:true})
);
const payload={id:invoice.id,action:"refund",reference,amountOre:5000,expectedCapturedOre:12500,
 expectedRefundedOre:0,confirmedInvoiceNumber:invoice.invoice_number};
const call=()=>POST({json:async()=>payload});
role="staff";let res=await call();assert.equal(res.status,403);assert.equal(refundRouteCalls,0);
role="owner";invalidOrigin=true;res=await call();assert.equal(res.status,403);assert.equal(refundRouteCalls,0);
invalidOrigin=false;res=await call();assert.equal(res.status,200);assert.equal(refundRouteCalls,1);
const panel=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
assert.ok(panel.includes("refundablePayments.map"),"Refund entries are chosen per captured payment");
assert.ok(panel.includes('window.prompt("Skriv REFUNDER'),"Owner must type a final confirmation");
assert.ok(panel.includes("expectedRefundedOre:item.refundedOre"),"UI passes confirmed current provider snapshot");
assert.ok(panel.includes('action:"refund"'),"Refund API called only by direct user action");
console.log("Vipps fakturarefusjon bestått: eierkontroll, valutavalidering, beløpsgrenser, reversering i regnskap, del-/helrefusjon, stale replay og ingen ekte betaling.");
