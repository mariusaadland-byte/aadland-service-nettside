import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const src=read("lib/scheduledInvoicePreflight.js").replace(/^export /gm,"");
const {scheduledInvoicePreflight}=new Function(src+";return {scheduledInvoicePreflight};")();
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contactId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const original={contactId,name:"Firma Eksempel AS",email:"KUNDE@example.invalid",
 address:"Eksempelgata 1",phone:"90000000",customerType:"business",
 organizationNumber:"987654321",contactPerson:"Morten Eksempel",paymentMethod:"bank"};
const latest={id:contactId,name:"Firma Eksempel AS",email:"kunde@example.invalid",
 address:"Eksempelgata 1",phone:"90000000",customer_type:"business",
 organization_number:"987654321",contact_person:"Morten Eksempel"};
const invoice={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",split_group_id:id,
 status:"draft",split_part:2,automatic_send:true,auto_send_state:"processing",
 planned_send_on:"2026-11-10",first_send_at:null,customer:original};
const firstInvoice={id,status:"sent",sent_at:"2026-11-01T11:30:00.000Z",credited_ore:0};
const check=(patch={},first=firstInvoice,contact=latest,today="2026-11-10")=>
 scheduledInvoicePreflight({invoice:{...invoice,...patch},firstInvoice:first,contact,today});
assert.equal(check().ok,true,"Recipient current and first sent");
assert.equal(check({},firstInvoice,{...latest,email:" KUNDE@EXAMPLE.INVALID "}).ok,true);
assert.equal(check({}, {...firstInvoice,credited_ore:1}).ok,false,
 "Any partial credit must stop a scheduled second invoice");
assert.match(check({}, {...firstInvoice,credited_ore:1}).reason,/kreditert/);
assert.equal(check({}, {...firstInvoice,credited_ore:125000}).ok,false,
 "A fully credited first installment must block automatic second installment");
assert.equal(check({}, {...firstInvoice,credited_ore:"0"}).ok,true,
 "Supabase bigint values may be serialized as numeric strings");
assert.equal(check({}, {...firstInvoice,credited_ore:undefined}).ok,false,
 "Unknown credit status must fail closed");
assert.equal(check({}, {...firstInvoice,credited_ore:-1}).ok,false,
 "Invalid credit status must fail closed");
for(const field of ["name","email","address","phone","customer_type","organization_number","contact_person"]){
 const updated={...latest,[field]:field==="email"?"new@example.invalid":"ENDRET"};
 const r=check({},firstInvoice,updated);
 assert.equal(r.ok,false,field+" mismatch must block");
 assert.match(r.reason,/endret/);
}
assert.equal(check({},firstInvoice,null).ok,false);
assert.equal(check({first_send_at:"2026-11-10T08:00:00Z"}).ok,false);
assert.equal(check({}, {...firstInvoice,status:"issued",sent_at:null}).ok,false,
 "Printed first invoice must not count as email-sent");
assert.equal(check({},null).ok,false);
assert.equal(check({},firstInvoice,latest,"2026-11-09").ok,false);
assert.equal(check({auto_send_state:"needs_review"}).ok,false);
assert.equal(check({automatic_send:false}).ok,false);
assert.equal(check({customer:{...original,email:"bad"}}).ok,false);
assert.equal(check({customer:{...original,paymentMethod:"vipps"}}).ok,false);
const unlinked={...original,contactId:""};
assert.equal(check({customer:unlinked},firstInvoice,null).ok,true,
 "Unlinked customers are only checked against the frozen draft");
const cron=read("app/api/cron/scheduled-invoices/route.js");
assert.ok(cron.indexOf("scheduledInvoicePreflight(")<cron.indexOf("await sendInvoice(internal)"),
 "Preflight must run before any issue/send attempt");
assert.ok(cron.includes("expire_stale_scheduled_invoice_claims"));
assert.ok(cron.includes('select("id,status,sent_at,credited_ore")'),
 "The automatic send query must load credit amount, not silently treat it as zero");
assert.ok(src.includes("credited>0"),"Credited first installments must block autosending");
assert.ok(cron.includes("auto_send_state:delivered?\"sent\":\"needs_review\""));
assert.ok(cron.includes("sendScheduledInvoiceOwnerNotice"),"Notify owner for both interrupted and failed sends");
assert.ok(!cron.includes("resend.emails.send({from"),"Do not send directly to customer from cron");
const splitApi=read("app/api/admin/invoices/split/route.js");
assert.ok(splitApi.includes('"review_manual"'));
assert.ok(splitApi.includes('review_scheduled_invoice_for_manual_send'));
const issue=read("app/api/admin/invoices/issue/route.js");
const send=read("app/api/admin/invoices/send/route.js");
assert.ok(issue.includes('auto_send_state==="needs_review"'),"Owner must review before issuing");
assert.ok(send.includes('auto_send_state==="needs_review"'),"Owner must review before sending");
const sql=read("supabase/migrations/20261026224000_scheduled_invoice_review_recovery.sql");
assert.ok(sql.includes("auto_send_claimed_at"));
assert.ok(sql.includes("for update skip locked"));
assert.ok(sql.includes("status='sent' or i.sent_at is not null"));
assert.ok(sql.includes("i.auto_send_state<>'needs_review'")&&sql.includes("then 'sent' else 'needs_review'"));
assert.ok(sql.includes("i.first_send_at is not null or i.invoice_number is not null"));
assert.ok(sql.includes("first_invoice.status<>'sent'"));
assert.ok(sql.includes("next_customer:=next_customer||jsonb_build_object"));
assert.ok(sql.includes("contact.contact_person"));
assert.ok(sql.includes("revoke all on function public.review_scheduled_invoice_for_manual_send"));
assert.ok(sql.includes("grant execute on function public.review_scheduled_invoice_for_manual_send(uuid) to service_role"));
const page=read("app/admin/faktura/InvoicesClient.js");
assert.ok(page.includes("Frigi for manuell sending etter kontroll"));
assert.ok(page.includes('action:"review_manual"'));
assert.ok(page.includes('auto_send_state==="needs_review"'));
console.log("Autosending sikkerhet bestått: kundeendring, adresse, del 1, ukjent e-postutfall, stale claims, varsling og kontrollert manuell frigivelse.");
