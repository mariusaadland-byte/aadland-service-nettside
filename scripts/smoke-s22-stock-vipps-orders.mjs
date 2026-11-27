import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const migration=read("supabase/migrations/20261121182500_s22_stock_vipps_order_metadata.sql");
const newMigration=read("supabase/migrations/20261122015000_s25_service_order_idempotency.sql");
const route=read("app/api/orders/route.js");
const adminRoute=read("app/api/admin/orders/route.js");
const adminUi=read("app/admin/AdminClient.js");

// S-22's protections must survive S-25's idempotency wrapper. The new
// S-25 smoke exercises actual API code and mocks the transactional wrapper.
for(const term of [
 "payment_provider,payment_reference,vipps_checkout_started_at",
 "provider,reference,checkout_at",
 "INVALID_VIPPS_ORDER_REFERENCE",
 "INSUFFICIENT_STOCK",
 "stock_quantity=stock_quantity-requested_quantity",
 "grant execute on function public.create_order_with_stock(jsonb,jsonb) to service_role",
 "revoke all on function public.create_order_with_stock(jsonb,jsonb) from public,anon,authenticated"
])assert.ok(migration.includes(term),"S22 stock Vipps safeguard missing: "+term);
for(const term of [
 "public.create_order_with_stock(p_order_record,p_stock_requests)",
 "p_order_record->>'payment_reference'",
 "checkout_request_fingerprint",
 "public.claim_service_order_vipps"
])assert.ok(newMigration.includes(term),"S25 wrapper must retain S22 protection: "+term);
assert.ok(route.includes("createdOrder.payment_provider!==\"vipps\""));
assert.ok(route.includes("createdOrder.payment_reference!==orderNumber"));
assert.ok(route.includes('s.rpc("cancel_product_order_once"'),"S22 integrity failure must release stock safely");
assert.ok(route.includes("SERVICE ORDER STOCK RELEASE NEEDS REVIEW"));
assert.ok(route.includes('s.rpc("create_service_order_once"'),
 "Atomic idempotent wrapper must protect all stock reservations");
assert.ok(route.includes('s.rpc("claim_service_order_vipps"'));
assert.ok(route.includes('s.rpc("complete_service_order_vipps"'));
assert.ok(adminUi.includes("Historisk avvik: Ordren er avsluttet og arkivert, men betalingen er ikke ferdig avstemt"));
assert.ok(adminRoute.includes('order.status==="completed"&&["pending","unpaid","partial","authorized"].includes(paymentStatus)'));
assert.ok(adminRoute.includes('action === "archive"'));
console.log("S-22 bestått: lagerreservering og Vipps-referanse fortsatt atomisk etter S25, sikker feilavvisning og arkivvarsel beholdt. Ingen kundedata.");

// Execute the admin transition with two requests reading the same order.
const completionStart=adminRoute.indexOf('  if (action === "mark-dispatched" || action === "mark-delivered")');
const completionEnd=adminRoute.indexOf("  let surveyOrder=null;",completionStart);
assert.ok(completionStart>=0&&completionEnd>completionStart);
const completeOrder=new Function("s","NextResponse","safeHttpsUrl","sendOrderStatusNotice","req","id","action",
 "return (async()=>{"+adminRoute.slice(completionStart,completionEnd)+"})()"
);

function fulfillmentFixture(order, beforeUpdate=()=>{}){
 const notices=[];
 const s={
  from(table){
   assert.equal(table,"orders");
   const filters={};
   let patch;
   const builder={
    select(){return builder;},
    eq(field,value){filters[field]=value;return builder;},
    is(field,value){filters[field]=value;return builder;},
    update(values){patch=values;return builder;},
    async single(){return {data:{...order}};},
    async maybeSingle(){
     beforeUpdate(order);
     if(!Object.entries(filters).every(([field,value])=>order[field]===value))return {data:null};
     Object.assign(order,patch);
     return {data:{...order}};
    },
    then(resolve,reject){
     return builder.maybeSingle().then(resolve,reject);
    }
   };
   return builder;
  }
 };
 const run=action=>completeOrder(s,
  {json:(data,{status=200}={})=>({data,status})},
  value=>String(value||"").startsWith("https://"),
  async ({order:updated,kind})=>{notices.push({updated,kind});return {sentAt:"synthetic"};},
  {url:"https://test.example.invalid/api/admin/orders"},order.id,action);
 return {run,notices};
}
const shipment={id:"synthetic-shipping",order_type:"order",status:"in_progress",fulfillment_type:"shipping",
 archived_at:null,tracking_number:"synthetic-tracking",tracking_url:null,payment_status:"authorized"};
