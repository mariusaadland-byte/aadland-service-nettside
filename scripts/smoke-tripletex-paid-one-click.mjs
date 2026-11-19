import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helper=read("lib/tripletexPaidInvoiceFlow.js").replace(/^export /gm,"");
const {transferTripletexInvoiceAsPaid}=new Function(helper+
 ";return {transferTripletexInvoiceAsPaid};")();
const invoiceId="11111111-1111-4111-8111-111111111111";
const payment1="22222222-2222-4222-8222-222222222222";
const payment2="33333333-3333-4333-8333-333333333333";
const digest="a".repeat(64);
const resp=(data,status=200)=>({ok:status<400,status,json:async()=>data});

function mockRun({failAt=null,multi=false}={}){
 const requests=[],events=[];
 let booked=0;
 const payments=multi?[
  {id:payment1,source:"bank",amountOre:200000,paidOn:"2026-11-01"},
  {id:payment2,source:"vipps",amountOre:735838,paidOn:"2026-11-12"}
 ]:[{id:payment1,source:"bank",amountOre:935838,paidOn:"2026-11-12"}];
 const fetcher=async(url,options={})=>{
  requests.push({url,method:options.method||"GET",body:options.body?JSON.parse(options.body):null});
  const route="/api/admin/tripletex/invoices/payments";
  if(url==="/api/admin/tripletex/invoices/direct"){
   assert.equal(options.method,"POST");
   assert.deepEqual(JSON.parse(options.body),{
    action:"transfer",confirmed:true,invoiceId,digest});
   if(failAt==="invoice")throw Error("Transport connection interrupted");
   return resp({ok:true,status:"confirmed",tripletexInvoiceId:222,
    tripletexInvoiceNumber:99,sourceNumber:"AS-WEB-2026-000001"});
  }
  if(url===route+"?invoiceId="+invoiceId){
   if(failAt==="read"&&booked===0)throw Error("Unavailable");
   if(booked<payments.length)return resp({ok:true,ready:true,
    next:payments[booked],remainingCount:payments.length-booked,
    remoteOutstandingOre:935838-payments.slice(0,booked)
     .reduce((n,p)=>n+p.amountOre,0),
    localOutstandingOre:0});
   return resp({ok:true,ready:false,remainingCount:0,
    remoteOutstandingOre:0,localOutstandingOre:0});
  }
  if(url===route){
   if(failAt==="payment"&&booked===0)return resp(
    {error:"Provider outcome uncertain; DO NOT retry"},409);
   const body=JSON.parse(options.body),expected=payments[booked];
   assert.equal(body.action,"record");
   assert.equal(body.confirmed,true);
   assert.equal(body.paymentId,expected.id);
   assert.equal(body.paymentTypeId,expected.source==="bank"?17:21);
   assert.equal(body.expectedRemoteOutstandingOre,935838-payments
    .slice(0,booked).reduce((n,p)=>n+p.amountOre,0));
   // The provider/payment API keeps the historical date on the server,
   // rather than using the current browser date.
   assert.equal(Object.hasOwn(body,"paymentDate"),false);
   booked++;
   return resp({ok:true,paymentId:expected.id,amountOre:expected.amountOre});
  }
  if(url==="/api/admin/tripletex/invoices/reconcile"){
   assert.equal(JSON.parse(options.body).action,"check");
   return resp({ok:true,comparison:failAt==="reconcile"?"difference":"match"});
  }
  throw Error("Unexpected endpoint "+url);
 };
 return {requests,events,fetcher,payments};
}
const single=mockRun();
const first=await transferTripletexInvoiceAsPaid({
 invoiceId,digest,paymentCount:1,paymentTypesBySource:{bank:"17"},
 fetcher:single.fetcher,
 onCreated:data=>single.events.push("created "+data.tripletexInvoiceId),
 onPayment:(n,total)=>single.events.push("payment "+n+"/"+total)
});
assert.equal(first.created.tripletexInvoiceId,222);
assert.equal(first.posted,1);
assert.equal(first.matched,true);
assert.deepEqual(single.events,["created 222","payment 1/1"]);
assert.deepEqual(single.requests.map(x=>[x.method,x.url.split("?")[0]]),[
 ["POST","/api/admin/tripletex/invoices/direct"],
 ["GET","/api/admin/tripletex/invoices/payments"],
 ["POST","/api/admin/tripletex/invoices/payments"],
 ["GET","/api/admin/tripletex/invoices/payments"],
 ["POST","/api/admin/tripletex/invoices/reconcile"]
]);
const multi=mockRun({multi:true});
const second=await transferTripletexInvoiceAsPaid({
 invoiceId,digest,paymentCount:2,paymentTypesBySource:{bank:"17",vipps:"21"},
 fetcher:multi.fetcher
});
assert.equal(second.posted,2);
assert.equal(multi.requests.filter(x=>x.method==="POST"&&
 x.url==="/api/admin/tripletex/invoices/payments").length,2);
for(const failAt of ["invoice","read","payment","reconcile"]){
 const failed=mockRun({failAt});
 await assert.rejects(
  ()=>transferTripletexInvoiceAsPaid({invoiceId,digest,paymentCount:1,
    paymentTypesBySource:{bank:"17"},fetcher:failed.fetcher}),
  e=>{assert.equal(e.invoiceAttempted,true);
   assert.match(e.message,/Ikke opprett fakturaen/);
   if(failAt!=="invoice")assert.equal(e.invoiceCreated,true);
   return true;});
 assert.equal(failed.requests.filter(x=>x.url==="/api/admin/tripletex/invoices/direct").length,1);
 assert.equal(failed.requests.filter(x=>x.method==="POST"&&
  x.url==="/api/admin/tripletex/invoices/payments").length<=1,true);
}
await assert.rejects(()=>transferTripletexInvoiceAsPaid({invoiceId,
 digest:"invalid",paymentCount:1,paymentTypesBySource:{bank:"17"}}));
const paymentTypesRoute=read("app/api/admin/tripletex/invoices/payment-types/route.js");
assert.ok(paymentTypesRoute.includes('user?.role!=="owner"'));
assert.ok(paymentTypesRoute.includes('"/invoice/paymentType?count=1000"'));
assert.ok(!paymentTypesRoute.includes('tripletexRecordInvoicePayment'));
const preview=read("app/api/admin/tripletex/invoices/direct/route.js");
assert.ok(preview.includes("paymentSources:preview.paymentSources"));
const ui=read("app/admin/faktura/mva/tripletex/TripletexApiConnectClient.js");
assert.ok(ui.includes("Overfør som betalt"));
assert.ok(ui.includes('onClick={()=>checkDirectPilot("transferPaid")}'));
assert.ok(ui.includes("transferTripletexInvoiceAsPaid({"));
assert.ok(ui.includes('if(!window.confirm(prompt))return;'));
assert.ok(ui.includes('setInvoiceOptions(old=>old.filter(x=>x.id!==invoiceId))'));
assert.ok(ui.includes("Tripletex-betalingstype"));
assert.ok(ui.includes("Kontroller direkteoverføring (kun lesing)"));
console.log("Tripletex ett-klikk som betalt bestått: én/ulike betalingstyper, opprinnelig betalingsdato, rekkefølge, full saldoavstemming, avbrudd og duplikatsperre. Ingen ekte API-kall.");
