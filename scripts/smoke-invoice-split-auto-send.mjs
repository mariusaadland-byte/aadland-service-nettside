import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261026203000_invoice_split_two_autosend.sql");
for(const word of ["split_invoice_draft_in_two","for update","first_total+second_total<>source_total",
 "invoice_split_group_unique","p_second_on<=p_first_on","status<>'draft'",
 "protect_split_invoice_draft","set_split_invoice_due_at_issue","claim_scheduled_invoice_sends",
 "for update skip locked","grant execute on function public.split_invoice_draft_in_two"]){
 // issuing stays in the existing trigger/function; the SQL mentions it in comments.
 assert.ok(sql.includes(word),word+" missing in migration");
}
assert.ok(sql.includes("new.due_date:=new.issued_date+old.payment_terms_override_days"),
 "Each split invoice's due date must derive from its actual issue date");
assert.ok(sql.includes("first_items")&&sql.includes("second_items"));
assert.ok(sql.includes("status='draft' and planned_send_on<=p_today"));
assert.ok(sql.includes("work_date>p_first_on"));
const page=read("app/admin/faktura/InvoicesClient.js");
const panel=read("app/admin/faktura/InvoiceSplitPanel.js");
const invoices=read("app/api/admin/invoices/route.js");
const terms=read("lib/invoicePaymentTerms.js");
const send=read("app/api/admin/invoices/send/route.js");
const issue=read("app/api/admin/invoices/issue/route.js");
const cron=read("app/api/cron/scheduled-invoices/route.js");
const config=JSON.parse(read("vercel.json"));
assert.ok(config.crons.some(x=>x.path==="/api/cron/scheduled-invoices"));
assert.ok(page.includes("<InvoiceSplitPanel"));
assert.ok(page.includes("Avbryt autosending av del 2"));
assert.ok(page.includes("!form.split_group_id)await persist(form)"));
assert.ok(page.includes("!form.split_group_id&&<InvoiceVippsPanel"));
assert.ok(page.includes("Boolean(form.split_group_id)"));
assert.ok(panel.includes("Del faktura i 2"));
assert.ok(panel.includes("autoSendSecond"));
assert.ok(panel.includes("firstTermsDays")&&panel.includes("secondTermsDays"));
assert.ok(panel.includes("await onPrepare?.()"));
assert.ok(panel.includes("window.confirm("));
assert.ok(invoices.includes("split_group_id,split_part,payment_terms_override_days"));
assert.ok(sql.includes("old.split_group_id is not null"));
assert.ok(terms.includes("invoice.payment_terms_override_days??"));
assert.ok(issue.includes("invoice.planned_send_on>osloDateKey(new Date())"));
assert.ok(send.includes('invoice.auto_send_state!=="processing"'));
assert.ok(send.includes('invoice.auto_send_state==="scheduled"'));
assert.ok(send.includes("invoice.planned_send_on>today"));
assert.ok(send.includes("idempotencyKey:\"invoice-send/\"+id"));
assert.ok(send.includes('auto_send_state:"sent"'));
assert.ok(cron.includes("cronGuard(req)"));
assert.ok(cron.includes("process.env.VERCEL_ENV!==\"production\""));
assert.ok(cron.includes("claim_scheduled_invoice_sends"));
assert.ok(cron.includes("await sendInvoice(internal)"));
assert.ok(cron.includes('auto_send_state:delivered?"sent":"needs_review"'));
assert.ok(cron.includes("await sendInvoice(internal)"),"Scheduled customer delivery must use idempotent invoice sender");
assert.ok(cron.includes("sendScheduledInvoiceOwnerNotice"),"Owner review notice uses separate idempotent helper");
const raw=read("app/api/admin/invoices/split/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
let owner="owner",originFailure=false,calls=0,preview=false,cronSecret="good";
const posted=[];
const rpc=(name,args)=>{assert.equal(name,"split_invoice_draft_in_two");
 posted.push(args);calls++;
 return {data:{firstId:args.p_invoice_id,secondId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  secondDate:args.p_second_on},error:null};};
const db=()=>({rpc,from(){throw Error("No table writes for this test");}});
const validDay=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||""));
const env={get VERCEL_ENV(){return preview?"preview":"production"},
 get CRON_SECRET(){return cronSecret},get RESEND_API_KEY(){return "test-key"}};
const POST=new Function("NextResponse","getAdminUser","db","sameOriginGuard","validInvoiceDay","process",
 raw+";return POST;")({json:(body,o={})=>({status:o.status||200,body})},
 async()=>({role:owner}),db,()=>originFailure?{status:403}:null,validDay,{env});
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const body={invoiceId:id,firstPercent:40,firstSendOn:"2026-10-27",
 secondSendOn:"2026-11-04",firstTermsDays:7,secondTermsDays:21,
 autoSendSecond:true,confirmed:true};
const call=data=>POST({json:async()=>data});
let result=await call(body);
assert.equal(result.status,200);
assert.equal(posted[0].p_first_percent,40);
assert.equal(posted[0].p_second_days,21);
assert.equal(posted[0].p_auto_second,true);
owner="staff";result=await call(body);assert.equal(result.status,403);
owner="owner";result=await call({...body,firstPercent:100});assert.equal(result.status,400);
result=await call({...body,secondSendOn:"2026-10-27"});assert.equal(result.status,400);
result=await call({...body,confirmed:false});assert.equal(result.status,400);
result=await call({...body,firstTermsDays:-1});assert.equal(result.status,400);
result=await call({...body,autoSendSecond:"yes"});assert.equal(result.status,400);
cronSecret="";result=await call(body);assert.equal(result.status,503);
cronSecret="good";preview=true;result=await call(body);assert.equal(result.status,403);
assert.equal(calls,1,"Unsafe calls must never reach the split RPC");
console.log("Del faktura i to bestått: skilt dato/frist, servervalidering, totalsum, autosend, cron-sikkerhet og låste utstedte fakturaer.");
