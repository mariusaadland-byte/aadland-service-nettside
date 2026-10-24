import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const active=[
 {reference:"INV-active",state:"pending",captured_ore:0,refunded_ore:0},
 {reference:"INV-overlap",state:"paid",captured_ore:5000,refunded_ore:0}
];
const settled=[
 {reference:"INV-refunded",state:"paid",captured_ore:12500,refunded_ore:0},
 {reference:"INV-overlap",state:"paid",captured_ore:5000,refunded_ore:0},
 {reference:"INV-unchanged",state:"paid",captured_ore:9800,refunded_ore:0}
];
let queryError=false,invoiceQueries=0;
const calls={},allQueryDetails=[];
const s={from(table){
 let kind="other";const q={
  select(){return q},
  eq(){return q},gt(){return q},is(){return q},neq(){return q},
  or(filter){if(table==="invoice_vipps_payments"){kind="active";assert.match(filter,/pending,authorized/);}return q},
  in(field,values){assert.equal(table,"invoice_vipps_payments");assert.equal(field,"state");assert.deepEqual(values,["paid","partial","refunded","cancelled"]);kind="settled";return q},
  gte(field,value){assert.equal(field,"created_at");const ms=Date.parse(value);
   assert.ok(Math.abs((Date.now()-ms)/86400000-180)<0.02,"Only check recent settlements");return q},
  order(field,opts){if(table==="invoice_vipps_payments"){assert.equal(field,"updated_at");assert.equal(opts.ascending,true);}return q},
  limit(n){if(table==="invoice_vipps_payments")assert.equal(n,25,"Bound provider traffic");return q},
  then(resolve,reject){
   if(table==="invoice_vipps_payments"){
    allQueryDetails.push(kind);invoiceQueries++;
    const response=kind==="active"?{data:active,error:null}:kind==="settled"?
     queryError?{data:null,error:{message:"Simulated db error"}}:{data:settled,error:null}:
     {data:[],error:null};
    return Promise.resolve(response).then(resolve,reject);
   }
   return Promise.resolve({data:[],error:null}).then(resolve,reject);
  }
 };
 return q;
}};
const source=readFileSync("app/api/cron/payment-receipts/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const NextResponse={json:(body,options={})=>({status:options.status||200,body})};
const reconcile=async(_db,reference)=>{
 calls[reference]=(calls[reference]||0)+1;
 if(reference==="INV-refunded")return {state:"partial",captured_ore:12500,refunded_ore:2500,receipt_sent_at:"2026-10-20T12:00:00Z"};
 if(reference==="INV-unchanged")return {state:"paid",captured_ore:9800,refunded_ore:0,receipt_sent_at:"2026-10-20T12:00:00Z"};
 if(reference==="INV-overlap")return {state:"paid",captured_ore:5000,refunded_ore:0,receipt_sent_at:"2026-10-20T12:00:00Z"};
 if(reference==="INV-active")return {state:"pending",captured_ore:0,refunded_ore:0,receipt_sent_at:null};
 throw Error("Unexpected reference");
};
const handler=new Function("NextResponse","cronGuard","reconcileInvoiceVipps","db",
 "sendVippsPaymentReceiptIfNeeded","sendVippsRefundNoticeIfNeeded","sendPaidRentalConfirmationIfNeeded","sendInvoiceVippsRefundNoticeIfNeeded",
 source+";return GET;")(
 NextResponse,()=>null,reconcile,()=>s,async()=>({sent:false}),async()=>({sent:false}),async()=>({sent:false}),async()=>({sent:false,reason:"nothing-pending"})
);
const originalConsole=console.error;console.error=()=>{};
try{
 const ok=await handler({});
 assert.equal(ok.status,200);
 assert.equal(ok.body.ok,true);
 assert.equal(ok.body.invoice.checked,4,"Duplicate reference in two queries must be processed once");
 assert.equal(ok.body.invoice.settledRechecked,2,"Only uniquely settled rows count as rechecks");
 assert.equal(ok.body.invoice.settlementChanges,1,"Capture/refund changes are counted");
 assert.equal(ok.body.invoice.refundsDetected,1,"Delayed refund must be detected");
 assert.equal(ok.body.invoice.receiptConfirmed,3);
 assert.equal(calls["INV-overlap"],1,"Do not run provider reconciliation twice for an overlapping payment");
 assert.deepEqual(allQueryDetails.sort(),["active","settled"]);
 queryError=true;
 const error=await handler({});
 assert.equal(error.status,503,"Failed settled query must surface as failure");
 assert.equal(error.body.ok,false);
 assert.equal(error.body.failed,1);
 assert.equal(error.body.failures[0].type,"invoice-settled-query");
 assert.equal(error.body.invoice.checked,2,"Still process pending payments if recent-settled query fails");
}finally{console.error=originalConsole;}
const sql=readFileSync("supabase/migrations/20261021220229_invoice_vipps_ledger_id.sql","utf8");
assert.ok(sql.includes("net=p_captured-p_refunded"),"Provider net must deduct refunds");
assert.ok(sql.includes("reversed_at=now()"),"Existing invoice ledger record must be reversed when refund changes net");
assert.ok(sql.includes("update public.invoice_drafts set paid_ore=paid"),"Invoice paid balance must be recomputed");
console.log("Vipps etterkontroll bestått: savnede refusjoner, daglig rotasjon, duplikatvern, restsaldo og feilvarsling.");
