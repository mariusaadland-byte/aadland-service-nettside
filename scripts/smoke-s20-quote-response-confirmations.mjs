import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/20261121161500_quote_response_notices_s20.sql");
for(const label of ["quote_response_notifications","quote_response_notification_reviews"]){
 assert.ok(migration.includes("alter table public."+label+" enable row level security"));
 assert.ok(migration.includes("revoke all on public."+label+" from public,anon,authenticated"));
 assert.ok(migration.includes("to service_role"));
}
for(const fn of ["record_customer_quote_response","review_customer_quote_response_notice"])
 assert.ok(migration.includes("revoke all on function public."+fn));
assert.match(migration,/where id=p_quote_id[\s\S]*?and status='sent'/);
assert.ok(migration.includes("returning * into q"));
assert.ok(migration.includes("insert into public.quote_response_notifications"));
assert.ok(migration.includes("unique(quote_id,recipient_kind)"));
assert.ok(migration.includes("for update"));
assert.ok(migration.includes("p_via_customer_session"));

const source=read("lib/quoteResponseNotices.js").replace(/^import "server-only";\n/,"")
 .replace(/^export /gm,"");
const mockProcess={env:{VERCEL_ENV:"production",RESEND_API_KEY:"mock-do-not-send"}};
const noticeModule=new Function("process",source+
 ";return {buildQuoteResponseEmail,quoteResponseNotificationSummary,sendOneQuoteResponseNotice,dispatchQueuedQuoteResponseNotices,getQuoteResponseNoticeSummary};")(mockProcess);
const {buildQuoteResponseEmail,quoteResponseNotificationSummary,
 sendOneQuoteResponseNotice,dispatchQueuedQuoteResponseNotices}=noticeModule;
const quoteId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const quote={id:quoteId,status:"accepted",quote_number:"TEST-S20",title:"Utbedring",
 customer:{name:"Test Kunde",email:"client@example.invalid"},total_inc_vat_ore:123456,
 accepted_at:new Date().toISOString(),planned_start_date:"2026-12-01"};
let notices=[],sendCount=0,providerFails=false,dbWriteCount=0,quoteIsPresent=true;
const now=new Date("2026-11-21T12:00:00.000Z");
function makeRows(){
 notices=[
  {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001",quote_id:quoteId,
   recipient_kind:"owner",recipient_email:"post@aadland-service.no",
   action:"accept",state:"queued",attempt_number:1,created_at:now.toISOString(),released_at:null,
   claimed_at:null,sent_at:null},
  {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002",quote_id:quoteId,
   recipient_kind:"customer",recipient_email:"client@example.invalid",
   action:"accept",state:"queued",attempt_number:1,created_at:now.toISOString(),released_at:null,
   claimed_at:null,sent_at:null}
 ];
 sendCount=0;providerFails=false;dbWriteCount=0;quoteIsPresent=true;
}
makeRows();
function fakeDb(){
 return {from(table){
  const filters=[],query={
   table,patch:null,isSingle:false,
   select(){return this},
   update(p){this.patch=p;return this},
   eq(k,v){filters.push([k,v]);return this},
   order(){return this},limit(n){this.max=n;return this},
   async maybeSingle(){
    if(table==="quotes")return {data:quoteIsPresent?quote:null,error:null};
    if(table!=="quote_response_notifications")throw Error("Unexpected table "+table);
    const row=notices.find(row=>filters.every(([k,v])=>row[k]===v));
    if(row&&this.patch){Object.assign(row,this.patch);dbWriteCount++;}
    return {data:row?{...row}:null,error:null};
   },
   then(resolve,reject){
    const records=table==="quote_response_notifications"?notices:[];
    const filtered=records.filter(row=>filters.every(([k,v])=>row[k]===v))
     .slice(0,this.max||100);
    if(this.patch){for(const row of filtered){Object.assign(row,this.patch);dbWriteCount++;}}
    return Promise.resolve({data:filtered.map(row=>({...row})),error:null}).then(resolve,reject);
   }
  };
  return query;
 }};
}
const sendMail=async(payload,opts)=>{
 sendCount++;
 assert.match(opts.idempotencyKey,/^quote-response\/[a-f0-9-]+\/\d+$/);
 assert.equal(payload.from,"Aadland Service <post@aadland-service.no>");
 if(providerFails)return {data:null,error:{message:"test-only unknown delivery"}};
 return {data:{id:"resend-mock-"+sendCount},error:null};
};
const ownerEmail=buildQuoteResponseEmail(quote,notices[0]);
const customerEmail=buildQuoteResponseEmail(quote,notices[1]);
assert.equal(ownerEmail.to,"post@aadland-service.no");
assert.equal(customerEmail.to,"client@example.invalid");
assert.ok(customerEmail.html.includes("Takk – tilbudet er godkjent"));
assert.ok(customerEmail.html.includes("Min side"));
assert.equal(customerEmail.text.includes("Test Kunde"),true);
assert.equal(quoteResponseNotificationSummary(notices).hasPending,true);
let outcome=await dispatchQueuedQuoteResponseNotices(fakeDb(),{sendMail,limit:2});
assert.equal(outcome.ok,true);
assert.equal(outcome.sent,2);
assert.equal(sendCount,2);
assert.equal(notices.filter(row=>row.state==="sent").length,2);
assert.equal(quoteResponseNotificationSummary(notices).hasPending,false);
outcome=await dispatchQueuedQuoteResponseNotices(fakeDb(),{sendMail,limit:2});
assert.equal(sendCount,2,"Retry after confirmed send must not send again");
assert.equal(outcome.checked,0);

