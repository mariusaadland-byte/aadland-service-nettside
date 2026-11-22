import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";
const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261122015000_s25_service_order_idempotency.sql");
for(const term of [
 "create unique index if not exists s25_order_request_key_unique",
 "pg_catalog.pg_advisory_xact_lock",
 "checkout_request_fingerprint<>p_fingerprint",
 "create_custom_order_with_contact_images",
 "create_order_with_stock",
 "create function public.claim_service_order_vipps(",
 "checkout_provider_state='not_started'",
 "create function public.complete_service_order_vipps(",
 "create function public.hold_service_order_vipps(",
 "S25_ORDER_INTENT_CONFLICT",
 "revoke all on function public.create_service_order_once(uuid,text,jsonb,jsonb,jsonb)",
 "to service_role"
])assert.ok(sql.includes(term),"S25 DB invariant missing: "+term);
assert.ok(read("scripts/sql-s25-order-idempotency-rollback.sql").includes("S25_ROLLBACK_OK"));

const intentSource=read("lib/orderIntent.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {parseOrderIntent,existingServiceOrderResponse}=new Function("crypto",intentSource+
 ";return {parseOrderIntent,existingServiceOrderResponse};")(crypto);
const requestId=()=>crypto.randomUUID();
assert.ok(parseOrderIntent({idempotencyKey:requestId()}).hash);
assert.match(parseOrderIntent({idempotencyKey:"invalid"}).error,/bestillingsnøkkel/);
const k=requestId();
assert.equal(parseOrderIntent({idempotencyKey:k,a:{z:2,y:1}}).hash,
 parseOrderIntent({idempotencyKey:k,a:{y:1,z:2}}).hash,
 "JSON key order must not change the request identity");
const payed={order_number:"S25-PAID",status:"new",checkout_request_fingerprint:"a".repeat(64),
 checkout_provider_state:"ready",checkout_redirect_url:"https://vipps.test/redirect",
 payment_provider:"vipps",payment_status:"paid"};
assert.equal(existingServiceOrderResponse(payed,"a".repeat(64)).payload.payment.redirectUrl,undefined,
 "Already paid must NEVER be redirected for payment again");
assert.equal(existingServiceOrderResponse(payed,"b".repeat(64)).status,409);

