import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";

const read=p=>readFileSync(p,"utf8");
const oldSecret=process.env.QUOTE_LINK_SECRET;
process.env.QUOTE_LINK_SECRET="s19-local-test-key-never-used-for-customers";
const core=read("lib/quoteLinks.js").replace(/^import "server-only";\n/,"");
const {createQuoteToken,verifyQuoteToken,quoteLinkPubliclyAllowed,QUOTE_LINK_MAX_AGE_SECONDS}=
 await import("data:text/javascript;base64,"+Buffer.from(core).toString("base64"));
const hour=3600,day=24*hour;
const now=Date.parse("2026-11-21T13:00:00Z");
const issuedAt=new Date(now-3*day*1000).toISOString();
const quote={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
 quote_number:"AS-S19-TEST",
 customer:{email:"client@example.invalid"},
 status:"sent",sent_at:issuedAt,valid_until:"2026-12-10",
 quote_link_generation:1,quote_link_disabled_at:null
};
assert.equal(QUOTE_LINK_MAX_AGE_SECONDS,60*day);
const v2=createQuoteToken(quote,now);
assert.match(v2,/^v2\.\d{10}\.([a-f0-9]{64})$/);
assert.equal(verifyQuoteToken(quote,v2,now),true);
assert.equal(verifyQuoteToken(quote,v2.replace(/.$/,"0"),now),false);
assert.equal(verifyQuoteToken(quote,"",now),false);
assert.equal(verifyQuoteToken({...quote,id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001"},v2,now),false);
assert.equal(verifyQuoteToken({...quote,customer:{email:"other@example.invalid"}},v2,now),false);
assert.equal(verifyQuoteToken({...quote,quote_link_generation:2},v2,now),false);
assert.equal(verifyQuoteToken({...quote,quote_link_disabled_at:issuedAt},v2,now),false);
assert.equal(verifyQuoteToken({...quote,valid_until:"2026-11-20"},v2,now),false);
assert.equal(verifyQuoteToken({...quote,status:"draft"},v2,now),false);
assert.equal(verifyQuoteToken({...quote,status:"superseded"},v2,now),false);
assert.equal(verifyQuoteToken({...quote,status:"cancelled"},v2,now),false);
assert.equal(verifyQuoteToken({...quote,status:"accepted"},v2,now),true);
assert.equal(verifyQuoteToken({...quote,status:"declined"},v2,now),true);
assert.equal(verifyQuoteToken({...quote,sent_at:null},v2,now),false);
assert.equal(quoteLinkPubliclyAllowed(quote,now),true);
assert.equal(quoteLinkPubliclyAllowed({...quote,valid_until:"2026-11-20"},now),false);
assert.equal(verifyQuoteToken({...quote,valid_until:null},v2,now+(61*day*1000)),false,"Token expires at 60 days even when quote has no end date.");
const future=createQuoteToken(quote,now+(10*60*1000));
assert.equal(verifyQuoteToken(quote,future,now),false,"Token from far future is rejected.");
const legacy=crypto.createHmac("sha256",process.env.QUOTE_LINK_SECRET)
 .update([quote.id,quote.quote_number,quote.customer.email].join("|")).digest("hex");
assert.equal(verifyQuoteToken(quote,legacy,now),true,"Genuine legacy link remains usable only for a still-active recently sent quote.");
assert.equal(verifyQuoteToken({...quote,quote_link_generation:2},legacy,now),false);
assert.equal(verifyQuoteToken({...quote,valid_until:"2026-11-20"},legacy,now),false);
assert.equal(verifyQuoteToken({...quote,sent_at:new Date(now-61*day*1000).toISOString(),valid_until:null},legacy,now),false);
assert.throws(()=>createQuoteToken({...quote,quote_link_disabled_at:issuedAt},now),/sperret/);

const api=read("app/api/quotes/[id]/route.js");
const noImports=api.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"").replace(/^export async function (GET|POST)\(/gm,"async function $1(");
let account=null,writeCount=0,readCount=0,quoteRow={...quote};
const dataClient=()=>({from(table){
 assert.equal(table,"quotes");
 const q={
  select(){return q},eq(){return q},
  async maybeSingle(){readCount++;return {data:quoteRow,error:null}},
  update(){writeCount++;return q}
 };
 return q;
}});
const response={json:(body,options={})=>({body,status:options.status||200,headers:options.headers||{}})};
const parsed=new Function("sameOriginGuard","NextResponse","db","verifyQuoteToken","getCustomer","osloDateKey","process",noImports+";return {GET,POST};")(
 ()=>null,response,dataClient,(q,t)=>verifyQuoteToken(q,t,now),async()=>account,
 ()=>"2026-11-21",{env:{RESEND_API_KEY:""}});
const request=t=>({url:"https://www.aadland-service.no/api/quotes/"+quote.id,headers:{get:k=>k.toLowerCase()==="x-quote-token"?t:null}});
const opts={params:{id:quote.id}};
let result=await parsed.GET(request(v2),opts);
assert.equal(result.status,200);
assert.equal(result.body.quote.id,quote.id);
assert.match(result.headers["Cache-Control"],/no-store/);
assert.equal(result.headers["Referrer-Policy"],"no-referrer");
result=await parsed.GET(request(""),opts);
assert.equal(result.status,403);
result=await parsed.GET(request("wrong"),opts);
assert.equal(result.status,403);
quoteRow={...quote,valid_until:"2026-11-20",status:"accepted",accepted_at:issuedAt};
result=await parsed.GET(request(v2),opts);
assert.equal(result.status,403,"Expired accepted quotes require authenticated history.");
account={email:"CLIENT@example.invalid"};
result=await parsed.GET(request(""),opts);
assert.equal(result.status,200,"A matching account can view its historic issued offer.");
account={email:"foreign@example.invalid"};
result=await parsed.GET(request(""),opts);
assert.equal(result.status,403,"Cross-account quote history must be forbidden.");
account={email:"client@example.invalid"};
quoteRow={...quote,status:"draft",sent_at:null};
result=await parsed.GET(request(""),opts);
assert.equal(result.status,403,"Own draft must never become public history.");
const invalidPost={url:request("").url,json:async()=>({action:"accept",token:"bad"}),headers:request("").headers};
quoteRow={...quote,quote_link_disabled_at:issuedAt};
account=null;
result=await parsed.POST(invalidPost,opts);
assert.equal(result.status,403);
assert.equal(writeCount,0,"Denied quote actions must not mutate data or email customers.");
assert.ok(readCount>=7);

const ownerApi=read("app/api/admin/quotes/link/route.js");
for(const required of [
 'getAdminUser','user?.role==="owner"','sameOriginGuard(req)','quote_link_generation',
 'quote_link_disabled_at','"SPERR LENKE"','"NY LENKE"',
 '.eq("quote_link_generation",generation)','validForReissue(quote)',
 'createQuoteToken(updated.data)','"Cache-Control":"private, no-store"'
])assert.ok(ownerApi.includes(required),"Missing owner link-security guard: "+required);
// Exercise owner revoke/rotate through the real handler with an in-memory quote.
// Nothing is sent to Resend and the database is not contacted.
const ownerSource=ownerApi.replace(/^import .*;\n/gm,"")
 .replace(/^export const dynamic=.*;\n/gm,"")
 .replace(/export async function (GET|POST)\(/g,"async function $1(");
let admin=null,mutations=0;
let ownerQuote={...quote,sent_at:new Date().toISOString(),
 valid_until:new Date(Date.now()+20*day*1000).toISOString().slice(0,10)};
const ownerDb=()=>({from(table){
 assert.equal(table,"quotes");
 const checks=[];let patch=null;
 const q={
  select(){return q},
  eq(name,value){checks.push([name,value]);return q},
  update(value){patch=value;return q},
  async maybeSingle(){
   if(!checks.every(([key,value])=>ownerQuote[key]===value))return {data:null,error:null};
   if(patch){ownerQuote={...ownerQuote,...patch};mutations++;}
   return {data:{...ownerQuote},error:null};
  }
 };
 return q;
}});
const owners=new Function("NextResponse","getAdminUser","sameOriginGuard","db",
 "createQuoteToken","QUOTE_LINK_MAX_AGE_SECONDS","osloDateKey","process",
 ownerSource+";return {GET,POST};")(
 response,async()=>admin,()=>null,ownerDb,createQuoteToken,
 QUOTE_LINK_MAX_AGE_SECONDS,
 d=>new Date(d).toISOString().slice(0,10),
 {env:{NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no"}}
);
const ownerRequest={url:"https://www.aadland-service.no/api/admin/quotes/link?id="+quote.id};
const ownerPost=(action,confirmation)=>owners.POST({
 json:async()=>({id:quote.id,action,confirmation})
});
result=await owners.GET(ownerRequest);assert.equal(result.status,403);
admin={id:"owner",role:"staff"};
result=await ownerPost("disable","SPERR LENKE");assert.equal(result.status,403);
admin={id:"owner",role:"owner"};
result=await ownerPost("disable","wrong");assert.equal(result.status,400);
assert.equal(mutations,0);
result=await owners.GET(ownerRequest);assert.equal(result.status,200);
assert.equal(result.body.enabled,true);
const oldActiveToken=createQuoteToken(ownerQuote);
result=await ownerPost("disable","SPERR LENKE");
assert.equal(result.status,200);
assert.equal(result.body.enabled,false);
assert.equal(ownerQuote.quote_link_generation,2);
assert.ok(ownerQuote.quote_link_disabled_at);
assert.equal(verifyQuoteToken(ownerQuote,oldActiveToken),false);
result=await ownerPost("disable","SPERR LENKE");
assert.equal(result.body.alreadyDisabled,true);
assert.equal(mutations,1,"No further generation update for already disabled quote");
result=await ownerPost("rotate","NY LENKE");
assert.equal(result.status,200);
assert.equal(ownerQuote.quote_link_generation,3);
assert.equal(ownerQuote.quote_link_disabled_at,null);
assert.match(result.body.link,/^https:\/\/www\.aadland-service\.no\/tilbud\/.*#token=v2\./);
const newActiveToken=decodeURIComponent(result.body.link.split("#token=")[1]);
assert.equal(verifyQuoteToken(ownerQuote,newActiveToken),true);
assert.equal(verifyQuoteToken(ownerQuote,oldActiveToken),false);
ownerQuote={...ownerQuote,status:"accepted"};
result=await ownerPost("rotate","NY LENKE");
assert.equal(result.status,409,"Owner cannot renew sharing link for completed quote.");
assert.equal(mutations,2,"Completed quote must not be changed");

const history=read("app/api/customer/me/route.js");
assert.ok(!history.includes("createQuoteToken"));
assert.ok(!history.includes('"?token="'));
const ui=read("app/tilbud/[id]/QuoteCustomerClient.js");
assert.ok(ui.includes("load(token)"));
assert.ok(!ui.includes("if(!token){setLoading(false)"));
const ownerPage=read("app/admin/tilbud/[id]/page.js");
const ownerEditor=read("app/admin/tilbud/QuoteEditorClient.js");
assert.ok(ownerPage.includes('isOwner={admin.role==="owner"}'));
assert.ok(ownerEditor.includes('<QuoteLinkControls quoteId={quoteId}/>'));
const followup=read("app/api/cron/quote-followups/route.js");
assert.ok(followup.includes('.is("quote_link_disabled_at",null)'));
assert.ok(followup.includes('Number(current.data.quote_link_generation)!==Number(quote.quote_link_generation)'));
const migration=read("supabase/migrations/20261121153824_quote_link_controls_s19.sql");
assert.ok(migration.includes("quote_link_generation")&&migration.includes("quote_link_disabled_at"));

// Legacy or malformed stored JSON may contain arbitrary internal fields.
// Both public token and session access must return only customer-facing scalars.
quoteRow={...quote,customer:{...quote.customer,name:"Test",contactId:"private-reference",internalNotes:"private",phone:{secret:"nested"}},line_items:[{id:"L1",description:"Testvare",type:"material",quantity:2,unit:"stk",unitPriceOre:100,vatRate:25,internalUnitCostOre:42,supplierCost:10,internalNotes:"private"}],payment_plan:[{id:"P1",label:"Forskudd",percent:25,trigger:"Avtale",internalNotes:"private"}]};
account=null;
result=await parsed.GET(request(v2),opts);
assert.equal(result.status,200);
assert.deepEqual(result.body.quote.lineItems,[{id:"L1",type:"material",description:"Testvare",quantity:2,unit:"stk",unitPriceOre:100,vatRate:25}]);
assert.deepEqual(result.body.quote.paymentPlan,[{id:"P1",label:"Forskudd",percent:25,trigger:"Avtale"}]);
assert.deepEqual(result.body.quote.customer,{name:"Test",email:quote.customer.email});
account={email:quote.customer.email};
result=await parsed.GET(request(""),opts);
assert.equal(result.status,200);
assert.ok(!JSON.stringify(result.body).includes("internalUnitCostOre"));
assert.ok(!JSON.stringify(result.body).includes("private-reference"));
console.log("S19 public quote field isolation: historical internal fields and nested payloads excluded for token and session.");

if(oldSecret==null)delete process.env.QUOTE_LINK_SECRET;else process.env.QUOTE_LINK_SECRET=oldSecret;
console.log("S-19 bestått: utløpsdato, 60d HMAC, gamle lenker, revokering, eierkontroll, kundens innloggede historikk og null uønskede handlinger.");
