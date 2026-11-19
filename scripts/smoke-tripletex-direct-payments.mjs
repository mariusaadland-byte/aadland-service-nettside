import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/tripletexPaymentSync.js").replace(/^export /gm,"");
const {paymentReadiness,paymentTypeList,paymentWriteParams}=
 new Function(source+";return {paymentReadiness,paymentTypeList,paymentWriteParams};")();
const baseline=new Date(Date.now()-3600000).toISOString();
const recent=new Date(Date.now()-60000).toISOString();
const older=new Date(Date.now()-7200000).toISOString();
const invoice={status:"sent",paid_ore:30000,credited_ore:0};
const link={invoice_gross_ore:100000,matched_outstanding_ore:100000,matched_at:baseline};
const payments=[{id:"new-1",amount_ore:30000,paid_on:"2026-11-19",recorded_at:recent,
 reversed_at:null,vipps_reference:null}];
const options={link,invoice,payments,transfers:[],remoteOutstandingOre:100000};
let ready=paymentReadiness(options);
assert.equal(ready.ok,true);
assert.equal(ready.next.id,"new-1");
assert.equal(ready.next.amountOre,30000);
assert.equal(ready.localOutstandingOre,70000);
assert.equal(paymentWriteParams(15,"2026-11-19",22,30000).amount,"300.00");
assert.deepEqual(paymentTypeList({values:[{id:7,name:"Bank",isActive:true},
 {id:9,description:"Vipps"},{id:10,name:"Hidden",isActive:false}]}),[
 {id:7,label:"Bank"},{id:9,label:"Vipps"}]);
assert.equal(paymentReadiness({...options,remoteOutstandingOre:70000}).ok,false,
 "Do not replay a payment already reflected remotely");
assert.equal(paymentReadiness({...options,transfers:[{status:"needs_review",payment_id:"new-1"}]}).ok,false,
 "An unknown provider result permanently blocks automatic retries");
assert.equal(paymentReadiness({...options,creditNotes:[{id:1}]}).ok,false);
assert.equal(paymentReadiness({...options,vippsPayments:[{state:"pending",refunded_ore:0}]}).ok,false);
assert.equal(paymentReadiness({...options,vippsPayments:[{state:"captured",refunded_ore:30000}]}).ok,false);
assert.equal(paymentReadiness({...options,payments:[{...payments[0],reversed_at:recent}]}).ok,false);
assert.equal(paymentReadiness({...options,payments:[{...payments[0],amount_ore:20000}]}).ok,false);
assert.equal(paymentReadiness({...options,payments:[{...payments[0],recorded_at:older}]}).ok,false,
 "Old imported payments must never be replayed");
const split=[{...payments[0],id:"new-1",amount_ore:20000,recorded_at:recent},
 {...payments[0],id:"new-2",amount_ore:10000,
  recorded_at:new Date(Date.now()-20000).toISOString()}];
ready=paymentReadiness({...options,payments:split});
assert.equal(ready.ok,true);
assert.equal(ready.next.id,"new-1");
ready=paymentReadiness({...options,payments:split,transfers:[
 {status:"confirmed",payment_id:"new-1",amount_ore:20000,payment_date:"2026-11-19"}],
 remoteOutstandingOre:80000});
assert.equal(ready.ok,true);
assert.equal(ready.next.id,"new-2");
assert.equal(paymentReadiness({...options,payments:split,transfers:[
 {status:"confirmed",payment_id:"new-1",amount_ore:20000,payment_date:"2026-11-19"}],
 remoteOutstandingOre:100000}).ok,false);
ready=paymentReadiness({...options,payments:split,transfers:[
 {status:"confirmed",payment_id:"new-1",amount_ore:20000,payment_date:"2026-11-19"},
 {status:"confirmed",payment_id:"new-2",amount_ore:10000,payment_date:"2026-11-19"}],
 remoteOutstandingOre:70000});