const src=read("app/api/orders/route.js")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace(/^export async function POST\(/gm,"async function POST(");
const NextResponse={json:(payload,{status=200,headers={}}={})=>({payload,status,headers})};
const product={id:"s25-stock",name:"Syntetisk",inventoryMode:"stock",
 stockQuantity:10,active:true,basePriceOre:200000,shippingPriceOre:0,shippable:false,options:[]};
let records=[],stock=10,vippsCalls=0,claimCalls=0,completeCalls=0,
 heldCalls=0,mailCalls=0,providerFails=false,originDenied=false,dbCalls=0,createdCalls=0;
function findOrder(filter){return records.find(o=>Object.entries(filter).every(([k,v])=>o[k]===v))||null}
function database(){
 dbCalls++;
 return {
  from(table){
   const filters={},query={
    select(){return query},
    eq(field,value){filters[field]=value;return query},
    in(field,ids){
     assert.equal(table,"products");assert.equal(field,"id");
     return Promise.resolve({data:ids.includes(product.id)?[{...product,stockQuantity:stock}]:[],error:null});
    },
    async single(){return {data:findOrder(filters),error:null}},
    async maybeSingle(){return {data:findOrder(filters),error:null}},
    update(values){query.patch=values;return query},
    then(resolve,reject){
     if(table!=="orders")throw Error("Unexpected table for update");
     const o=findOrder(filters);if(o&&query.patch)Object.assign(o,query.patch);
     return Promise.resolve({data:o,error:null}).then(resolve,reject);
    }
   };
   if(!["orders","products"].includes(table))throw Error("Unexpected table "+table);
   return query;
  },
  async rpc(name,args){
   if(name==="create_service_order_once"){
    createdCalls++;
    const existing=findOrder({checkout_request_key:args.p_key});
    if(existing){
     if(existing.checkout_request_fingerprint!==args.p_fingerprint)
      return {data:null,error:{message:"S25_ORDER_INTENT_CONFLICT"}};
     return {data:{order_id:existing.id,existing:true},error:null};
    }
    const amount=args.p_stock_requests.reduce((sum,row)=>sum+row.quantity,0);
    if(amount>stock)return {data:null,error:{message:"INSUFFICIENT_STOCK:s25-stock"}};
    stock-=amount;
    const record={...args.p_order_record,id:requestId(),
     checkout_request_key:args.p_key,
     checkout_request_fingerprint:args.p_fingerprint,
     checkout_provider_state:args.p_order_record.payment_provider==="vipps"?"not_started":"not_applicable",
     checkout_redirect_url:null,confirmation_sent_at:null};
    records.push(record);
    return {data:{order_id:record.id,existing:false},error:null};
   }
   if(name==="claim_service_order_vipps"){
    claimCalls++;
    const o=findOrder({checkout_request_key:args.p_key,checkout_request_fingerprint:args.p_fingerprint});
    if(!o||o.checkout_provider_state!=="not_started")return {data:null,error:null};
    o.checkout_provider_state="creating";
    return {data:{order_id:o.id,reference:o.order_number},error:null};
   }
   if(name==="complete_service_order_vipps"){
    completeCalls++;
    const o=findOrder({checkout_request_key:args.p_key});
    if(!o||o.checkout_provider_state!=="creating")return {data:null,error:{message:"not claimed"}};
    o.checkout_provider_state="ready";
    o.checkout_redirect_url=args.p_redirect_url;
    o.payment_psp_reference=args.p_psp_reference;
    return {data:{ready:true},error:null};
   }
   if(name==="hold_service_order_vipps"){
    heldCalls++;
    const o=findOrder({checkout_request_key:args.p_key});
    if(o&&o.checkout_provider_state==="creating")o.checkout_provider_state="needs_review";
    return {data:{held:true},error:null};
   }
   if(name==="cancel_product_order_once"){
    throw Error("No cancellation should happen from uncertain Vipps status");
   }
   throw Error("Unexpected rpc "+name);
  }
 };
}
const env={env:{VERCEL_ENV:"production",RESEND_API_KEY:"",
 NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no"}};
const POST=new Function("rateLimitRequest","sameOriginGuard","NextResponse","crypto",
 "getCustomerUserId","db","fromDbProduct","productPrice",
 "buildOrderConfirmationEmail","createVippsPayment","vippsUnitReadiness",
 "serviceEmailFrom","serviceReplyTo","validateContactImageReceipts",
 "parseOrderIntent","existingServiceOrderResponse","process",
 src+";return POST;")(
 async()=>null,()=>originDenied?NextResponse.json({error:"wrong origin"},{status:403}):null,
 NextResponse,crypto,async()=>null,database,p=>p,p=>p.basePriceOre,
 ()=>"<p>Never sent</p>",
 async ({reference,amountOre})=>{
  vippsCalls++;
  assert.equal(amountOre,200000);
  assert.ok(reference.startsWith("AS-"));
  if(providerFails)throw Error("Synthetic Resend/Vipps timeout");
  return {redirectUrl:"https://example.invalid/vipps/mock-"+reference,
   pspReference:"synthetic-psp"};
 },async()=>({ready:true}),()=>"",()=>"",()=>[],parseOrderIntent,existingServiceOrderResponse,env
);
const body=(key=requestId(),paymentMethod="vipps")=>({
 orderType:"order",idempotencyKey:key,acceptedTerms:true,paymentMethod,
 items:[{productId:product.id,quantity:1}],
 fulfillmentType:"pickup",
 customer:{name:"Test",email:"nobody@example.invalid",phone:"00000000"}
});
const post=async b=>POST({
 url:"https://www.aadland-service.no/api/orders",
 json:async()=>b
});
const key=requestId(),first=body(key);
let result=await post(first);
assert.equal(result.status,200,JSON.stringify(result.payload));
assert.equal(result.payload.payment.method,"vipps");
assert.equal(records.length,1);
assert.equal(stock,9);
assert.equal(vippsCalls,1);
assert.equal(claimCalls,1);
assert.equal(completeCalls,1);
const number=records[0].order_number;
result=await post({...first});
assert.equal(result.status,200);
assert.equal(result.payload.alreadyRecorded,true);
assert.equal(result.payload.orderNumber,number);
assert.equal(result.payload.payment.redirectUrl,records[0].checkout_redirect_url);
assert.equal(stock,9,"Replay must not reserve stock twice");
assert.equal(records.length,1);
assert.equal(vippsCalls,1,"Replay must never create another Vipps payment");
const changed={...first,items:[{productId:product.id,quantity:2}]};
result=await post(changed);
assert.equal(result.status,409);
assert.equal(result.payload.intentConflict,true);
assert.equal(records.length,1);

const manualKey=requestId(),manual=body(manualKey,"manual");
result=await post(manual);
assert.equal(result.status,200);
assert.equal(result.payload.payment.method,"manual");
assert.equal(records.length,2);
assert.equal(stock,8);
result=await post({...manual});
assert.equal(result.status,200);
assert.equal(result.payload.alreadyRecorded,true);
assert.equal(stock,8);

const timedKey=requestId();
providerFails=true;
result=await post(body(timedKey));
assert.equal(result.status,202,"Unknown provider status returns existing order, not a new one");
assert.equal(result.payload.payment.pending,true);
assert.equal(stock,7);
assert.equal(heldCalls,1);
assert.equal(vippsCalls,2);
result=await post(body(timedKey));
assert.equal(result.status,202);
assert.equal(vippsCalls,2,"Never retry ambiguous provider creation");
assert.equal(stock,7,"Never reserve stock twice after payment timeout");
providerFails=false;
result=await post(body(timedKey));
assert.equal(result.status,202);
assert.equal(records.length,3);

const concurrentKey=requestId();
const concurrentBody=body(concurrentKey);
const pair=await Promise.all([post(concurrentBody),post({...concurrentBody})]);
assert.ok(pair.every(r=>[200,202].includes(r.status)));
assert.equal(records.length,4);
assert.equal(stock,6);
assert.equal(vippsCalls,3,"Two concurrent requests must launch external Vipps once");

const before=records.length;
result=await post({...body(),idempotencyKey:"not-a-uuid"});
assert.equal(result.status,400);
assert.equal(records.length,before);
originDenied=true;
result=await post(body());
assert.equal(result.status,403);
assert.equal(records.length,before);
originDenied=false;
env.env.VERCEL_ENV="preview";
result=await post(body());
assert.equal(result.status,403,"Preview cannot create real Service orders or payments");
assert.equal(records.length,before);
env.env.VERCEL_ENV="production";

const client=read("lib/clientOrderIntent.js");
const productUI=read("app/produkter/[slug]/page.js");
const homeUI=read("app/HomeClient.js");
assert.ok(client.includes("sessionStorage")&&client.includes("crypto")===false||client.includes("api.subtle"));
assert.ok(client.includes("fallbackIntents"));
assert.ok(productUI.includes("orderSendingRef.current=true"));
assert.ok(productUI.includes("getCheckoutIntent(payload,intentStorageKey)"));
assert.ok(homeUI.includes("contactReceiptRef.current"));
assert.ok(homeUI.includes('getCheckoutIntent(payload,"aadland-custom-order-v1")'));
assert.ok(homeUI.includes("imageReceipts"));
assert.equal(mailCalls,0);
console.log("S-25 bestått: replay preserves order and stock, conflicting payload rejected, Vipps created only once, uncertain timeout holds order, parallel calls deduplicated, browser retains intent; synthetic data only.");
