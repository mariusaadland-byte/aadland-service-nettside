import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/invoiceScheduledDraftOverview.js","utf8")
 .replace(/^export /gm,"");
const {scheduledInvoiceStatus,scheduledInvoiceDraftOverview,prioritizeInvoiceDrafts}=
 new Function(source+";return {scheduledInvoiceStatus,scheduledInvoiceDraftOverview,prioritizeInvoiceDrafts};")();
const first={id:"first",status:"sent",sent_at:"2026-10-20T12:00:00Z",split_part:1};
const manual={id:"ordinary",status:"draft",split_part:null,created_at:"2026-10-27"};
const make=(id,date,state="scheduled",patch={})=>({
 id,status:"draft",split_part:2,split_group_id:"first",
 automatic_send:true,auto_send_state:state,planned_send_on:date,
 created_at:"2026-10-20",...patch
});
const pending=make("pending","2026-10-30");
const due=make("due","2026-10-27");
const overdue=make("late","2026-10-26");
const needsReview=make("review","2026-10-23","needs_review");
const processing=make("processing","2026-10-27","processing");
const invalid=make("invalid","2026-13-42");
const all=[manual,first,pending,due,overdue,needsReview,processing,invalid];
const today="2026-10-27";
const result=scheduledInvoiceDraftOverview(all,today);
assert.equal(result.total,6);
assert.equal(result.scheduled,4);
assert.equal(result.overdue,1);
assert.equal(result.today,1);
assert.equal(result.review,1);
assert.equal(result.processing,1);
assert.equal(result.invalidDate,1);
assert.equal(result.firstMissing,0);
assert.equal(result.nextDate,"2026-10-27");
assert.equal(scheduledInvoiceStatus(overdue,today,first).kind,"overdue");
assert.equal(scheduledInvoiceStatus(due,today,first).kind,"today");
assert.equal(scheduledInvoiceStatus(pending,today,first).kind,"upcoming");
assert.equal(scheduledInvoiceStatus(needsReview,today,first).kind,"review");
assert.equal(scheduledInvoiceStatus(processing,today,first).kind,"processing");
assert.equal(scheduledInvoiceStatus(invalid,today,first).kind,"invalidDate");
assert.equal(scheduledInvoiceStatus(manual,today,first),null);
assert.equal(scheduledInvoiceStatus({...overdue,status:"sent"},today,first),null);
assert.equal(scheduledInvoiceStatus(make("off","2026-10-30","manual",{automatic_send:false}),today,first),null);
const missing={...first,status:"issued",sent_at:null};
const firstBlocked=scheduledInvoiceDraftOverview([missing,pending,due,overdue],today);
assert.equal(firstBlocked.firstMissing,2,
 "Future and today's schedules must show when first installment is unsent");
assert.equal(firstBlocked.overdue,1,
 "Late invoices must remain the most urgent irrespective of first installment");
assert.equal(scheduledInvoiceStatus(due,today,missing).kind,"firstMissing");
assert.equal(scheduledInvoiceStatus(pending,today,missing).kind,"firstMissing");
const selected=[manual,pending,overdue,needsReview,due,processing];
const copy=[...selected];
const prioritized=prioritizeInvoiceDrafts(selected,today,all);
assert.deepEqual(prioritized.map(x=>x.id),["review","late","processing","due","pending","ordinary"],
 "Held or overdue split drafts must come before normal drafts");
// Parents may disappear from the filtered search results: use full invoice list.
assert.equal(prioritizeInvoiceDrafts([due],today,[due,first])[0].id,"due");
assert.equal(scheduledInvoiceStatus(due,today,first).kind,"today");
assert.deepEqual(selected,copy,"Prioritization must not mutate the original list");
assert.equal(scheduledInvoiceDraftOverview([],today).total,0);
assert.equal(scheduledInvoiceDraftOverview([],today).nextDate,null);
const page=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(page.includes("scheduledInvoiceDraftOverview(items,today)"));
assert.ok(page.includes("prioritizeInvoiceDrafts(rawVisibleItems,today,items)"));
assert.ok(page.includes("passert sendingsdato"));
assert.ok(page.includes("Kontroller cron- og e-postloggen"));
assert.ok(page.includes("10:20 UTC"));
const config=JSON.parse(readFileSync("vercel.json","utf8"));
assert.equal(config.crons.find(x=>x.path==="/api/cron/scheduled-invoices")?.schedule,"20 10 * * *",
 "The Oslo time wording must match the deployed UTC cron schedule");
console.log("Faktura 2 oversikt bestått: forsinket/tidlig/dagens plan, manglende del 1, kontrollstatus, søkefiltrering og UTC-kjøretid. Bare lesing.");
