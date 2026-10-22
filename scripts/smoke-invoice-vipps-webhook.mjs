import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";

const ref="INV-12345678-1234-1234-1234-123456789abc";
const request={
 reference:ref,pspReference:"test-psp",name:"AUTHORIZED",msn:"MSN-TEST",
 idempotencyKey:"test-event",amount:{currency:"NOK",value:12500},success:true
};
let paymentsEnabled=true,authenticatedUnit="service",authQueries=0,verified=0;
let invoiceSyncs=0,genericCalls=0,receiptFailures=1,realReceiptSent=false;
const db=()=>({
 async rpc(name,args){
  if(name==="get_vipps_webhook_auth"){
   authQueries++;
   return {data:{
    secret:"fake-webhook-secret",unit:authenticatedUnit,msn:"MSN-TEST"
   },error:null};
  }
  if(name==="process_vipps_payment_event_once"){
   genericCalls++;
   return {data:{duplicate:false},error:null};
  }
  throw Error("Unexpected RPC: "+name);
 }
});
const NextResponse={json(body,opts={}){return {body,status:opts.status??200,headers:opts.headers||{}}}};
const reconcile=async(_db,reference)=>{
 assert.equal(reference,ref);
 invoiceSyncs++;
 if(receiptFailures-- >0)return {state:"paid",receipt_error:"temporary email delivery failure",receipt_sent_at:null};
 realReceiptSent=true;
 return {state:"paid",receipt_error:"",receipt_sent_at:"2026-10-22T12:00:00Z"};
};
const source=readFileSync("app/api/vipps/webhook/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export /gm,"");
const webhook=new Function(
 "NextResponse","invoiceVippsReference","reconcileInvoiceVipps","db","vippsPaymentsEnabled",
 "verifyVippsWebhookRequest","sendVippsPaymentReceiptIfNeeded",
 "sendVippsRefundNoticeIfNeeded","sendPaidRentalConfirmationIfNeeded",
 source+";return POST;"
)(
 NextResponse,value=>/^INV-[0-9a-f-]{36}$/.test(value),reconcile,db,()=>paymentsEnabled,
 (req,raw,secret)=>{
  verified++;assert.equal(secret,"fake-webhook-secret");
  return req.headers.get("test-valid-signature")==="yes"?{ok:true}:{ok:false,error:"invalid"};
 },
 async()=>({sent:false}),async()=>({sent:false}),async()=>({sent:false})
);
function req(body=request,opts={}){
 const headers=new Map([["webhook-id","test-hook"],["test-valid-signature","yes"],...Object.entries(opts.headers||{})]);
 if(opts.noWebhookId)headers.delete("webhook-id");
 return {headers:{get:key=>headers.get(key)||null},text:async()=>opts.rawBody??JSON.stringify(body)};
}
let response;
paymentsEnabled=false;response=await webhook(req());assert.equal(response.status,503);assert.equal(authQueries,0);
paymentsEnabled=true;response=await webhook(req(request,{noWebhookId:true}));assert.equal(response.status,401);
response=await webhook(req(request,{headers:{"test-valid-signature":"no"}}));
assert.equal(response.status,401);assert.equal(invoiceSyncs,0,"Reject unsigned invoice payment");
response=await webhook(req(request,{rawBody:"invalid"}));assert.equal(response.status,400);
authenticatedUnit="rental";
response=await webhook(req());assert.equal(response.status,409,"Invoice references never handled by rental webhook");
assert.equal(genericCalls,0);assert.equal(invoiceSyncs,0);
authenticatedUnit="service";
response=await webhook(req({...request,msn:"SOMEONE-ELSE"}));assert.equal(response.status,401);
response=await webhook(req({...request,amount:{currency:"EUR",value:12500}}));
assert.equal(response.status,400,"Reject foreign currency");
assert.equal(invoiceSyncs,0);
response=await webhook(req());
assert.equal(response.status,503,"Retry transient receipt failures");
assert.equal(invoiceSyncs,1);
response=await webhook(req());
assert.equal(response.status,200,"Retry same callback without new payment");
assert.equal(invoiceSyncs,2);assert.equal(genericCalls,0);assert.equal(realReceiptSent,true);
const statusSource=readFileSync("app/api/invoice-vipps-status/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const statusHandler=new Function("NextResponse","db","rateLimitRequest","sameOriginGuard","invoiceVippsReference","reconcileInvoiceVipps",statusSource+";return POST;")(
 NextResponse,db,async()=>null,()=>null,value=>/^INV-[0-9a-f-]{36}$/.test(value),
 async(_db,reference)=>{assert.equal(reference,ref);return {state:"paid",receipt_sent_at:"2026-10-22T12:00:00Z",customer:{email:"private@example.invalid"}};}
);
response=await statusHandler({json:async()=>({reference:"invalid"})});
assert.equal(response.status,400);
response=await statusHandler({json:async()=>({reference:ref})});
assert.equal(response.status,200);assert.deepEqual(response.body,{status:"paid",receiptSent:true});
assert.equal(response.headers["Cache-Control"],"no-store");
assert.ok(!JSON.stringify(response.body).includes("private@example.invalid"));
// Verify real HMAC signature checks as a separate, fully local cryptographic
// test. No provider network call or real payment is performed.
const verifySource=readFileSync("lib/vippsWebhook.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace("export function verifyVippsWebhookRequest","function verifyVippsWebhookRequest");
const verifySignature=new Function("crypto",verifySource+";return verifyVippsWebhookRequest;")(crypto);
const body=JSON.stringify(request);
const url="https://www.aadland-service.no/api/vipps/webhook";
const host="www.aadland-service.no",date="Thu, 22 Oct 2026 10:00:00 GMT",secret="unit-test-secret";
const hash=crypto.createHash("sha256").update(body,"utf8").digest("base64");
const signed="POST\n/api/vipps/webhook\n"+date+";"+host+";"+hash;
const hmac=crypto.createHmac("sha256",secret).update(signed,"utf8").digest("base64");
const auth="HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature="+hmac;
const headers={
 "x-ms-date":date,"x-ms-content-sha256":hash,"authorization":auth,"host":host,
 "x-vipps-authorization":auth
};
const signedReq={url,headers:{get:key=>headers[key]||null}};
assert.equal(verifySignature(signedReq,body,secret).ok,true,"Correct HMAC signature accepted");
assert.equal(verifySignature(signedReq,body+" ",secret).ok,false,"Tampered body rejected");
assert.equal(verifySignature(signedReq,body,secret+"-wrong").ok,false,"Incorrect unit secret rejected");
assert.equal(verifySignature({...signedReq,url:url+"?foo=bar"},body,secret).ok,false,"Unexpected URL or query rejected");
assert.equal(verifySignature({url,headers:{get:key=>key==="x-vipps-authorization"?"forged":headers[key]}},body,secret).ok,false,"Conflicting auth headers rejected");
assert.equal(verifySignature({url,headers:{get:key=>key==="x-ms-date"?null:headers[key]}},body,secret).ok,false,"Unsigned requests rejected");
console.log("Vipps webhook og kundestatus bestått: signatur, MSN, NOK, korrekt enhet, kvitteringsretry uten dobbel betaling og personvern.");