makeRows();providerFails=true;
let result=await sendOneQuoteResponseNotice(fakeDb(),notices[0],{sendMail,now});
assert.equal(result.state,"needs_review","Provider errors are not proof that no email was sent.");
assert.equal(notices[0].state,"needs_review");
const sentAfterFailure=sendCount;
result=await sendOneQuoteResponseNotice(fakeDb(),notices[0],{sendMail,now});
assert.equal(sendCount,sentAfterFailure,"An uncertain send is NEVER retried automatically");
assert.equal(result.state,"claimed");

makeRows();
notices[0].created_at=new Date(now.getTime()-8*86400000).toISOString();
result=await sendOneQuoteResponseNotice(fakeDb(),notices[0],{sendMail,now});
assert.equal(result.state,"needs_review");
assert.equal(sendCount,0,"Stale queued notification requires manual check, no email");
makeRows();
quoteIsPresent=false;
result=await sendOneQuoteResponseNotice(fakeDb(),notices[0],{sendMail,now});
assert.equal(result.state,"needs_review");
assert.equal(sendCount,0);
makeRows();
mockProcess.env.VERCEL_ENV="preview";
result=await sendOneQuoteResponseNotice(fakeDb(),notices[0],{sendMail,now});
assert.equal(result.state,"queued");
assert.equal(dbWriteCount,0,"No notification claims or sends from preview");
mockProcess.env.VERCEL_ENV="production";

