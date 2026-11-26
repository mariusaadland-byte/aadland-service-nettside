import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const api=read("app/api/admin/vipps-payment/route.js");
const admin=read("app/admin/AdminClient.js");
const reviewApi=read("app/api/admin/vipps-service-review/route.js");
const reviewUi=read("app/admin/ServiceVippsReview.js");
const sql=read("supabase/migrations/20261125163000_s30_service_vipps_economic_action_once.sql");
for(const term of [
 "create table public.vipps_service_action_attempts",
 "constraint s30_unique_user_intent unique(order_id,request_id)",
 "create unique index s30_one_unresolved_per_service_order",
 "where state in ('sending','needs_review')",
 "alter table public.vipps_service_action_attempts enable row level security",
 "revoke all on public.vipps_service_action_attempts from public,anon,authenticated",
 "create function public.claim_vipps_service_action(",
 "where id=p_order_id for update",
 "state in ('accepted','reviewed_effect')",
 "now()-interval '15 minutes'",
 "create function public.ack_vipps_service_action(",
 "create function public.hold_vipps_service_action(",
 "create function public.review_vipps_service_action(",
 "S30_STILL_SENDING"
])assert.ok(sql.includes(term),"Missing SQL guard "+term);
for(const term of [
 's.rpc("claim_vipps_service_action"',
 's.rpc("ack_vipps_service_action"',
 's.rpc("hold_vipps_service_action"',
 '{idempotencyKey:serviceClaim.idempotency_key}',
 'process.env.VERCEL_ENV!=="production"',
 'if(serviceClaim){',
 'acceptedByApi:true',
 'providerAccepted:true',
 'needsReview:true'
])assert.ok(api.includes(term),"Missing route guard "+term);
assert.ok(admin.includes('const intentId=action==="sync"?null:crypto.randomUUID()'));
assert.ok(admin.includes('if(savingId===order.id)return;'));
assert.ok(admin.includes("Vipps kan ha utført handlingen"));
assert.ok(reviewApi.includes('user?.role==="owner"'));
assert.ok(reviewApi.includes('review_vipps_service_action'));
assert.ok(reviewApi.includes('getVippsPaymentEvents("service"'));
assert.ok(reviewUi.includes("Denne kontrollsiden flytter aldri penger"));
assert.ok(admin.includes("<ServiceVippsReview/>"));
// Functional regression: load the route as a function with fake dependencies.
// No external Vipps API, database or customer messaging is contacted.
const executable=api.replace(/^import[\s\S]*?;\n/gm,"")
 .replace(/export const runtime=/g,"const runtime=")
 .replace(/export async function POST/g,"async function POST");
const compile=new Function("NextResponse","getAdminUser","hasPermission","sameOriginGuard","db",
 "getVippsPayment","captureVippsPayment","cancelVippsPayment","refundVippsPayment",
 "vippsPaymentsEnabled","syncVippsPaymentSnapshot","sendVippsPaymentReceiptIfNeeded",
 "sendVippsRefundNoticeIfNeeded","sendPaidRentalConfirmationIfNeeded","process",
 executable+";return POST;");
const fixedIntent="12345678-1234-4234-8234-123456789012";
const request=(act="refund",overrides={})=>({
 json:async()=>({unit:"service",reference:"S30-MOCK-ORDER",action:act,
 amountOre:1000,intentId:fixedIntent,...overrides})});
async function runScenario({state="claimed",failAt="",environment="production"}={}){
 const calls=[];
 const result={json:(body,opts={})=>({status:opts.status||200,body})};
 const payment={aggregate:{
  authorizedAmount:{value:14000,currency:"NOK"},
  cancelledAmount:{value:0,currency:"NOK"},
  capturedAmount:{value:6000,currency:"NOK"},
  refundedAmount:{value:0,currency:"NOK"}
 }};
 const database={
  from:name=>{assert.equal(name,"orders");return{
   select:()=>({or:()=>({limit:()=>({
    maybeSingle:async()=>({data:{
     id:"11111111-1111-4111-8111-111111111111",
     order_type:"order",payment_provider:"vipps",payment_reference:"S30-MOCK-ORDER"
    },error:null})
   })})})
  };},
  rpc:async(name,args)=>{
   calls.push({type:"rpc",name,args});
   if(name==="claim_vipps_service_action"){
    return failAt==="claim"?{data:null,error:{code:"500"}}:{
     data:state==="claimed"?{
      state:"claimed",attempt_id:"22222222-2222-4222-8222-222222222222",
      idempotency_key:"s30-22222222-2222-4222-8222-222222222222"
     }:{state},error:null};
   }
   if(name==="ack_vipps_service_action")
    return failAt==="ack"?{data:null,error:{code:"500"}}:{data:{accepted:true},error:null};
   if(name==="hold_vipps_service_action")return {data:{held:true},error:null};
   throw Error("Unexpected RPC "+name);
  }
 };
 const provider=async(name,...args)=>{
  calls.push({type:"provider",name,args});
  if(failAt==="provider")throw Error("synthetic timeout");
  return {pspReference:"mock-psp-reference"};
 };
 const POST=compile(result,async()=>({role:"owner"}),async()=>true,()=>null,
  ()=>database,async()=>{calls.push({type:"get"});return payment;},
  (...args)=>provider("capture",...args),(...args)=>provider("cancel",...args),
  (...args)=>provider("refund",...args),
  ()=>true,async()=>({db:{status:"authorized"},refundedOre:0}),
  async()=>null,async()=>null,async()=>null,{env:{VERCEL_ENV:environment}});
 return {response:await POST(request()),calls,POST};
}
const success=await runScenario();
assert.equal(success.response.status,200);
assert.equal(success.calls.filter(c=>c.type==="provider").length,1);
const operation=success.calls.find(c=>c.type==="provider");
assert.equal(operation.args[3]?.idempotencyKey,"s30-22222222-2222-4222-8222-222222222222");
assert.equal(success.calls.filter(c=>c.name==="ack_vipps_service_action").length,1);
assert.ok(success.calls.findIndex(c=>c.name==="ack_vipps_service_action")<
 success.calls.map(c=>c.type).lastIndexOf("get"),"Provider ACK must precede refresh");
