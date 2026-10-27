import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261027021500_reschedule_second_invoice_draft.sql");
for(const token of [
 "reschedule_second_invoice_draft","for update","i.status<>'draft'","i.split_part<>2",
 "i.auto_send_state not in ('scheduled','manual','cancelled')",
 "i.first_send_at is not null","i.invoice_number is not null","i.pdf_base64 is not null",
 "p_send_on<today_local","p_send_on<=first_part.planned_send_on",
 "p_send_on>(work_date+interval '1 month')","payment_terms_override_days=p_terms_days",
 "due_date=p_send_on+p_terms_days","auto_send_claimed_at=null",
 "set_config('app.scheduled_invoice_review','approved',true)",
 "revoke all on function public.reschedule_second_invoice_draft",
 "to service_role"
])assert.ok(sql.includes(token),"Missing DB guard: "+token);
assert.ok(!sql.includes("new.line_items")&&!sql.includes("line_items="),
 "RPC must never recalculate or alter total or VAT line items");
const api=read("app/api/admin/invoices/split/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
let role="owner",preview=false,cronKey="cron-test",resendKey="resend-test",calls=0;
const uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const saved=[];
const db=()=>({rpc:(name,args)=>{
 assert.equal(name,"reschedule_second_invoice_draft");
 calls++;saved.push(args);
 return {data:{id:args.p_id,plannedSendOn:args.p_send_on,termsDays:args.p_terms_days,
  autoSend:args.p_auto_send,status:args.p_auto_send?"scheduled":"manual"},error:null};
 },from(){throw Error("No other table writes expected");}});
const env={get VERCEL_ENV(){return preview?"preview":"production"},
 get CRON_SECRET(){return cronKey},get RESEND_API_KEY(){return resendKey}};
const PATCH=new Function("NextResponse","getAdminUser","db","sameOriginGuard","validInvoiceDay","process",
 api+";return PATCH;")({json:(body,o={})=>({body,status:o.status||200})},
 async()=>({role}),db,()=>null,
 value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")),{env});
const body={action:"reschedule",confirmed:true,id:uuid,
 sendOn:"2026-11-10",termsDays:21,autoSend:true};
const run=next=>PATCH({json:async()=>next});
let r=await run(body);assert.equal(r.status,200);
assert.equal(r.body.plan.plannedSendOn,"2026-11-10");
assert.equal(saved[0].p_auto_send,true);assert.equal(saved[0].p_terms_days,21);
r=await run({...body,autoSend:false,termsDays:7});assert.equal(r.status,200);
assert.equal(saved[1].p_auto_send,false);assert.equal(saved[1].p_terms_days,7);
role="staff";r=await run(body);assert.equal(r.status,403);
role="owner";r=await run({...body,termsDays:-1});assert.equal(r.status,400);
r=await run({...body,termsDays:366});assert.equal(r.status,400);
r=await run({...body,sendOn:"bad"});assert.equal(r.status,400);
r=await run({...body,confirmed:false});assert.equal(r.status,400);
r=await run({...body,autoSend:"yes"});assert.equal(r.status,400);
cronKey="";r=await run(body);assert.equal(r.status,503);
cronKey="cron-test";resendKey="";r=await run(body);assert.equal(r.status,503);
resendKey="resend-test";preview=true;r=await run(body);assert.equal(r.status,403);
assert.equal(calls,2,"Rejected changes must not write to DB");
const ui=read("app/admin/faktura/InvoiceSecondPartReschedule.js");
const page=read("app/admin/faktura/InvoicesClient.js");
assert.ok(ui.includes("Endre dato, betalingsfrist og autosending for del 2"));
assert.ok(ui.includes("action:\"reschedule\""));
assert.ok(ui.includes("window.confirm("));
assert.ok(ui.includes('["scheduled","manual","cancelled"].includes(invoice.auto_send_state)'));
assert.ok(page.includes("<InvoiceSecondPartReschedule"));
assert.ok(page.includes("scheduledSecondDrafts"),"Show upcoming automatic second-invoice sends in draft overview");
assert.ok(page.includes("Del 2 – autosending planlagt"),"Each scheduled second invoice should show its state");
assert.ok(page.includes("Del 2 – stoppet, må kontrolleres"),"Display held second-invoice send clearly");
assert.ok(page.includes('["scheduled","processing","needs_review"].includes(form.auto_send_state)'),"Held automatic invoices may not be issued from the print button");
console.log("Flytt del-faktura 2 bestått: dato, betalingsfrist, autosend, særskilt bekreftelse, statuslås og beløpsbeskyttelse.");
