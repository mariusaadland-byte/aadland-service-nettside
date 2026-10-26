import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/scheduledInvoiceOwnerNotice.js").replace(/^export /gm,"");
const {scheduledInvoiceOwnerNotice}=new Function(source+";return {scheduledInvoiceOwnerNotice};")();
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const result=scheduledInvoiceOwnerNotice({
 invoiceId:id,
 reason:"Tidligere utsendelsesforsøk ble avbrutt."
});
assert.equal(result.to,"post@aadland-service.no");
assert.equal(result.idempotencyKey,"scheduled-invoice-review/"+id);
assert.ok(result.text.includes("Årsak og status vises"));
assert.ok(result.text.includes("https://www.aadland-service.no/admin/faktura?id="+id));
assert.ok(result.text.includes("ikke bekreftet at e-post ble sendt"));
assert.ok(!result.text.includes("API-KEY"));
assert.throws(()=>scheduledInvoiceOwnerNotice({invoiceId:"not-an-id"}),/Ugyldig faktura-ID/);
const trimmed=scheduledInvoiceOwnerNotice({invoiceId:id,reason:"A".repeat(500)});
assert.ok(trimmed.text.length<750,"Do not send unbounded technical errors in emails");
assert.equal(trimmed.text,result.text,"Same idempotency key must have identical provider payload even if error changes");
assert.equal(trimmed.idempotencyKey,result.idempotencyKey,
 "Repeated notices about same invoice must share provider idempotency key");
const cron=read("app/api/cron/scheduled-invoices/route.js");
const expirePos=cron.indexOf('s.rpc("expire_stale_scheduled_invoice_claims")');
const notifyPos=cron.indexOf('const staleNotices=await Promise.allSettled(');
const claimPos=cron.indexOf('s.rpc("claim_scheduled_invoice_sends"');
assert.ok(expirePos>=0&&notifyPos>expirePos&&claimPos>notifyPos,
 "Check interrupted sends and notify before attempting newly due customer invoices");
assert.ok(cron.includes('item.final_state==="needs_review"'));
assert.ok(cron.includes('invoiceId:item.invoice_id'),"Notify each recovered abandoned claim");
assert.ok(cron.includes('invoiceId:id,reason:error?.message'),"Notify failures in current cron run");
assert.ok(cron.includes("failedNotices"),"Record notification failure without changing invoice status");
assert.ok(cron.includes('await sendInvoice(internal)'),"Customer delivery uses existing idempotent sender");
assert.ok(!cron.includes('resend.emails.send('),"Do not send a separate invoice from cron");
assert.ok(source.includes('idempotencyKey:"scheduled-invoice-review/"+id'));
console.log("Planlagte faktura-varsler bestått: avbrutte jobber, eier-e-post, identisk idempotensnøkkel og ingen ekstra kundesending.");
