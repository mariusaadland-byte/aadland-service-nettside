import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const checkout=read("app/api/orders/route.js"),admin=read("app/api/admin/orders/route.js"),cron=read("app/api/cron/service-order-confirmations/route.js"),helper=read("lib/manualOrderConfirmationOnce.js"),sql=read("scripts/sql-s33-order-confirmation-outbox-draft.sql");
for(const fragment of ['body.orderType==="order"&&!useVipps','s.rpc("create_service_order_with_confirmation",orderArgs)','if(!queuedManualOrder)try','sendManualOrderConfirmationOnce({s,id:orderId})'])assert.ok(checkout.includes(fragment),fragment);
assert.ok(admin.includes('sendManualOrderConfirmationOnce({s,id})'));assert.ok(admin.includes('confirmationDeliveryState'));
assert.ok(cron.includes('eq("state","queued")'));assert.ok(cron.includes('cronGuard(req)'));
assert.ok(helper.includes('VERCEL_ENV!=="production"'));assert.ok(helper.includes('idempotencyKey:"service-order-confirmation/"+id'));
assert.ok(helper.indexOf('claim_service_order_confirmation')<helper.indexOf('emails.send'));
assert.ok(sql.includes("enable row level security"));assert.ok(sql.includes("state='queued'"));assert.ok(sql.includes("for update"));assert.ok(sql.includes("from public,anon,authenticated"));
console.log("S33 static outbox wiring checks passed (database verification separate)");

// Exercise actual cron with a read-only mock. Never send a real email.
const cronSrc=cron.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"").replace("export async function GET","async function GET");
let counts={needs_review:0,claimed:0,queued:0},badCount=false,sends=0;
const db=()=>({from(table){assert.equal(table,"service_order_confirmation_outbox");let state="",head=false;const q={select(k,opts){head=Boolean(opts?.head);return q},eq(k,v){assert.equal(k,"state");state=v;return q},lt(k){assert.ok(["claimed_at","created_at"].includes(k));return q},order(){return q},limit(){return q},then(resolve,reject){return Promise.resolve(head?{count:badCount?null:counts[state],error:null}:{data:[],error:null}).then(resolve,reject)}};return q}});
const get=new Function("NextResponse","withServiceCronMonitoring","cronGuard","db","sendManualOrderConfirmationOnce","process",cronSrc+";return GET;")({json:(body,opts={})=>({body,status:opts.status||200})},async(k,r,fn)=>fn(),()=>null,db,async()=>{sends++;return {state:"accepted"}},{env:{VERCEL_ENV:"production",RESEND_API_KEY:"synthetic"}});
assert.equal((await get({})).status,200);
counts.needs_review=2;counts.claimed=1;
let result=await get({});assert.equal(result.status,207);assert.equal(result.body.requiresReview,3);
counts.needs_review=0;counts.claimed=0;counts.queued=1;result=await get({});assert.equal(result.status,207);assert.equal(result.body.remainingQueued,1);
badCount=true;assert.equal((await get({})).status,503);assert.equal(sends,0);
console.log("S33: unresolved and stale claims plus remaining eligible queue reported without resending.");