const responseRoute=read("app/api/quotes/[id]/route.js").replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"").replace(/export async function (GET|POST)\(/g,"async function $1(");
let responseQuote={...quote,status:"sent",accepted_at:null,declined_at:null,valid_until:"2026-12-31",
 sent_at:now.toISOString(),quote_link_generation:1};
let rpcCount=0,dispatchCount=0,storeFailure=false,noRow=false;
const mockStore=()=>({
 from(table){
  assert.equal(table,"quotes");
  const q={select(){return q},eq(){return q},async maybeSingle(){return {data:{...responseQuote},error:null}}};
  return q;
 },
 async rpc(name,p){
  assert.equal(name,"record_customer_quote_response");
  rpcCount++;
  if(storeFailure)return {data:null,error:{code:"DB_TEST"}};
  if(noRow)return {data:null,error:null};
  if(responseQuote.status!=="sent")return {data:null,error:null};
  responseQuote={...responseQuote,status:p.p_action==="accept"?"accepted":"declined",
    accepted_at:p.p_action==="accept"?now.toISOString():null,
    declined_at:p.p_action==="decline"?now.toISOString():null};
  return {data:{...responseQuote},error:null};
 }
});
let signedToken=true,loggedCustomer=null;
const NextResponse={json:(body,{status=200,headers={}}={})=>({body,status,headers})};
const handler=new Function("sameOriginGuard","NextResponse","db","verifyQuoteToken","getCustomer",
 "osloDateKey","dispatchQueuedQuoteResponseNotices","getQuoteResponseNoticeSummary","process",
 responseRoute+";return {POST,GET};")(
 ()=>null,NextResponse,mockStore,()=>signedToken,async()=>loggedCustomer,()=>"2026-11-21",
 async()=>{dispatchCount++;return {ok:true}},
 async()=>({owner:"sent",customer:"sent",hasPending:false}),mockProcess
);
const request=(action="accept")=>({
 url:"https://aadland-service.no/api/quotes/"+quoteId,
 headers:{get:()=>null},
 json:async()=>({token:"demo-only",action})
});
const params={params:{id:quoteId}};
let response=await handler.POST(request(),params);
assert.equal(response.status,200);
assert.equal(response.body.quote.status,"accepted");
assert.equal(rpcCount,1);
assert.equal(dispatchCount,1);
assert.equal(response.body.confirmationPending,false);
response=await handler.POST(request(),params);
assert.equal(response.status,200);
assert.equal(response.body.alreadyRecorded,true);
assert.equal(rpcCount,1,"Repeated accept is read-only, never re-sends");
response=await handler.POST(request("decline"),params);
assert.equal(response.status,409);
assert.equal(rpcCount,1,"Opposite action cannot change accepted quote");
responseQuote={...quote,status:"sent",valid_until:"2026-12-31",sent_at:now.toISOString(),quote_link_generation:1};
storeFailure=true;
response=await handler.POST(request(),params);
assert.equal(response.status,503);
assert.equal(responseQuote.status,"sent","Atomic DB failure must leave quote unchanged");
storeFailure=false;noRow=true;
response=await handler.POST(request(),params);
assert.equal(response.status,409);
assert.equal(responseQuote.status,"sent");
noRow=false;
signedToken=false;loggedCustomer={email:"other@example.invalid"};
response=await handler.POST(request(),params);
assert.equal(response.status,403);
signedToken=false;loggedCustomer={email:"CLIENT@example.invalid"};
response=await handler.POST(request(),params);
assert.equal(response.status,200,"Matching customer session can act without public token.");
mockProcess.env.VERCEL_ENV="preview";
responseQuote={...quote,status:"sent",valid_until:"2026-12-31",sent_at:now.toISOString(),quote_link_generation:1};
const before=rpcCount;
response=await handler.POST(request(),params);
assert.equal(response.status,403);
assert.equal(rpcCount,before);
mockProcess.env.VERCEL_ENV="production";

const admin=read("app/api/admin/quotes/response-notifications/route.js");
for(const term of ['getAdminUser','u?.role==="owner"','sameOriginGuard(req)',
 'review_customer_quote_response_notice','"BEKREFTET I RESEND"','"IKKE SENDT"'])
 assert.ok(admin.includes(term),"Missing admin safety rule "+term);
const editor=read("app/admin/tilbud/QuoteEditorClient.js");
const component=read("app/admin/tilbud/QuoteResponseDeliveryPanel.js");
assert.ok(editor.includes('<QuoteResponseDeliveryPanel quoteId={quoteId}/>'));
assert.ok(component.includes("Bekreft ikke sendt – legg i kø"));
const client=read("app/tilbud/[id]/QuoteCustomerClient.js");
assert.ok(client.includes("data.confirmationPending"));
assert.ok(client.includes("du trenger ikke godkjenne på nytt"));
const cron=read("app/api/cron/quote-response-confirmations/route.js");
assert.ok(cron.includes("cronGuard(req)")&&cron.includes('VERCEL_ENV!=="production"'));
assert.ok(cron.includes("dispatchQueuedQuoteResponseNotices"));
const schedule=JSON.parse(read("vercel.json")).crons;
assert.ok(schedule.some(row=>row.path==="/api/cron/quote-response-confirmations"&&row.schedule==="40 10 * * *"));
console.log("S-20 bestått: atomisk godkjenning, to uavhengige e-postkvitteringer, ukjent sendestatus, ingen dobbel sending, trygg eieravstemming og produksjons-sperre.");

// Exercise the cron route with a read-only count mock, no real mail or DB.
const cronSource=cron.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"").replace("export async function GET","async function GET");
let backlog={needs_review:0,claimed:0,queued:0},countError=false,dispatchCalls=0,cutoffSeen=false;
const backlogDb=()=>({from(table){assert.equal(table,"quote_response_notifications");let state="";const q={select(fields,opts){assert.equal(fields,"id");assert.deepEqual(opts,{count:"exact",head:true});return q},eq(k,v){assert.equal(k,"state");state=v;return q},lt(k,v){assert.equal(k,"claimed_at");assert.ok(Number.isFinite(Date.parse(v)));cutoffSeen=true;return q},then(resolve,reject){return Promise.resolve({count:countError?null:backlog[state],error:countError?{code:"TEST"}:null}).then(resolve,reject)}};return q}});
const cronHandler=new Function("NextResponse","withServiceCronMonitoring","cronGuard","db","dispatchQueuedQuoteResponseNotices","process",cronSource+";return GET;")(NextResponse,async(key,req,fn)=>{assert.equal(key,"quote-response-confirmations");return fn()},()=>null,backlogDb,async()=>{dispatchCalls++;return {ok:true,checked:0,sent:0,requiresReview:0}},mockProcess);
assert.equal((await cronHandler({})).status,200);
backlog={needs_review:2,claimed:1,queued:0};
let backlogResult=await cronHandler({});assert.equal(backlogResult.status,207);assert.equal(backlogResult.body.requiresReview,3);assert.equal(backlogResult.body.staleClaims,1);assert.ok(cutoffSeen);
backlog={needs_review:0,claimed:0,queued:5};backlogResult=await cronHandler({});assert.equal(backlogResult.status,207);assert.equal(backlogResult.body.remainingQueued,5);
countError=true;assert.equal((await cronHandler({})).status,503);
assert.equal(dispatchCalls,4);
console.log("S20 backlog: old held/claimed and remaining queued rows reported without requeue, count errors fail closed.");
