import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";
const read=p=>readFileSync(p,"utf8");
const migration=read("supabase/migrations/20261122032500_s26_manual_payment_receipt_once.sql");
const reviewSql=read("supabase/migrations/20261122034000_s26_manual_receipt_review.sql");
for(const rule of [
 "create table public.manual_order_payment_receipts(",
 "order_id uuid not null unique references public.orders(id)",
 "alter table public.manual_order_payment_receipts enable row level security",
 "revoke all on public.manual_order_payment_receipts from public,anon,authenticated",
 "for update",
 "p_payment_verified is distinct from true",
 "o.payment_provider is not null",
 "o.payment_status not in ('pending','unpaid')",
 "coalesce(o.payment_captured_ore,0)<>0",
 "o.payment_refunded_ore",
 "payment_captured_at=stamp",
 "receipt_state='queued'",
 "create function public.claim_manual_product_receipt(",
 "receipt_state='sending'",
 "create function public.ack_manual_product_receipt(",
 "provider_email_id=trim(p_provider_email_id)",
 "create function public.hold_manual_product_receipt(",
 "S26_PAYMENT_ALREADY_RECORDED_OR_INELIGIBLE",
 "grant execute on function public.record_manual_product_payment_once(uuid,text,uuid,boolean)"
])assert.ok(migration.includes(rule),"Missing S26 SQL safeguard: "+rule);
for(const rule of [
 "create function public.review_manual_product_receipt(",
 "p_result not in ('sent','unsent')",
 "r.receipt_state not in ('sending','needs_review')",
 "r.claimed_at>stamp-interval '5 minutes'",
 "review_note=note",
 "grant execute on function public.review_manual_product_receipt"
])assert.ok(reviewSql.includes(rule),"Missing S26 owner review protection: "+rule);
assert.ok(read("scripts/sql-s26-manual-payment-receipt-rollback.sql").includes("S26_ROLLBACK_SUCCESS"));

