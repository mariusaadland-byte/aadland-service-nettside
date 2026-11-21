import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";

const read=p=>readFileSync(p,"utf8");
const migration=read("supabase/migrations/20261121182500_s22_stock_vipps_order_metadata.sql");
const routeSource=read("app/api/orders/route.js");
const adminSource=read("app/api/admin/orders/route.js");
const adminUi=read("app/admin/AdminClient.js");

for(const field of [
 "payment_provider,payment_reference,vipps_checkout_started_at",
 "provider,reference,checkout_at",
 "INVALID_VIPPS_ORDER_REFERENCE",
 "INSUFFICIENT_STOCK",
 "stock_quantity=stock_quantity-requested_quantity",
 "grant execute on function public.create_order_with_stock(jsonb,jsonb) to service_role",
 "revoke all on function public.create_order_with_stock(jsonb,jsonb) from public,anon,authenticated"
])assert.ok(migration.includes(field),"Missing atomic stock+Vipps safeguard "+field);
assert.ok(routeSource.includes("createdOrder.payment_provider!==\"vipps\""));
assert.ok(routeSource.includes("createdOrder.payment_reference!==orderNumber"));
assert.ok(routeSource.includes("SERVICE ORDER STOCK RELEASE NEEDS REVIEW"));
assert.ok(routeSource.includes('s.rpc("cancel_product_order_once"'));
assert.ok(adminUi.includes("Historisk avvik: Ordren er avsluttet og arkivert, men betalingen er ikke ferdig avstemt"));
assert.ok(adminSource.includes('order.status==="completed"&&["pending","unpaid","partial","authorized"].includes(paymentStatus)'));
assert.ok(adminSource.includes('"action === "archive"')||adminSource.includes('action === "archive"'));

const cleaned=routeSource.replace(/^import .*;\n/gm,"").replace(/^export async function POST\(/gm,"async function POST(");
const response={json:(body,{status=200}={})=>({body,status})};
const stockProduct={
 id:"s22-stock-demo",active:true,inventoryMode:"stock",stockQuantity:5,
 options:[],shippable:false,basePriceOre:150000,shippingPriceOre:0,name:"Testprodukt"
};
let mockOrder=null,stockCalls=[],cancellations=0,vippsCalls=0,vippsStamp=0;
let dropMetadata=false,oversell=false;
const db=()=>({from(table){
 if(table==="products"){
  const query={select(){return query},async in(_key,ids){
   assert.deepEqual(ids,["s22-stock-demo"]);
   return {data:[stockProduct],error:null};
  }};
  return query;
 }
 if(table==="orders"){
  const query={
   select(){return query},
   eq(name,value){assert.equal(name,"order_number");assert.equal(value,mockOrder?.order_number);return query;},
   async single(){return {data:mockOrder&&{
     id:mockOrder.id,payment_provider:mockOrder.payment_provider,
     payment_reference:mockOrder.payment_reference,
     vipps_checkout_started_at:mockOrder.vipps_checkout_started_at
    },error:null};},
   update(patch){Object.assign(mockOrder,patch);
    return {async eq(){if(patch.payment_psp_reference)vippsStamp++;return {error:null}}};
   },
   async insert(row){mockOrder={...row,id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001"};return {error:null}}
  };
  return query;
 }
 throw Error("Unexpected table "+table);
},async rpc(name,args){
 if(name==="create_order_with_stock"){
  stockCalls.push(args);
  if(oversell)return {data:null,error:{message:"INSUFFICIENT_STOCK:s22-stock-demo"}};
  mockOrder={...args.order_record,id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001"};
  if(dropMetadata){
   mockOrder.payment_provider=null;
   mockOrder.payment_reference=null;
   mockOrder.vipps_checkout_started_at=null;
  }
  return {data:mockOrder.id,error:null};
 }
 if(name==="cancel_product_order_once"){
  cancellations++;
  mockOrder.status="cancelled";
  return {data:{ok:true,releasedItems:1},error:null};
 }
 throw Error("Unexpected RPC "+name);
}});
const env={env:{
 VERCEL_ENV:"production",RESEND_API_KEY:"",NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no"
}};
const POST=new Function("rateLimitRequest","sameOriginGuard","NextResponse","crypto",
 "getCustomerUserId","db","fromDbProduct","productPrice",
 "buildOrderConfirmationEmail","createVippsPayment","vippsUnitReadiness",
 "serviceEmailFrom","serviceReplyTo","validateContactImageReceipts","process",
 cleaned+";return POST;")(
 async()=>null,()=>null,response,crypto,async()=>null,db,p=>p,
 p=>p.basePriceOre,()=>"<p>Not sent</p>",
 async({reference,amountOre})=>{
  vippsCalls++;
  assert.equal(reference,mockOrder.order_number);
  assert.equal(amountOre,300000);
  return {redirectUrl:"https://example.invalid/no-real-payment",pspReference:"mock-s22-psp"};
 },
 async()=>({ready:true}),()=>"",()=>"",()=>[],env
);
const body=()=>({
 orderType:"order",acceptedTerms:true,paymentMethod:"vipps",
 items:[{productId:"s22-stock-demo",quantity:2}],
 fulfillmentType:"pickup",
 customer:{name:"S22 Test",email:"nobody@example.invalid",phone:"00000000"}
});
const request=(data)=>({url:"https://www.aadland-service.no/api/orders",json:async()=>data});

let result=await POST(request(body()));
assert.equal(result.status,200);
assert.equal(result.body.payment.method,"vipps");
assert.equal(vippsCalls,1);
assert.equal(stockCalls.length,1);
assert.deepEqual(stockCalls[0].stock_requests,[{id:"s22-stock-demo",quantity:2}]);
assert.equal(stockCalls[0].order_record.payment_provider,"vipps");
assert.equal(stockCalls[0].order_record.payment_reference,stockCalls[0].order_record.order_number);
assert.ok(stockCalls[0].order_record.vipps_checkout_started_at);
assert.equal(mockOrder.payment_psp_reference,"mock-s22-psp");
assert.equal(vippsStamp,1);
assert.equal(cancellations,0);

dropMetadata=true;const beforeVipps=vippsCalls;
result=await POST(request(body()));
assert.equal(result.status,503,"Never start checkout when stored reference is missing");
assert.equal(vippsCalls,beforeVipps,"Lost reference never reaches external payment API");
assert.equal(cancellations,1,"Stock must be released on integrity failure");
assert.equal(mockOrder.payment_status,"cancelled");
dropMetadata=false;

oversell=true;const beforeCalls=vippsCalls,beforeCancels=cancellations;
result=await POST(request(body()));
assert.equal(result.status,409,"Concurrent sold-out item is rejected");
assert.equal(vippsCalls,beforeCalls);
assert.equal(cancellations,beforeCancels);
oversell=false;

const manual={...body(),paymentMethod:"manual"};
result=await POST(request(manual));
assert.equal(result.status,200);
assert.equal(result.body.payment.method,"manual");
assert.equal(mockOrder.payment_provider,null);
assert.equal(mockOrder.payment_reference,null);
assert.equal(mockOrder.vipps_checkout_started_at,null);
assert.equal(vippsCalls,beforeCalls);

console.log("S-22 bestått: atomisk lagerordre beholder Vipps-referansen, avbryter ufullstendig betaling trygt, avviser oversalg, støtter manuell bestilling og varsler historisk arkivavvik. Ingen API-betaling eller kundedata.");
