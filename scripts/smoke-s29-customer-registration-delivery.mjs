import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(file,"utf8");
const sql=read("supabase/migrations/20261125143000_s29_customer_registration_delivery.sql");
const register=read("app/api/customer/register/route.js");
const resend=read("app/api/customer/resend-verification/route.js");
const sender=read("lib/customerVerificationDelivery.js");
const adminRoute=read("app/api/admin/customer-verifications/route.js");
const adminUi=read("app/admin/CustomerVerificationReview.js");
const admin=read("app/admin/AdminClient.js");
for(const term of [
 "create table public.customer_verification_delivery_attempts",
 "references auth.users(id) on delete cascade",
 "create unique index s29_customer_verification_one_unresolved",
 "state in ('sending','needs_review')",
 "alter table public.customer_verification_delivery_attempts enable row level security",
 "revoke all on public.customer_verification_delivery_attempts from public,anon,authenticated",
 "create function public.find_unconfirmed_customer_by_email",
 "create function public.claim_customer_verification_delivery",
 "from auth.users where id=p_user_id for update",
 "last_accepted > now()-interval '15 minutes'",
 "create function public.accept_customer_verification_delivery",
 "create function public.hold_customer_verification_delivery",
 "create function public.review_customer_verification_delivery",
 "S29_STILL_SENDING",
 "grant execute on function public.review_customer_verification_delivery"
])assert.ok(sql.includes(term),"Missing SQL safety guard "+term);
assert.ok(register.includes('sendCustomerVerificationEmail({'));
assert.ok(register.includes('deliveryPending:!accepted'));
assert.ok(register.includes('status:accepted?200:202'));
assert.ok(!register.includes("deleteUser("),"Never delete registered auth users on mail failure");
assert.ok(register.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(resend.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(resend.includes('s.rpc("find_unconfirmed_customer_by_email"'));
assert.ok(resend.includes('customerVerificationGenericMessage'));
assert.ok(resend.includes('sendCustomerVerificationEmail({'));
assert.ok(resend.includes('user.email_confirmed_at'));
assert.ok(!resend.includes("deleteUser("));
assert.ok(sender.includes('s.rpc("claim_customer_verification_delivery"'));
assert.ok(sender.includes('s.rpc("accept_customer_verification_delivery"'));
assert.ok(sender.includes('s.rpc("hold_customer_verification_delivery"'));
assert.ok(sender.includes('idempotencyKey:"customer-verification/"+attemptId'));
assert.ok(sender.includes('if(sent?.error||!sent?.data?.id)'));
assert.ok(sender.includes('return {status:"uncertain"'));
assert.ok(!sender.includes("deleteUser("));
assert.ok(adminRoute.includes('user?.role==="owner"'));
assert.ok(adminRoute.includes('sameOriginGuard(req)'));
assert.ok(adminRoute.includes('review_customer_verification_delivery'));
assert.ok(adminRoute.includes('"IKKE SENDT"'));
assert.ok(adminUi.includes('Dette panelet sender aldri en ny e-post'));
assert.ok(admin.includes('<CustomerVerificationReview/>'));
assert.ok(admin.includes('user?.role==="owner" && <CustomerVerificationReview/>'));
console.log("S-29: konto beholdes ved usikker mail, engangslås og Resend-idempotens, trygg gjenutsending, eieravklaring og preview-sperre bestått.");

await import("./smoke-s11-password-security.mjs");

// Exercise the owner-only list with exact count, not a false empty result.
const listSource=adminRoute.replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
let listActor={role:"owner"},listCount=0,listRows=[],listError=null;
const listDb=()=>({from(table){assert.equal(table,"customer_verification_delivery_attempts");const q={select(fields,opts){assert.deepEqual(opts,{count:"exact"});return q},in(k,v){assert.deepEqual(v,["sending","needs_review"]);return q},order(){return q},limit(n){assert.equal(n,50);return q},then(resolve,reject){return Promise.resolve({data:listRows,error:listError,count:listCount}).then(resolve,reject)}};return q}});
const getList=new Function("NextResponse","sameOriginGuard","getAdminUser","db",listSource+";return GET;")({json:(body,opts={})=>({body,status:opts.status||200})},()=>null,async()=>listActor,listDb);
assert.deepEqual((await getList()).body,{attempts:[],total:0,hasMore:false});
listCount=null;assert.equal((await getList()).status,503);
listCount=51;listRows=Array.from({length:50},(_,i)=>({id:"mock-"+i}));assert.equal((await getList()).body.hasMore,true);
listError={code:"TEST"};assert.equal((await getList()).status,503);listActor={role:"staff"};assert.equal((await getList()).status,403);
assert.ok(adminUi.includes("!loading&&!loadFailed&&total===0"));assert.ok(adminUi.includes("Viser {items.length} av {total}"));
console.log("S29 review count: no false empty log, visible backlog, owner-only.");
