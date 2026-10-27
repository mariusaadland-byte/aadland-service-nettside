import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Fully simulated cron lifecycle: in-memory records, mock email provider,
// no Supabase connection, no live invoice number and no outbound email.
const read=file=>readFileSync(file,"utf8");
const cronSource=read("app/api/cron/scheduled-invoices/route.js")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const preflightSource=read("lib/scheduledInvoicePreflight.js").replace(/^export /gm,"");
const scheduledInvoicePreflight=new Function(preflightSource+";return scheduledInvoicePreflight;")();
const firstId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const contactId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const today="2026-11-10";
const dayBefore="2026-11-09";

function scenario(mode="success"){
 const customer={contactId,name:"Fiktiv kunde AS",email:"test@example.invalid",
  address:"Testveien 1",phone:"90000000",customerType:"business",
  organizationNumber:"987654321",contactPerson:"Test Person",paymentMethod:"bank"};
 const contact={id:contactId,name:customer.name,email:customer.email,address:customer.address,
  phone:customer.phone,customer_type:customer.customerType,
  organization_number:customer.organizationNumber,contact_person:customer.contactPerson};
 const rows={
  [firstId]:{id:firstId,status:"sent",sent_at:"2026-11-01T10:00:00Z",credited_ore:0},
  [secondId]:{id:secondId,status:"draft",split_group_id:firstId,split_part:2,
   automatic_send:true,auto_send_state:"scheduled",planned_send_on:today,
   first_send_at:null,sent_at:null,customer,invoice_number:null,
   line_items:[{description:"Fiktivt arbeid",quantity:2,unitPriceOre:10000,vatRate:25}],
   total_ore:25000}
 };
 if(mode==="unsent-first")rows[firstId].status="issued";
 if(mode==="credited-first")rows[firstId].credited_ore=1;
 if(mode==="edited-customer")contact.address="Annen testadresse";
 if(mode==="stale"){
  rows[secondId].auto_send_state="processing";
  rows[secondId].auto_send_claimed_at="2026-11-09T09:00:00Z";
 }
 let providerCalls=0,ownerCalls=0,reads=0,writes=0,claimCount=0;
 const noticed=new Set();
 const originalAmount=rows[secondId].total_ore;
 const originalLines=JSON.stringify(rows[secondId].line_items);
 const snapshot=row=>row?structuredClone(row):null;
 const db={
  rpc:async (name,args={})=>{
   if(name==="expire_stale_scheduled_invoice_claims"){
    const second=rows[secondId];
    if(second.auto_send_state!=="processing"||mode!=="stale")
     return {data:[],error:null};
    second.auto_send_state=second.status==="sent"?"sent":"needs_review";
    second.auto_send_error="Simulert avbrutt jobb";
    writes++;
    return {data:[{invoice_id:secondId,final_state:second.auto_send_state}],error:null};
   }
   assert.equal(name,"claim_scheduled_invoice_sends");
   assert.equal(args.p_today,today);
   const invoice=rows[secondId];
   if(invoice.automatic_send&&invoice.auto_send_state==="scheduled"&&
      invoice.status==="draft"&&invoice.planned_send_on<=args.p_today){
    invoice.auto_send_state="processing";claimCount++;writes++;
    return {data:[{invoice_id:secondId}],error:null};
   }
   return {data:[],error:null};
  },
  from(table){
   assert.ok(["invoice_drafts","admin_customer_contacts"].includes(table));
   function builder(changes=null){
    const predicates=[];
    const chain={
     select(){return chain;},
     eq(key,value){predicates.push([key,value]);return chain;},
     update(next){
      assert.equal(table,"invoice_drafts");
      return builder(next);
     },
     async maybeSingle(){
      reads++;
      const candidates=table==="invoice_drafts"?Object.values(rows):[contact];
      const record=candidates.find(row=>predicates.every(([field,value])=>row?.[field]===value));
      return {data:snapshot(record),error:null};
     },
     then(onFulfilled,onRejected){
      const candidates=table==="invoice_drafts"?Object.values(rows):[contact];
      if(changes===null)throw Error("Unexpected query without maybeSingle");
      for(const row of candidates){
       if(predicates.every(([field,value])=>row?.[field]===value)){
        Object.assign(row,changes);writes++;
       }
      }
      return Promise.resolve({data:null,error:null}).then(onFulfilled,onRejected);
     }
    };
    return chain;
   }
   return builder();
  }
 };
 const sendInvoice=async req=>{
  assert.equal(req.headers.get("authorization"),"Bearer fixture-cron-secret");
  const body=await req.json();assert.equal(body.id,secondId);
  providerCalls++;
  if(mode==="provider-uncertain")return Response.json({error:"Ingen sikker leveringsbekreftelse"},{status:502});
  rows[secondId].status="sent";
  rows[secondId].sent_at="2026-11-10T10:20:00Z";
  rows[secondId].first_send_at="2026-11-10T10:19:50Z";
  rows[secondId].invoice_number="FIKTIV-001";
  writes++;
  if(mode==="provider-sent-then-error")throw Error("Simulert tapt API-svar etter levering");
  return Response.json({ok:true,invoiceNumber:"FIKTIV-001"});
 };
 const sendScheduledInvoiceOwnerNotice=async ({invoiceId})=>{
  assert.equal(invoiceId,secondId);
  if(!noticed.has(invoiceId)){noticed.add(invoiceId);ownerCalls++;}
 };
 const GET=new Function("NextResponse","db","cronGuard","osloDateKey","sendInvoice",
  "scheduledInvoicePreflight","sendScheduledInvoiceOwnerNotice","process","Request",
  cronSource+";return GET;")(
   {json:(body,opts={})=>Response.json(body,{status:opts.status||200})},
   ()=>db,
   req=>req.headers.get("authorization")==="Bearer fixture-cron-secret"?
    null:Response.json({error:"Not authorized"},{status:401}),
   ()=>today,sendInvoice,scheduledInvoicePreflight,sendScheduledInvoiceOwnerNotice,
   {env:{VERCEL_ENV:"production",RESEND_API_KEY:"fixture-only",CRON_SECRET:"fixture-cron-secret"}},
   Request);
 const invoke=async(date=today)=>{
  const response=await GET(new Request("https://example.invalid/api/cron/scheduled-invoices",{
   headers:{authorization:"Bearer fixture-cron-secret"}}));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.date,today);
  return data;
 };
 return {invoke,rows,contact,originalAmount,originalLines,
  get stats(){return {providerCalls,ownerCalls,reads,writes,claimCount}}};
}