assert.equal(ready.ok,true);
assert.equal(ready.next,null);
// A new remote/local matched checkpoint means historical, already-confirmed
// payments must not prevent syncing a later new bank/Vipps payment.
const later=new Date(Date.now()-1000).toISOString();
const rebased=paymentReadiness({
 link:{...link,matched_at:new Date(Date.now()-15000).toISOString(),
  matched_outstanding_ore:70000},
 invoice:{...invoice,paid_ore:35000},
 payments:[...split,{...payments[0],id:"new-3",amount_ore:5000,recorded_at:later}],
 transfers:[
  {status:"confirmed",payment_id:"new-1",amount_ore:20000,payment_date:"2026-11-19"},
  {status:"confirmed",payment_id:"new-2",amount_ore:10000,payment_date:"2026-11-19"}],
 remoteOutstandingOre:70000
});
assert.equal(rebased.ok,true);
assert.equal(rebased.next.id,"new-3");
const api=read("app/api/admin/tripletex/invoices/payments/route.js");
assert.ok(api.includes('user?.role!=="owner"')&&api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(api.includes('body.confirmed!==true')&&api.includes('expectedRemoteOutstandingOre'));
assert.ok(api.includes('await tripletexRecordInvoicePayment('));
assert.ok(api.indexOf('.insert({')<api.indexOf('await tripletexRecordInvoicePayment('),
 "Claim must exist before irreversible remote PUT");
assert.ok(api.includes('status:"needs_review"')&&api.includes('error_code:"provider_outcome_unknown"'));
assert.ok(api.includes('verified.outstandingOre!==expected'));
assert.ok(api.includes('const justBefore=await tripletexRead('));
assert.ok(api.indexOf('const justBefore=await tripletexRead(')<
 api.indexOf('await tripletexRecordInvoicePayment('),
 "A fresh remote balance check must precede every irreversible payment");
assert.ok(!api.includes("tripletexCreateInvoice"),"Do not accidentally create a second invoice");
const helper=read("lib/tripletexApi.js");
assert.ok(helper.includes('"/:payment?paymentDate="')&&helper.includes('method:"PUT",sessionToken'));
const reconcile=read("app/api/admin/tripletex/invoices/reconcile/route.js");
assert.ok(reconcile.includes("matched_outstanding_ore:localOutstandingOre"));
assert.ok(reconcile.includes('["processing","needs_review"]'));
const ui=read("app/admin/faktura/mva/tripletex/TripletexSalesClient.js");
assert.ok(ui.includes("Kontroller og bokfør innbetaling"));
assert.ok(ui.includes("Bokfør denne innbetalingen i Tripletex"));
assert.ok(ui.includes('if(!window.confirm(confirmation))return;'));
const migration=read("supabase/migrations/20261119040000_tripletex_invoice_payments_api.sql");
assert.ok(migration.includes("tripletex_payment_one_unresolved_invoice"));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("revoke all"));
// Validate the actual URL, HTTP method and body-less success on a fake
// provider. No real network request, credentials or accounting write.
const apiSource=read("lib/tripletexApi.js")
 .replace(/^import "server-only";\s*/,"").replace(/^export /gm,"");
const {tripletexRecordInvoicePayment}=new Function(
 apiSource+";return {tripletexRecordInvoicePayment};")();
const requests=[];
const fakeFetch=async(url,options)=>{
 requests.push({url,options});
 return {ok:true,status:200};
};
const result=await tripletexRecordInvoicePayment(9876,"2026-11-19",42,12950,
 "mock-session-token","test",{fetcher:fakeFetch});
assert.equal(result.accepted,true);
assert.equal(requests.length,1);
assert.equal(requests[0].options.method,"PUT");
assert.ok(requests[0].url.endsWith(
 "/invoice/9876/:payment?paymentDate=2026-11-19&paymentTypeId=42&paidAmount=129.50"));
assert.equal(requests[0].options.body,undefined);
await assert.rejects(()=>tripletexRecordInvoicePayment(-1,"2026-11-19",42,12950,
 "mock-session-token","test",{fetcher:fakeFetch}));
assert.equal(requests.length,1,"Invalid payment must not contact Tripletex");
console.log("Direkte Tripletex-betalinger bestått: importhistorikk, Vipps, beløp, sekvens, ukjent utfall, påkrevd bekreftelse, eier, RLS og mock API uten ekte føring.");