let fixture=fulfillmentFixture({...shipment});
let results=await Promise.all([fixture.run("mark-dispatched"),fixture.run("mark-dispatched")]);
assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
assert.equal(fixture.notices.length,1);
assert.equal(fixture.notices[0].kind,"dispatched");
assert.equal(fixture.notices[0].updated.tracking_number,shipment.tracking_number);

fixture=fulfillmentFixture({...shipment},current=>{current.tracking_number=null;});
assert.equal((await fixture.run("mark-dispatched")).status,409);
assert.equal(fixture.notices.length,0);
fixture=fulfillmentFixture({...shipment},current=>{current.status="cancelled";});
assert.equal((await fixture.run("mark-dispatched")).status,409);
assert.equal(fixture.notices.length,0);

fixture=fulfillmentFixture({...shipment,status:"ready",fulfillment_type:"pickup"},
 current=>{current.payment_status="paid";});
results=await Promise.all([fixture.run("mark-delivered"),fixture.run("mark-delivered")]);
assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
assert.equal(results.find(x=>x.status===200).data.paymentStatus,"paid");
assert.equal(fixture.notices.length,1);
assert.equal(fixture.notices[0].kind,"delivered");
console.log("Product fulfillment: concurrent completion, stale tracking and cancelled order checks passed.");

// Run the ready transition up to the email boundary, without sending mail.
const readyStart=adminRoute.indexOf('  if(action==="mark-ready-and-notify"){');
const readyEnd=adminRoute.indexOf('    const resendKey=',readyStart);
assert.ok(readyStart>=0&&readyEnd>readyStart);
const readyPreflight=new Function("s","NextResponse","id","action",
 "return (async()=>{"+adminRoute.slice(readyStart,readyEnd)+
 'return NextResponse.json({ok:true});}})()'
);
function readyFixture(beforeUpdate=()=>{}){
 const order={id:"synthetic-ready",order_type:"order",status:"in_progress",
  fulfillment_type:"pickup",archived_at:null,updated_at:"2026-11-01T00:00:00Z",
  customer:{email:"test@example.invalid"}};
 let transitions=0;
 const s={from(){
  let patch;
  const filters={};
  const q={
   select(){return q;},eq(k,v){filters[k]=v;return q;},is(k,v){filters[k]=v;return q;},
   update(p){patch=p;return q;},async single(){return {data:{...order}};},
   async maybeSingle(){
    beforeUpdate(order);
    if(!Object.entries(filters).every(([k,v])=>order[k]===v))return {data:null};
    transitions++;Object.assign(order,patch);return {data:{...order}};
   },
   then(resolve,reject){return q.maybeSingle().then(resolve,reject);}
  };return q;
 }};
 const run=()=>readyPreflight(s,{json:(data,{status=200}={})=>({data,status})},order.id,"mark-ready-and-notify");
 return {run,order,count:()=>transitions};
}
let ready=readyFixture();
results=await Promise.all([ready.run(),ready.run()]);
assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
assert.equal(ready.count(),1);
assert.equal((await ready.run()).status,200,"Explicit resend on an already-ready order remains available");
for(const change of [
 current=>{current.status="cancelled";},
 current=>{current.status="completed";},
 current=>{current.archived_at="2026-11-02T00:00:00Z";},
 current=>{current.fulfillment_type="shipping";},
 current=>{current.updated_at="2026-11-03T00:00:00Z";}
]){
 ready=readyFixture(change);
 assert.equal((await ready.run()).status,409);
 assert.equal(ready.count(),0);
}
console.log("Ready notices: stale orders rejected and explicit resend preserved.");
