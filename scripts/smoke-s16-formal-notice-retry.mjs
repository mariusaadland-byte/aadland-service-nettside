import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// These tests never contact Resend and never read or write production data.
const read=p=>readFileSync(p,"utf8");
const helperSource=read("lib/invoiceReminderRetrySafety.js");
const {invoiceReminderRetryAllowed,INVOICE_REMINDER_RETRY_WINDOW_MS,INVOICE_REMINDER_RETRY_BLOCKED_MESSAGE}=
 await import("data:text/javascript,"+encodeURIComponent(helperSource));
const now=Date.parse("2026-11-21T13:00:00.000Z");
const created=age=>new Date(now-age).toISOString();
const row=(age,status="pending")=>({status,created_at:created(age)});
const h=60*60*1000;
assert.equal(INVOICE_REMINDER_RETRY_WINDOW_MS,23*h);
assert.equal(invoiceReminderRetryAllowed(row(0),now),true);
assert.equal(invoiceReminderRetryAllowed(row(22.9*h),now),true);
assert.equal(invoiceReminderRetryAllowed(row(23*h),now),false);
assert.equal(invoiceReminderRetryAllowed(row(26*h,"failed"),now),false);
assert.equal(invoiceReminderRetryAllowed(row(2*h,"sent"),now),false);
assert.equal(invoiceReminderRetryAllowed({...row(1*h),created_at:null},now),false);
assert.equal(invoiceReminderRetryAllowed({...row(1*h),created_at:"invalid"},now),false);
assert.equal(invoiceReminderRetryAllowed({status:"pending",created_at:new Date(now+6*60*1000).toISOString()},now),false);
assert.equal(invoiceReminderRetryAllowed({status:"pending",created_at:new Date(now+4*60*1000).toISOString()},now),true);
assert.match(INVOICE_REMINDER_RETRY_BLOCKED_MESSAGE,/Resend/);

const api=read("app/api/admin/invoices/reminders/route.js");
const ui=read("app/admin/faktura/InvoiceReminderPanel.js");
assert.ok(api.includes('process.env.VERCEL_ENV!=="production"'),"No emails from preview/development");
const guardPos=api.indexOf("if(!invoiceReminderRetryAllowed(record))");
const sendPos=api.indexOf("resend.emails.send(");
assert.ok(guardPos>0&&sendPos>guardPos,"Do not call Resend before a safe retry-window check");
assert.ok(api.includes("INVOICE_REMINDER_RETRY_BLOCKED_MESSAGE"));
assert.ok(api.includes('idempotencyKey:"invoice-reminder/"+record.id'));
assert.ok(!api.includes("historikken kunne ikke oppdateres. Prøv samme utsending igjen"));
assert.ok(ui.includes("pendingNeedsManualReview"));
assert.ok(ui.includes("!blockFollowup&&!pendingNeedsManualReview"));
assert.ok(ui.includes('role="alert"'));
assert.ok(ui.includes("Kontroller gammel utsending"));

const routeSource=api.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"").replace("export async function GET","async function GET").replace("export async function POST","async function POST");
const invoiceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const requestId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const invoice={id:invoiceId,invoice_number:"TEST-NO",status:"sent",title:"Kun lokal test",
 due_date:"2026-10-01",customer:{name:"Demo",email:"demo@example.invalid"},
 line_items:[],paid_ore:0,credited_ore:0,pdf_base64:null};
let record={id:requestId,invoice_id:invoiceId,status:"failed",created_at:created(25*h),
  recipient:"demo@example.invalid",outstanding_ore:5000,due_date:"2026-12-08",kind:"purring",
  subject:"Test",body:"Test",pdf_base64:null};
let rpcCount=0,writeCount=0,innerInvoiceLoads=0;
function fakeDb(){
 return {
  from(table){
   const q={
    select(){return q},eq(){return q},
    async maybeSingle(){
     if(table==="invoice_drafts")return {data:invoice,error:null};
     if(table==="invoice_reminder_sends")return {data:null,error:null};
     throw Error("Unexpected maybeSingle "+table);
    },
    async limit(){return {data:[],error:null}},
    async single(){
     innerInvoiceLoads++;
     return {data:invoice,error:null};
    },
    update(){writeCount++;return q},
    async neq(){return {data:null,error:null}}
   };
   return q;
  },
  async rpc(name){
   assert.equal(name,"prepare_invoice_notice");
   rpcCount++;
   return {data:record,error:null};
  }
 }
}
const response={json:(body,{status=200}={})=>({body,status})};
const processMock={env:{VERCEL_ENV:"production",RESEND_API_KEY:"unused-test-key"}};
const POST=new Function("NextResponse","getAdminUser","sameOriginGuard","db","isValidDateInput",
 "invoicePaymentState","invoiceSettlementInfo","summarizeInvoiceActivity","reminderText",
 "osloDateKey","invoiceReminderRetryAllowed","INVOICE_REMINDER_RETRY_BLOCKED_MESSAGE","process",
 routeSource+";return POST;")(
 response,async()=>({role:"owner",id:"cccccccc-cccc-4ccc-8ccc-cccccccc0001"}),
 ()=>null,fakeDb,()=>true,()=>({outstanding:5000}),
 ()=>({kind:"ok"}),arr=>arr,()=>({subject:"Test",body:"Test"}),
 ()=>"2026-11-21",
 value=>invoiceReminderRetryAllowed(value,now),INVOICE_REMINDER_RETRY_BLOCKED_MESSAGE,
 processMock
);
const payload={invoiceId,requestId,kind:"purring",dueDate:"2026-12-08",outstandingOre:5000};
const send=()=>POST({json:async()=>payload});
let result=await send();
assert.equal(result.status,409,"Never resend an old uncertain notice");
assert.match(result.body.error,/Kontroller meldingen i Resend/);
assert.equal(rpcCount,1);
assert.equal(innerInvoiceLoads,0,"No PDF or Resend path reached");
assert.equal(writeCount,0,"No mutation on an expired retry");
record={...record,status:"sent"};
result=await send();
assert.equal(result.status,200);
assert.equal(result.body.alreadySent,true);
assert.equal(innerInvoiceLoads,0);
record={...record,status:"pending",created_at:created(2*h)};
result=await send();
assert.equal(result.status,502,"Fresh records may proceed through guard; PDF mock stops before Resend");
assert.ok(innerInvoiceLoads>0);
assert.ok(writeCount>0);
processMock.env.VERCEL_ENV="preview";
const before=rpcCount;
result=await send();
assert.equal(result.status,403);
assert.equal(rpcCount,before);
console.log("S-16: 23h resendgrense, ukjent tid, gamle/eksisterende varsler, sikker UI og produksjonssperre bestått uten e-post.");
