import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const cronText=readFileSync("app/api/cron/quote-followups/route.js","utf8");
const adminText=readFileSync("app/api/admin/quotes/followup-status/route.js","utf8");
const migration=readFileSync("supabase/migrations/20261121031500_quote_followup_dispatches.sql","utf8");
const editor=readFileSync("app/admin/tilbud/QuoteEditorClient.js","utf8");
const quoteId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const oldDate=new Date(Date.now()-4*86400000).toISOString();
const futureDate=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
const env={RESEND_API_KEY:"test-key-do-not-send",VERCEL_ENV:"production"};
let quote,attempt,lastSend,sendCount,providerFails,ackFails,completionFails,history,reviews;
const reset=()=>{
 quote={id:quoteId,quote_number:"AS-T-S03",title:"Testoppdrag",status:"sent",
  customer:{name:"Testkunde",email:"customer@example.invalid"},
  total_inc_vat_ore:150000,valid_until:futureDate,sent_at:oldDate,
  follow_up_sent_at:null,auto_follow_up:true,archived_at:null,issued_via:"email",paper_issued_at:null,
  quote_link_generation:1,quote_link_disabled_at:null};
 attempt=null;lastSend={recipient:"customer@example.invalid",delivery_type:"primary"};
 sendCount=0;providerFails=false;ackFails=false;completionFails=false;history=[];reviews=[];
};reset();
const makeQuery=table=>{
 const q={
  select(){return q},
  eq(){return q},is(){return q},lte(){return q},or(){return q},order(){return q},
  limit(){return q},
  async maybeSingle(){
   if(table==="quote_send_log")return {data:lastSend,error:null};
   if(table==="quotes")return {data:quote,error:null};
   if(table==="quote_followup_dispatches")return {data:attempt?{...attempt}:null,error:null};
   throw Error("Unexpected table "+table);
  },
  async single(){
   if(table==="quote_followup_dispatches")return {data:attempt?{...attempt}:null,error:null};
   throw Error("Unexpected single table "+table);
  },
  then(resolve,reject){
   if(table!=="quotes")throw Error("Unexpected awaited list "+table);
   return Promise.resolve({data:[quote],error:null}).then(resolve,reject);
  }
 };return q;
};
const dbMock={from:makeQuery,async rpc(name,p){
 switch(name){
  case "claim_quote_followup":{
   if(quote.status!=="sent"||!quote.auto_follow_up||quote.archived_at||
     quote.follow_up_sent_at||quote.issued_via==="paper"||
     quote.valid_until<new Date().toISOString().slice(0,10))
    return {data:{state:"skipped",reason:"not_eligible"},error:null};
   if(attempt&&attempt.state!=="released"){
    if(attempt.state==="provider_accepted")return {data:{state:"provider_accepted",key:attempt.idempotency_key},error:null};
    return {data:{state:"blocked",reason:attempt.state},error:null};
   }
   const key="s03-attempt-"+(history.length+1);
   attempt={quote_id:quoteId,recipient:p.p_recipient,state:"claimed",idempotency_key:key,
    claimed_at:new Date(Date.now()-3600000).toISOString(),provider_email_id:null,
    provider_accepted_at:null,sent_at:null};
   history.push({event:"claimed",key});
   return {data:{state:"claimed",key},error:null};
  }
  case "quote_followup_uncertain":{
   if(attempt?.idempotency_key===p.p_key&&attempt.state==="claimed")attempt.state="needs_review";
   return {data:null,error:null};
  }
  case "quote_followup_provider_accepted":{
   if(ackFails)return {data:null,error:{message:"mock db ack failure"}};
   assert.equal(attempt?.idempotency_key,p.p_key);
   assert.equal(attempt.state,"claimed");
   attempt.state="provider_accepted";attempt.provider_email_id=p.p_provider_email_id;
   attempt.provider_accepted_at=new Date().toISOString();
   return {data:null,error:null};
  }
  case "complete_quote_followup":{
   if(completionFails)return {data:null,error:{message:"mock db completion failure"}};
   if(!attempt||attempt.idempotency_key!==p.p_key||!["provider_accepted","sent"].includes(attempt.state))
    return {data:null,error:{message:"not provider accepted"}};
   if(attempt.state!=="sent"){
    attempt.state="sent";attempt.sent_at=attempt.provider_accepted_at||new Date().toISOString();
    quote.follow_up_sent_at=attempt.sent_at;
   }
   return {data:{state:"sent",sentAt:attempt.sent_at},error:null};
  }
  case "review_quote_followup":{
   if(!["claimed","needs_review"].includes(attempt?.state)||
    p.p_quote_number!==quote.quote_number||p.p_reviewer!==ownerId)
    return {data:null,error:{message:"review not allowed"}};
   const state=p.p_action==="confirm_sent"?"provider_accepted":"released";
   reviews.push({action:p.p_action,recipient:attempt.recipient,reason:p.p_note});
   attempt.state=state;
   if(state==="provider_accepted"){
    attempt.provider_email_id=p.p_provider_email_id;
    attempt.provider_accepted_at=new Date().toISOString();
   }
   return {data:{state},error:null};
  }
  default:throw Error("Unexpected rpc "+name);
 }
}};
class FakeResend {
 emails={async send(payload,opts){
  sendCount++;
  assert.equal(payload.to,"customer@example.invalid");
  assert.equal(opts.idempotencyKey,attempt?.idempotency_key);
  assert.ok(payload.html.includes("Har tilbudet kommet frem?"));
  if(providerFails)throw Error("simulated Resend timeout");
  return {data:{id:"resend-s03-id-"+sendCount},error:null};
 }};
}
const res={json(body,options={}){return {body,status:options.status||200}}};
const cron= new Function("NextResponse","db","cronGuard","createQuoteToken","osloDateKey","FakeResend","process",
 cronText.replace(/^import .*;\n/gm,"")
 .replace(/export async function GET\(/,"async function GET(")
 .replace('const {Resend}=await import("resend");',"const Resend=FakeResend;")+
 "\nreturn {GET};"
)(res,()=>dbMock,()=>null,()=>"test-token",()=>new Date().toISOString().slice(0,10),
 FakeResend,{env});
const owner={id:ownerId,role:"owner"};
let currentUser=owner;
const admin=new Function("NextResponse","sameOriginGuard","getAdminUser","db",
 adminText.replace(/^import .*;\n/gm,"")
 .replace(/^export const runtime=.*;\n/gm,"")
 .replace(/export async function (GET|PATCH)\(/g,"async function $1(")+
 "\nreturn {GET,PATCH};"
)(res,()=>null,async()=>currentUser,()=>dbMock);
const request={url:"https://aadland-service.no/api/cron/quote-followups",
 headers:{get:()=>""}};
const cronCall=()=>cron.GET(request);
const adminCall=body=>admin.PATCH({json:async()=>({id:quoteId,quoteNumber:quote.quote_number,...body})});
const statusCall=()=>admin.GET({url:"https://aadland-service.no/api/admin/quotes/followup-status?id="+quoteId});

// One successful automatic follow-up and exactly one local marker.
let r=await cronCall();
assert.equal(r.status,200);assert.equal(r.body.sent,1);assert.equal(sendCount,1);
assert.equal(attempt.state,"sent");assert.ok(quote.follow_up_sent_at);
r=await cronCall();assert.equal(sendCount,1,"A second cron run must never resend");
assert.equal(r.body.blocked,1);

// An uncertain delivery must NEVER reset the marker or retry automatically.
reset();providerFails=true;
r=await cronCall();
assert.equal(r.body.failed,1);assert.equal(attempt.state,"needs_review");
assert.equal(quote.follow_up_sent_at,null);
r=await cronCall();assert.equal(sendCount,1);
assert.equal(r.body.blocked,1);
assert.equal((await statusCall()).body.attempt.state,"needs_review");

// Owner can release ONLY after explicit verification, creating a different key.
r=await adminCall({action:"release_unsent",confirmation:"wrong",note:"Verified no message in Resend dashboard"});
assert.equal(r.status,400);
r=await adminCall({action:"release_unsent",confirmation:"IKKE SENDT",note:"Verified no message in Resend dashboard"});
assert.equal(r.status,200);assert.equal(attempt.state,"released");assert.equal(reviews.length,1);
providerFails=false;
r=await cronCall();
assert.equal(r.body.sent,1);assert.equal(attempt.state,"sent");
assert.equal(sendCount,2);assert.notEqual(history[0].key,history[1].key);

// Resend ack stored, DB completion error: recover WITHOUT new email.
reset();completionFails=true;
r=await cronCall();assert.equal(r.body.failed,1);
assert.equal(attempt.state,"provider_accepted");
assert.equal(sendCount,1);completionFails=false;
r=await cronCall();assert.equal(r.body.recovered,1);
assert.equal(sendCount,1);assert.equal(attempt.state,"sent");

// Resend accepted but local ack failed: owner can confirm provider ID.
reset();ackFails=true;
r=await cronCall();assert.equal(r.body.failed,1);
assert.equal(attempt.state,"claimed");assert.equal(sendCount,1);
r=await cronCall();assert.equal(sendCount,1);
r=await adminCall({action:"confirm_sent",confirmation:"BEKREFTET I RESEND",
 providerEmailId:"resend-verified-test-123",note:"Checked message ID in Resend dashboard"});
assert.equal(r.status,200);assert.equal(attempt.state,"sent");
assert.equal(sendCount,1);assert.equal(reviews[0].action,"confirm_sent");

// No reminder after quote is answered, disabled, expired, archived or paper-delivered.
for(const change of [
 {status:"accepted"},{status:"declined"},{auto_follow_up:false},
 {archived_at:new Date().toISOString()},{valid_until:"2020-01-01"},{issued_via:"paper"}
]){
 reset();Object.assign(quote,change);
 r=await cronCall();assert.equal(sendCount,0);
 assert.equal(r.body.sent,0);
}
reset();lastSend={recipient:"admin@example.invalid",delivery_type:"alternate"};
r=await cronCall();assert.equal(sendCount,0);assert.equal(r.body.blocked,1);

// No real customer emails from a preview build, even with an API key configured.
reset();env.VERCEL_ENV="preview";
r=await cronCall();assert.equal(r.status,403);assert.equal(sendCount,0);assert.equal(attempt,null);
env.VERCEL_ENV="production";

// Re-entrant cron calls cannot send twice.
reset();
const concurrent=await Promise.all([cronCall(),cronCall()]);
assert.equal(sendCount,1);
assert.equal(concurrent.filter(x=>x.body.sent===1).length,1);
assert.equal(attempt.state,"sent");

currentUser={id:ownerId,role:"staff",canUpdateOrders:true};
r=await adminCall({action:"release_unsent",confirmation:"IKKE SENDT",note:"Verified dashboard message absent"});
assert.equal(r.status,403,"Only owner can resolve an ambiguous follow-up");
currentUser=owner;

assert.equal(migration.split("as $").length-1,5);
for(const marker of [
 "quote_followup_dispatches","enable row level security","claim_quote_followup",
 "quote_followup_provider_accepted","quote_followup_uncertain",
 "complete_quote_followup","review_quote_followup","quote_followup_reviews",
 "grant execute on function public.claim_quote_followup","to service_role"
])assert.ok(migration.includes(marker),"Missing durable audit/security: "+marker);
assert.ok(!cronText.includes("follow_up_sent_at:null"),"Never clear the quote sent marker on timeout");
assert.ok(cronText.includes("idempotencyKey:key"));
assert.ok(editor.includes("Automatisk oppfølging av tilbud"));
assert.ok(editor.includes("Frigi etter bekreftet IKKE sendt"));
assert.ok(editor.includes("Bekreft sendt hos Resend"));
console.log("S-03 bestått: én automatisk e-post, varig sperre etter timeout, eierkontroll, gjenoppretting, gyldighet, alternativ mottaker, preview og samtidige kjøringer.");