const concurrent=await runScenario({state:"unresolved"});
assert.equal(concurrent.response.status,409);
assert.equal(concurrent.calls.filter(c=>c.type==="provider").length,0);
const replay=await runScenario({state:"duplicate_intent"});
assert.equal(replay.response.status,409);
assert.equal(replay.calls.filter(c=>c.type==="provider").length,0);
const recent=await runScenario({state:"recent_same_action"});
assert.equal(recent.response.status,409);
assert.equal(recent.calls.filter(c=>c.type==="provider").length,0);
const timeout=await runScenario({failAt:"provider"});
assert.equal(timeout.response.status,409);
assert.equal(timeout.calls.filter(c=>c.name==="hold_vipps_service_action").length,1);
const ackFailure=await runScenario({failAt:"ack"});
assert.equal(ackFailure.response.status,409);
assert.equal(ackFailure.calls.filter(c=>c.name==="hold_vipps_service_action").length,1);
const dbFailure=await runScenario({failAt:"claim"});
assert.equal(dbFailure.response.status,503);
assert.equal(dbFailure.calls.filter(c=>c.type==="provider").length,0);
const preview=await runScenario({environment:"preview"});
assert.equal(preview.response.status,403);
assert.equal(preview.calls.filter(c=>c.type==="provider").length,0);
const empty=await success.POST(request("refund",{intentId:""}));
assert.equal(empty.status,400);
console.log("S-30 bestått: én provider handling, lås på replay/timeout, eksplisitt Vipps idempotens, ACK før synk, preview-sperre og eierkontroll.");

// Verify evidence from an older event is not hidden by the recent display limit.
const reviewSource=reviewApi.replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const mockEntry={id:"12345678-1234-4234-8234-123456789012",payment_reference:"mock",idempotency_key:"mock-key"};
let reviewActor={role:"owner"},eventRows=[{name:"REFUNDED",success:true,idempotencyKey:"mock-key",amount:{value:1000}} ,...Array.from({length:55},(_,i)=>({name:"OTHER",idempotencyKey:"other-"+i}))],count=51,listError=null;
const reviewDb=()=>({from(table){assert.equal(table,"vipps_service_action_attempts");const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},async maybeSingle(){return {data:mockEntry,error:null}},then(resolve,reject){return Promise.resolve({data:Array.from({length:50},()=>mockEntry),count,error:listError}).then(resolve,reject)}};return q}});
const reviewGet=new Function("NextResponse","getAdminUser","sameOriginGuard","db","getVippsPayment","getVippsPaymentEvents","vippsPaymentsEnabled",reviewSource+";return GET;")({json:(body,opts={})=>({body,status:opts.status||200})},async()=>reviewActor,()=>null,reviewDb,async()=>({aggregate:{}}),async()=>eventRows,()=>true);
let reviewResult=await reviewGet({url:"https://example.invalid/?attemptId="+mockEntry.id});
assert.equal(reviewResult.status,200);assert.equal(reviewResult.body.eventCount,56);assert.equal(reviewResult.body.events.length,13);assert.equal(reviewResult.body.matchingEventCount,1);assert.equal(reviewResult.body.events[0].matchesAttempt,true);
eventRows={invalid:true};assert.equal((await reviewGet({url:"https://example.invalid/?attemptId="+mockEntry.id})).status,503);
reviewResult=await reviewGet({url:"https://example.invalid/"});assert.equal(reviewResult.body.total,51);assert.equal(reviewResult.body.hasMore,true);
count=null;assert.equal((await reviewGet({url:"https://example.invalid/"})).status,503);
reviewActor={role:"staff"};assert.equal((await reviewGet({url:"https://example.invalid/"})).status,403);
assert.ok(reviewUi.includes("!loading&&!loadFailed&&total===0"));assert.ok(!reviewUi.includes(".slice(-12).map"));
console.log("S30: older matching Vipps evidence preserved; invalid event/list responses fail closed.");
