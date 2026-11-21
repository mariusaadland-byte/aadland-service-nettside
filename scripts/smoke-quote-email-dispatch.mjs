import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path="app/api/admin/quotes/send/route.js";
const source=readFileSync(path,"utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const runtime=.*;\n/gm,"")
 .replace(/export async function (POST|GET|PATCH)\(/g,"async function $1(")
 .replace('const {Resend}=await import("resend");','const Resend=FakeResend;');
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",role:"owner"};
const fakeProcess={env:{VERCEL_ENV:"production",RESEND_API_KEY:"mock-only"}};
let sendCount=0,sendFailure=false,completeFailure=false,attempt=null,logs=[];
let quote;
function reset(){
 quote={id,quote_number:"AS-T-TEST",title:"Tilbud test",
 status:"draft",updated_at:"2026-11-21T00:00:00.123Z",sent_at:null,paper_issued_at:null,
 customer:{name:"Test",email:"example@example.invalid"},
 line_items:[],valid_until:"2026-12-31",total_inc_vat_ore:25000,revision_number:1,
 revised_from_id:null,issued_via:null};
 attempt=null;logs=[];sendCount=0;sendFailure=false;completeFailure=false;
}
reset();
const db={
 from(table){
  const query={
   select(){return query},
   eq(){return query},
   in(){return query},
   async maybeSingle(){
    if(table==="quotes")return {data:quote,error:null};
    if(table==="invoice_drafts")return {data:null,error:null};
    if(table==="quote_internal_costs")return {data:null,error:null};
    if(table==="customer_profiles")return {data:null,error:null};
    if(table==="quote_email_send_attempts")return {data:attempt?{...attempt}:null,error:null};
    if(table==="admin_customer_contacts")return {data:null,error:null};
    throw Error("Unexpected table "+table);
   }
  };
  return query;
 },
 async rpc(name,params){
  switch(name){
   case "claim_quote_email_send":{
    if(quote.status!=="draft")return {data:null,error:{message:"quote_already_issued"}};
    if(quote.updated_at!==params.p_expected_updated_at)return {data:null,error:{message:"quote_changed_refresh_before_sending"}};
    if(attempt&&attempt.state!=="released"){
     if(attempt.state==="provider_accepted")return {data:{state:"provider_accepted",idempotencyKey:attempt.idempotency_key,recipient:attempt.recipient,deliveryType:attempt.delivery_type},error:null};
     return {data:null,error:{message:"quote_dispatch_already_claimed_"+attempt.state}};
    }
    attempt={recipient:params.p_recipient,delivery_type:params.p_delivery_type,state:"claimed",idempotency_key:"quote-email-unique-1",claimed_at:"2026-11-21T00:00:00Z"};
    return {data:{state:"claimed",idempotencyKey:attempt.idempotency_key},error:null};
   }
   case "quote_email_send_uncertain":
    if(attempt?.state==="claimed")attempt.state="needs_review";
    return {data:null,error:null};
   case "quote_email_provider_accepted":
    if(attempt?.state!=="claimed")return {data:null,error:{message:"missing claim"}};
    attempt.state="provider_accepted";attempt.provider_email_id=params.p_provider_email_id;
    return {data:null,error:null};
   case "complete_quote_email_send":
    if(completeFailure)return {data:null,error:{message:"simulated DB error"}};
    if(attempt?.state!=="provider_accepted"&&attempt?.state!=="sent")return {data:null,error:{message:"not acknowledged"}};
    if(attempt.state!=="sent"){
     attempt.state="sent";attempt.sent_at="2026-11-21T01:01:01Z";
     quote.status="sent";quote.sent_at=attempt.sent_at;
     logs.push({recipient:attempt.recipient,delivery_type:attempt.delivery_type});
    }
    return {data:{state:"sent",sentAt:attempt.sent_at},error:null};
   case "release_quote_email_after_review":
    if(params.p_confirmed_not_sent!==true||params.p_quote_number!=="AS-T-TEST")return {data:null,error:{message:"confirm"}};
    if(!["claimed","needs_review"].includes(attempt?.state))return {data:null,error:{message:"not releasable"}};
    attempt.state="released";return {data:null,error:null};
   default:throw Error("Unknown RPC "+name);
  }
 }
};
class FakeResend{
 emails={
  async send(payload,opts){
   sendCount++;
   assert.equal(payload.to,"example@example.invalid");
   assert.equal(opts.idempotencyKey,"quote-email-unique-1");
   assert.ok(payload.attachments[0].filename.endsWith(".pdf"));
   if(sendFailure)throw Error("simulated provider timeout");
   return {data:{id:"resend-mock-1"},error:null};
  }
 };
}
const nextResponse={json(body,options={}){return {body,status:options.status||200}}};
const fakePdf=()=>Buffer.from("%PDF-1.4 mock");
const api=new Function(
 "NextResponse","sameOriginGuard","getAdminUser","db","createQuoteToken","osloDateKey",
 "buildQuotePdf","quotePdfFilename","loadQuoteDrawings","FakeResend","process",
 source+"\nreturn {POST,GET,PATCH};"
)(
 nextResponse,()=>null,async()=>user,()=>db,()=>"test-token",()=>"2026-11-21",
 fakePdf,()=> "Tilbud-test.pdf",async()=>[],FakeResend,fakeProcess
);
const call=()=>api.POST({url:"https://aadland-service.no/api/admin/quotes/send",
 json:async()=>({id})});
let response=await call();
assert.equal(response.status,200);
assert.equal(sendCount,1);
assert.equal(attempt.state,"sent");
assert.equal(quote.status,"sent");
assert.equal(logs.length,1,"Transaction must persist exactly one sent entry");
response=await call();
assert.equal(response.status,409);
assert.equal(sendCount,1,"A sent quote cannot be re-mailed");

reset();sendFailure=true;
response=await call();
assert.equal(response.status,409);
assert.equal(response.body.reviewRequired,true);
assert.equal(attempt.state,"needs_review");
response=await call();
assert.equal(response.status,409);
assert.equal(sendCount,1,"A failed/uncertain send must not call the provider again");
const status=await api.GET({url:"https://aadland-service.no/api/admin/quotes/send?id="+id});
assert.equal(status.status,200);
assert.equal(status.body.attempt.state,"needs_review");
assert.equal(status.body.canRelease,true);
response=await api.PATCH({json:async()=>({id,action:"release",quoteNumber:"AS-T-TEST",confirmation:"WRONG",note:"Verified dashboard no send"})});
assert.equal(response.status,400);
assert.equal(attempt.state,"needs_review");
response=await api.PATCH({json:async()=>({id,action:"release",quoteNumber:"AS-T-TEST",confirmation:"IKKE SENDT",note:"Verified dashboard no send"})});
assert.equal(response.status,200);
assert.equal(attempt.state,"released");

reset();completeFailure=true;
response=await call();
assert.equal(response.status,503);
assert.equal(attempt.state,"provider_accepted");
assert.equal(sendCount,1);
completeFailure=false;
response=await call();
assert.equal(response.status,200);
assert.equal(sendCount,1,"Recovery after DB failure must NOT resend email");
assert.equal(quote.status,"sent");
assert.equal(logs.length,1);

reset();
fakeProcess.env.VERCEL_ENV="preview";
response=await call();
assert.equal(response.status,403,"Preview cannot send real customer email");
assert.equal(sendCount,0);
assert.equal(attempt,null);
fakeProcess.env.VERCEL_ENV="production";

reset();
const results=await Promise.all([call(),call()]);
assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
assert.equal(sendCount,1,"Two overlapping requests send only one email");
assert.equal(logs.length,1,"Exactly one history entry");

const migration=readFileSync("supabase/migrations/20261121024000_quote_email_dispatch.sql","utf8");
for(const code of [
 "create table if not exists public.quote_email_send_attempts",
 "quote_id uuid primary key",
 "enable row level security",
 "to service_role",
 "for update",
 "create or replace function public.claim_quote_email_send",
 "create or replace function public.complete_quote_email_send",
 "perform public.activate_quote_revision",
 "insert into public.quote_send_log",
 "create or replace function public.release_quote_email_after_review",
 "create trigger guard_quote_email_dispatch_on_quotes",
 "quote_email_send_reviews"
])assert.ok(migration.includes(code),"Missing critical protection: "+code);
const editor=readFileSync("app/admin/tilbud/QuoteEditorClient.js","utf8");
assert.ok(!source.includes('s.from("quote_send_log").insert('),"A second best-effort history write would duplicate the transactional log");
assert.ok(editor.includes("sendBlocked"));
assert.ok(editor.includes("Frigi etter bekreftet IKKE sendt"));
assert.ok(editor.includes("Fullfør registrering uten ny e-post"));
assert.ok(!editor.includes('?"Send på nytt":"Send tilbud"'));
console.log("S-02 bestått: én e-post, én logg, timeout-sperre, manuell kontroll, sikker gjenoppretting, preview-sperre og parallell sending.");
