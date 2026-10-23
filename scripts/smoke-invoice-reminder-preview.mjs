import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const previewSource=readFileSync("app/api/admin/invoices/reminders/preview/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace("export async function GET","async function GET");
const helperSource=readFileSync("lib/invoiceReminders.js","utf8").replace(/^export /gm,"");
const paymentSource=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const reminderFns=new Function(helperSource+";return {nextInvoiceReminder,reminderDateAfter,reminderText};")();
const paymentFns=new Function(paymentSource+";return {invoicePaymentState};")();

const invoiceId="12345678-1234-4234-8234-123456789abc";
const defaults={
 id:invoiceId,status:"issued",invoice_number:"AS-2026-TEST",
 customer:{name:"Eksempelkunde",email:"demo@example.invalid"},
 title:"Montering",due_date:"2026-10-01",line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],
 paid_ore:5000,pdf_base64:"MOCK_ORIGINAL"
};
const record={id:"22345678-1234-4234-8234-123456789abc",invoice_id:invoiceId,status:"failed",kind:"purring",
 due_date:"2026-11-07",document_date:"2026-10-20",created_at:"2026-10-20T14:00:00Z",
 recipient:"demo@example.invalid",subject:"Lagret emne",body:"Lagret purring",outstanding_ore:7500};
const today="2026-10-23",validDue="2026-11-07";
function mockResponse(value,{status=200,headers={}}={}){return {value,body:value,status,headers};}
mockResponse.json=(body,{status=200}={})=>({body,status});
const state={authorized:true,invoice:{...defaults},history:[],dbFailures:false,pdfCount:0,dbWrites:0,gen:null};
const s={from(table){
 const q={
  select(){return q},eq(){return q},order(){return q},
  async maybeSingle(){assert.equal(table,"invoice_drafts");return {data:state.invoice,error:null};},
  async limit(){assert.equal(table,"invoice_reminder_sends");return state.dbFailures?{data:null,error:{message:"offline"}}:{data:state.history,error:null};},
  update(){state.dbWrites++;throw Error("Demo preview may never write to database");}
 };
 return q;
}};
const GET=new Function("NextResponse","getAdminUser","db","invoicePaymentState","nextInvoiceReminder","reminderDateAfter","reminderText",
"isValidDateInput","osloDateKey","buildInvoiceDraftPdf",previewSource+";return GET;")(
 mockResponse,async()=>state.authorized?{role:"owner"}:null,()=>s,paymentFns.invoicePaymentState,reminderFns.nextInvoiceReminder,
 reminderFns.reminderDateAfter,reminderFns.reminderText,
 d=>/^\d{4}-\d{2}-\d{2}$/.test(d),()=>today,
 async invoice=>{state.pdfCount++;state.gen=invoice;return Buffer.from("%PDF-1.4\nmock\n%%EOF");}
);
const call=async(kind="purring",dueDate=validDue,id=invoiceId)=>GET({
 url:"https://example.invalid/api/admin/invoices/reminders/preview?invoiceId="+id+"&kind="+kind+"&dueDate="+dueDate
});
let res=await call();
assert.equal(res.status,200);
assert.match(res.headers["Content-Type"],/application\/pdf/);
assert.match(res.headers["Content-Disposition"],/FORHANDSVISNING-Purring/);
assert.equal(res.headers["Cache-Control"],"private, no-store");
assert.equal(state.gen.previewDocument,true,"Preview must be clearly marked as not sent");
assert.equal(state.gen.notice.kind,"purring");
assert.equal(state.gen.notice.outstanding_ore,7500);
assert.equal(state.gen.notice.due_date,validDue);
assert.equal(state.gen.notice.document_date,today);
assert.equal(state.dbWrites,0);
const count=state.pdfCount;
state.authorized=false;res=await call();assert.equal(res.status,403);assert.equal(state.pdfCount,count);
state.authorized=true;
res=await call("unknown");assert.equal(res.status,400);
res=await call("purring","2026-11-01");assert.equal(res.status,409,"Minimum 14-day deadline before sending");
res=await call("inkasso");assert.equal(res.status,409,"Cannot skip initial reminder");
res=await call("purring",validDue,"bad-id");assert.equal(res.status,400);
state.invoice={...defaults,paid_ore:12500};res=await call();assert.equal(res.status,409,"Do not preview reminders for settled invoice");
state.invoice={...defaults,due_date:today};res=await call();assert.equal(res.status,409,"Not due");
state.invoice={...defaults,status:"draft"};res=await call();assert.equal(res.status,409,"Never preview a draft as an issued notice");
state.invoice={...defaults,pdf_base64:null};res=await call();assert.equal(res.status,409,"Need original issued invoice PDF");
state.invoice={...defaults};
state.dbFailures=true;res=await call();assert.equal(res.status,503);
state.dbFailures=false;
state.history=[{...record}];res=await call("purring",record.due_date);assert.equal(res.status,200,"Preview frozen failed send");
assert.equal(state.gen.notice.body,record.body,"Reuse original frozen text and dates");
assert.equal(state.gen.notice.document_date,record.document_date);
res=await call("purring","2026-11-09");assert.equal(res.status,409,"Cannot silently edit earlier failed notice");
state.history=[{...record,outstanding_ore:4000}];res=await call("purring",record.due_date);assert.equal(res.status,409,"New payments stop stale reminder preview");
state.history=[{...record,status:"sent",sent_at:"2026-10-21T10:00:00Z",due_date:"2026-10-29"}];
res=await call("inkasso");assert.equal(res.status,409,"Wait for previous deadline");
state.history=[{...record,status:"sent",sent_at:"2026-10-08T10:00:00Z",due_date:"2026-10-20"}];
res=await call("inkasso");assert.equal(res.status,200,"After previous deadline show notice preview");
assert.equal(state.gen.notice.kind,"inkasso");
state.history=[{...record,status:"sent",kind:"inkasso",sent_at:"2026-10-08T10:00:00Z",due_date:"2026-10-20"}];
res=await call("inkasso");assert.equal(res.status,409,"No second notice after inkasso");

const ui=readFileSync("app/admin/faktura/InvoiceReminderPanel.js","utf8");
const pdf=readFileSync("lib/invoiceDraftPdf.js","utf8");
assert.ok(ui.includes("historyLoaded&&!loading"),"Must block send if reminders history failed");
assert.ok(ui.includes("Prøv å hente purringshistorikken igjen"),"History query errors must be recoverable");
assert.ok(ui.includes("window.confirm"),"Show final confirmation before real customer email");
assert.ok(ui.includes("/api/admin/invoices/reminders/preview?invoiceId="),"Offer read-only preview");
assert.ok(pdf.includes("FORHANDSVISNING - IKKE SENDT - IKKE GYLDIG VARSEL"),"Label actual preview PDF");
assert.doesNotMatch(previewSource,/\b(send_email|startInvoiceVipps|\.rpc\s*\(|\.update\s*\(|\.insert\s*\(|\.upsert\s*\()/,"Preview must have no write or send calls");
console.log("Purrings-PDF bestått: tilgang, frist, purringsrekkefølge, restsaldo, frosset sendeforsøk, ekte PDF-mal og null utsending/dataskriving.");