// Test actual receipt helper with a synthetic Resend transport and in-memory
// journal. Never connect to Resend or create a real invoice.
const helperSrc=read("lib/manualProductReceiptOnce.js")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export /gm,"");
const env={env:{RESEND_API_KEY:"",NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no"}};
const {sendManualProductReceiptOnce}=new Function(
 "fromDbProduct","buildReceiptEmail","buildReceiptPdf","receiptPdfFilename",
 "serviceEmailFrom","serviceReplyTo","process",
 helperSrc+";return {sendManualProductReceiptOnce};"
)(p=>p,data=>"<p>Synthetic receipt "+data.payment_reference+"</p>",
 async()=>Buffer.from("%PDF-TEST"),
 orderNumber=>"Kvittering-"+orderNumber+".pdf",
 ()=>"Aadland Service <post@aadland-service.no>",
 ()=>"post@aadland-service.no",env);

const makeOrder=()=>({
 id:crypto.randomUUID(),order_number:"AS-S26-SYNTHETIC",
 order_type:"order",status:"new",payment_status:"paid",
 customer:{name:"Testkunde",email:"fake@example.invalid",phone:"000000"},
 customer_user_id:null,fulfillment_type:"pickup",items:[],shipping_ore:0,
 total_ore:125000,payment_captured_ore:125000,payment_refunded_ore:0,
 payment_reference:"bank-test-20261122",receipt_sent_at:null
});
function makeStore(){
 const store={
  order:makeOrder(),receipt:{id:crypto.randomUUID(),receipt_state:"queued",
   payment_reference:"bank-test-20261122",amount_ore:125000,
   recipient_email:"fake@example.invalid",paid_at:"2026-11-22T00:00:00Z"},
  sends:0,claims:0,acks:0,holds:0,ackFails:false,providerError:false,
  providerThrow:false,lastMessage:null,lastOptions:null
 };
 const db={
  from(table){
   assert.equal(table,"quotes","No product lookup needed for synthetic empty items");
   const q={select(){return q},eq(){return q},async maybeSingle(){return {data:null,error:null}}};
   return q;
  },
  async rpc(name,args){
   if(name==="claim_manual_product_receipt"){
    store.claims++;
    if(store.receipt.receipt_state!=="queued")return {data:null,error:null};
    store.receipt.receipt_state="sending";return {data:{id:store.receipt.id},error:null};
   }
   if(name==="ack_manual_product_receipt"){
    store.acks++;
    if(store.ackFails)return {data:null,error:{code:"ACK_FAILED"}};
    assert.equal(args.p_receipt_id,store.receipt.id);
    store.receipt.receipt_state="sent";
    store.receipt.provider_email_id=args.p_provider_email_id;
    store.order.receipt_sent_at=new Date().toISOString();
    return {data:{ok:true},error:null};
   }
   if(name==="hold_manual_product_receipt"){
    store.holds++;
    if(store.receipt.receipt_state==="sending"){
     store.receipt.receipt_state="needs_review";
     store.receipt.last_issue=args.p_issue;
    }
    return {data:{held:true},error:null};
   }
   throw Error("Unexpected receipt RPC "+name);
  }
 };
 const send=async (msg,options)=>{
  store.sends++;
  store.lastMessage=msg;store.lastOptions=options;
  if(store.providerThrow)throw Error("Synthetic timeout");
  if(store.providerError)return {data:null,error:{message:"Synthetic provider error"}};
  return {data:{id:"resend-s26-accepted-00001"},error:null};
 };
 const run=(custom={})=>sendManualProductReceiptOnce(db,store.order,store.receipt,{
  requestUrl:"https://www.aadland-service.no/api/admin/orders",
  sendEmail:send,buildPdf:custom.buildPdf|| (async()=>Buffer.from("%PDF-TEST"))
 });
 return {store,db,send,run};
}
let t=makeStore();
let x=await t.run();
assert.equal(x.status,200);
assert.equal(t.store.sends,1);
assert.equal(t.store.claims,1);
assert.equal(t.store.acks,1);
assert.equal(t.store.receipt.receipt_state,"sent");
assert.equal(t.store.receipt.provider_email_id,"resend-s26-accepted-00001");
assert.ok(t.store.order.receipt_sent_at);
assert.deepEqual(t.store.lastOptions,{idempotencyKey:"manual-order-receipt/"+t.store.receipt.id});
assert.equal(t.store.lastMessage.attachments.length,2);
assert.equal(t.store.lastMessage.to,t.store.receipt.recipient_email);
assert.match(t.store.lastMessage.attachments[1].content,/^JVBERi0/);
x=await t.run();
assert.equal(x.status,409);
assert.equal(t.store.sends,1,"Provider never called again for sent receipt");

t=makeStore();t.store.providerError=true;
x=await t.run();assert.equal(x.status,503);
assert.equal(t.store.receipt.receipt_state,"needs_review");
assert.equal(t.store.sends,1);assert.equal(t.store.holds,1);
x=await t.run();assert.equal(x.status,409);
assert.equal(t.store.sends,1,"Resend error must not trigger an uncertain retry");

t=makeStore();t.store.providerThrow=true;
x=await t.run();assert.equal(x.status,503);
assert.equal(t.store.receipt.receipt_state,"needs_review");
x=await t.run();assert.equal(t.store.sends,1,"Timeout may have been accepted, never retry");

t=makeStore();t.store.ackFails=true;
x=await t.run();assert.equal(x.status,503);
assert.equal(t.store.receipt.receipt_state,"sending");
assert.equal(t.store.sends,1);
x=await t.run();assert.equal(t.store.sends,1,"Provider-accepted but DB unacknowledged cannot resend");

t=makeStore();
x=await t.run({buildPdf:async()=>{throw Error("Synthetic PDF failure")}});
assert.equal(x.status,503);
assert.equal(t.store.receipt.receipt_state,"queued");
assert.equal(t.store.sends,0);
x=await t.run();assert.equal(x.status,200);
assert.equal(t.store.sends,1,"Safe first attempt after preflight error");

t=makeStore();t.store.order.customer.email="changed@example.invalid";
x=await t.run();assert.equal(x.status,409);
assert.equal(t.store.sends,0);
assert.equal(t.store.receipt.receipt_state,"queued");

t=makeStore();
x=await sendManualProductReceiptOnce(t.db,t.store.order,t.store.receipt,{
 requestUrl:"https://www.aadland-service.no/api/admin/orders",
 buildPdf:async()=>Buffer.from("%PDF-TEST")
});
assert.equal(x.status,503);
assert.equal(t.store.receipt.receipt_state,"queued","No Resend key cannot claim");

// Exercise actual Admin PATCH handler with an in-memory order + receipt RPC.
// No existing production records are read or written.
const route=read("app/api/admin/orders/route.js");
const patchStart=route.indexOf("export async function PATCH(req){");
assert.ok(patchStart>=0);
const patchSource=route.slice(patchStart).replace("export async function PATCH(","async function PATCH(");
const json=(payload,{status=200}={})=>({payload,status});
let actor={id:crypto.randomUUID(),role:"owner"},mockEnv={env:{VERCEL_ENV:"production"}},
 calls=0,sendCalls=0,paymentWrites=0;
let order=makeOrder();order.payment_status="pending";order.payment_captured_ore=0;
let journal=null;
const mockDb=()=>({
 from(table){
  const query={select(){return query},eq(){return query},
   async single(){return {data:order,error:null}},
   async maybeSingle(){return {data:table==="manual_order_payment_receipts"?journal:order,error:null}}
  };
  return query;
 },
 async rpc(name,args){
  if(name==="record_manual_product_payment_once"){
   calls++;
   if(args.p_payment_verified!==true)return {data:null,error:{message:"S26_PAYMENT_CONFIRMATION_REQUIRED"}};
   if(journal){
    if(journal.payment_reference!==args.p_reference)return {data:null,error:{message:"S26_REFERENCE_CONFLICT"}};
    return {data:{existing:true,receipt_id:journal.id},error:null};
   }
   if(order.payment_status==="paid")return {data:null,error:{message:"S26_PAYMENT_ALREADY_RECORDED_OR_INELIGIBLE"}};
   paymentWrites++;order.payment_status="paid";order.payment_captured_ore=order.total_ore;
   order.payment_reference=args.p_reference;
   journal={id:crypto.randomUUID(),order_id:order.id,
    amount_ore:order.total_ore,payment_reference:args.p_reference,
    recipient_email:order.customer.email,paid_at:"2026-11-22T00:00:00Z",receipt_state:"queued"};
   return {data:{existing:false,receipt_id:journal.id},error:null};
  }
  if(name==="review_manual_product_receipt"){
   return {data:{ok:true,state:"reviewed_unsent"},error:null};
  }
  throw Error("Unexpected API RPC "+name);
 }
});
const PATCH=new Function("sameOriginGuard","NextResponse","getAdminUser",
 "hasPermission","db","sendManualProductReceiptOnce","process",
 patchSource+";return PATCH;")(
 ()=>null,{json},async()=>actor,async()=>true,mockDb,
 async()=>{sendCalls++;journal.receipt_state="sent";return {status:200,payload:{ok:true,message:"Synthetic"}};},
 mockEnv
);
const req=(body)=>({url:"https://www.aadland-service.no/api/admin/orders",json:async()=>({id:order.id,...body})});
x=await PATCH(req({action:"record-paid-and-send-receipt",paymentReference:"BANK-S26"}));
assert.equal(x.status,400,"Payment must be explicitly verified first");
assert.equal(paymentWrites,0);
x=await PATCH(req({action:"record-paid-and-send-receipt",paymentReference:"BANK-S26",paymentVerified:true}));
assert.equal(x.status,200);
assert.equal(paymentWrites,1);assert.equal(sendCalls,1);
x=await PATCH(req({action:"record-paid-and-send-receipt",paymentReference:"BANK-S26",paymentVerified:true}));
assert.equal(x.status,200);
assert.equal(paymentWrites,1);
assert.equal(sendCalls,1,"Repeated action must not resend");
x=await PATCH(req({action:"record-paid-and-send-receipt",paymentReference:"BANK-OTHER",paymentVerified:true}));
assert.equal(x.status,409);assert.equal(paymentWrites,1);
x=await PATCH(req({action:"send-queued-manual-receipt"}));
assert.equal(x.status,200);
assert.equal(sendCalls,1);
actor={id:crypto.randomUUID(),role:"staff"};
x=await PATCH(req({action:"review-manual-receipt",receiptReviewResult:"unsent",
 receiptReviewConfirmation:"IKKE SENDT",receiptReviewNote:"Syntetisk Resend-kontroll"}));
assert.equal(x.status,403,"Only owner may reconcile unknown receipt");
actor={id:crypto.randomUUID(),role:"owner"};
mockEnv.env.VERCEL_ENV="preview";
x=await PATCH(req({action:"record-paid-and-send-receipt",paymentReference:"BANK-S26",paymentVerified:true}));
assert.equal(x.status,403);
assert.equal(paymentWrites,1);
mockEnv.env.VERCEL_ENV="production";

assert.ok(route.includes('manualReceiptByOrder.set(receipt.order_id,receipt)'));
const ui=read("app/admin/AdminClient.js");
assert.ok(ui.includes('paymentVerified:true'));
assert.ok(ui.includes('window.prompt("Skriv BETALING MOTTATT'));
assert.ok(!ui.includes('Send betalingsbekreftelse på nytt'));
assert.ok(ui.includes("Send kvittering som aldri er forsøkt sendt"));
assert.ok(ui.includes('reviewManualReceipt(order,"sent")'));
assert.ok(ui.includes("manualReceiptState"));
console.log("S-26 bestått: én betalingssperre, dokumentasjonsbekreftelse, unik Resend-kvittering, timeout-karantene, safe-queued, eierkontroll, preview-sperre. Bare syntetiske data.");