const ok=scenario();
let answer=await ok.invoke();
assert.equal(answer.processed,1);
assert.equal(answer.results[0].status,"sent");
assert.equal(ok.stats.providerCalls,1);
assert.equal(ok.stats.ownerCalls,0);
assert.equal(ok.rows[secondId].auto_send_state,"sent");
assert.equal(ok.rows[secondId].invoice_number,"FIKTIV-001");
answer=await ok.invoke();
assert.equal(answer.processed,0,"A subsequent scheduled run must not send again");
assert.equal(ok.stats.providerCalls,1,"Exactly once mock provider call");

for(const [type,reason] of [
 ["unsent-first",/Del 1/],
 ["credited-first",/kreditert/],
 ["edited-customer",/Fakturaadresse/],
 ["provider-uncertain",/Ingen sikker leveringsbekreftelse/]
]){
 const caseData=scenario(type);
 answer=await caseData.invoke();
 assert.equal(answer.processed,1,type);
 assert.equal(answer.results[0].status,"needs_review",type);
 assert.equal(caseData.rows[secondId].auto_send_state,"needs_review",type);
 assert.match(caseData.rows[secondId].auto_send_error,reason,type);
 assert.equal(caseData.stats.ownerCalls,1,type);
 assert.equal(caseData.stats.providerCalls,type==="provider-uncertain"?1:0,
  "Preflight must stop invalid invoices before customer delivery");
 assert.equal(caseData.rows[secondId].invoice_number,null,
  "Invalid scheduled invoice must not be issued by mocked sender");
 assert.equal(caseData.rows[secondId].total_ore,caseData.originalAmount);
 assert.equal(JSON.stringify(caseData.rows[secondId].line_items),caseData.originalLines);
 answer=await caseData.invoke();
 assert.equal(answer.processed,0,"Held invoice cannot automatically retry");
 assert.equal(caseData.stats.ownerCalls,1,"No repeated owner notice");
}

const ambiguous=scenario("provider-sent-then-error");
answer=await ambiguous.invoke();
assert.equal(answer.results[0].status,"sent",
 "Sent invoice must not be mislabeled as unsent when a response is lost");
assert.equal(ambiguous.stats.ownerCalls,0);
assert.equal(ambiguous.stats.providerCalls,1);
answer=await ambiguous.invoke();assert.equal(answer.processed,0);
assert.equal(ambiguous.stats.providerCalls,1);

const expired=scenario("stale");
answer=await expired.invoke();
assert.equal(answer.recoveredForReview,1);
assert.equal(answer.processed,0);
assert.equal(expired.rows[secondId].auto_send_state,"needs_review");
assert.equal(expired.stats.providerCalls,0);
assert.equal(expired.stats.ownerCalls,1);
answer=await expired.invoke();
assert.equal(answer.processed,0);
assert.equal(expired.stats.ownerCalls,1);

assert.ok(read("vercel.json").includes("/api/cron/scheduled-invoices"));
console.log("Simulert ende-til-ende autosending bestått: én sending, ingen duplikat, blokkert del 1/kreditering/kundeendring, ukjent providerutfall, foreldet cron-claim og uendrede beløp. Ingen ekte e-post eller faktura.");
