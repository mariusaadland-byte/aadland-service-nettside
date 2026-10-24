import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// No payment, email or database calls: worklist classification is pure, read-only.
const read=name=>readFileSync(name,"utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const core=[
 read("lib/invoicePaymentStatus.js"),
 read("lib/invoiceSettlementInfo.js"),
 read("lib/invoiceFollowUpState.js"),
 read("lib/osloTime.js"),
 read("lib/invoiceArchiveOverview.js")
].join("\n");
const {invoiceFollowUpState,invoiceFollowUpSummary,invoiceArchiveVisible,invoicePaymentState}=
 new Function(core+";return {invoiceFollowUpState,invoiceFollowUpSummary,invoiceArchiveVisible,invoicePaymentState};")();
const today="2026-10-24";
const mk=(id,{unitOre=10000,paidOre=0,creditedOre=0,due="2026-11-14",status="issued",activity=null}={})=>({
 id,status,invoice_number:"AS-WEB-"+id,issued_date:"2026-10-01",due_date:due,
 customer:{name:"Kunde "+id},line_items:[{description:"Arbeid",quantity:1,unitPriceOre:unitOre,vatRate:25}],
 paid_ore:paidOre,credited_ore:creditedOre,
 ...(activity?{activity}:{})
});
const ready=mk("ready",{paidOre:12500});
const credited=mk("credited",{creditedOre:12500,activity:{creditDocumentsOre:12500,creditNoteCount:1,
 vippsCapturedOre:0,vippsRefundedOre:0,vippsActiveCount:0}});
const overdue=mk("overdue",{due:"2026-10-09",paidOre:2500});
const dueSoon=mk("soon",{due:"2026-10-26"});
const dueToday=mk("today",{due:today});
const waiting=mk("waiting",{due:"2026-12-01"});
const reviewRefund=mk("refund",{paidOre:5000,activity:{
 creditDocumentsOre:0,vippsCapturedOre:10000,vippsRefundedOre:5000,vippsActiveCount:0}});
const activeVipps=mk("active",{paidOre:0,activity:{
 creditDocumentsOre:0,vippsCapturedOre:0,vippsRefundedOre:0,vippsActiveCount:1}});
const mismatch=mk("mismatch",{creditedOre:2000,activity:{
 creditDocumentsOre:0,vippsCapturedOre:0,vippsRefundedOre:0,vippsActiveCount:0}});
const noDue=mk("no-due",{due:null});
const zero=mk("zero",{unitOre:0,paidOre:0});
const draft=mk("draft",{status:"draft"});
assert.deepEqual([ready,credited].map(x=>invoiceFollowUpState(x,today).key),["ready","ready"]);
assert.equal(invoiceFollowUpState(overdue,today).label,"Minst 14 dager forfalt");
assert.equal(invoiceFollowUpState(overdue,today).daysOverdue,15);
assert.equal(invoiceFollowUpState(dueSoon,today).key,"dueSoon");
assert.equal(invoiceFollowUpState(dueToday,today).key,"dueToday");
assert.equal(invoiceFollowUpState(waiting,today).key,"waiting");
assert.equal(invoiceFollowUpState(reviewRefund,today).key,"review","Refunded invoice with debt cannot be ready");
assert.equal(invoiceFollowUpState(activeVipps,today).key,"review","Active Vipps cannot be closed");
assert.equal(invoiceFollowUpState(mismatch,today).key,"review","Credit-note mismatch cannot be closed");
assert.equal(invoiceFollowUpState(noDue,today).key,"review","Missing due date needs human review");
assert.equal(invoiceFollowUpState(zero,today).key,"review","Zero-priced invoice not automatically complete");
assert.equal(invoiceFollowUpState(draft,today).key,"draft");
const closedInvoice={...ready,adminClosure:{closedAt:"2026-10-24T16:00:00Z",revision:1}};
assert.equal(invoiceFollowUpState(closedInvoice,today).key,"closed","Closed is distinct from financially ready");
assert.equal(invoiceFollowUpState({...activeVipps,adminClosure:closedInvoice.adminClosure},today).key,"review",
 "Closed invoice with active Vipps is marked for review");
assert.equal(invoiceFollowUpState({...overdue,adminClosure:closedInvoice.adminClosure},today).key,"review",
 "A closed invoice with new debt must be reviewed");
assert.equal(invoiceFollowUpSummary([closedInvoice],today).closedCount,1);
assert.equal(invoiceArchiveVisible([closedInvoice],today,{filter:"ready"}).length,0);
assert.equal(invoiceArchiveVisible([closedInvoice],today,{filter:"closed"}).length,1);

assert.ok(invoiceFollowUpState(credited,today).detail.includes("kreditnotaer"));
assert.equal(invoiceFollowUpState(overdue,"2026-11-02").daysOverdue,24,
 "Oslo calendar day comparison cannot depend on DST time hours");
const rows=[ready,credited,overdue,dueSoon,dueToday,waiting,reviewRefund,activeVipps,mismatch,noDue,zero,draft];
const saved=JSON.stringify(rows);
const summary=invoiceFollowUpSummary(rows,today);
assert.deepEqual({
 readyCount:summary.readyCount,reviewCount:summary.reviewCount,
 overdueCount:summary.overdueCount,dueSoonCount:summary.dueSoonCount,
 waitingCount:summary.waitingCount,actionCount:summary.actionCount,
 notDueCount:summary.notDueCount
},{readyCount:2,reviewCount:5,overdueCount:1,dueSoonCount:2,
 waitingCount:1,actionCount:6,notDueCount:3});
assert.equal(summary.actionOutstandingOre,
 [overdue,reviewRefund,activeVipps,mismatch,noDue,zero].reduce((sum,i)=>sum+invoicePaymentState(i,today).outstanding,0));
const selected=f=>invoiceArchiveVisible(rows,today,{filter:f,sort:"newest"}).map(x=>x.id).sort();
assert.deepEqual(selected("ready"),["credited","ready"]);
assert.deepEqual(selected("attention"),["active","mismatch","no-due","overdue","refund","zero"]);
assert.deepEqual(selected("awaiting"),["soon","today","waiting"]);
assert.deepEqual(selected("all").length,11);
assert.equal(selected("ready").some(x=>x==="active"),false);
assert.equal(invoiceFollowUpSummary(rows.filter(x=>x.status==="draft"),today).readyCount,0);
assert.equal(JSON.stringify(rows),saved,"Classification must never mutate invoice data");

assert.equal(invoiceArchiveVisible([ready,closedInvoice],today,{filter:"closed"}).length,1);
const client=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
const dash=readFileSync("app/admin/faktura/InvoiceFollowUpDashboard.js","utf8");
const detail=readFileSync("app/admin/faktura/InvoiceFollowUpPanel.js","utf8");
const reminder=readFileSync("app/admin/faktura/InvoiceReminderPanel.js","utf8");
const overview=readFileSync("lib/invoiceArchiveOverview.js","utf8");
assert.ok(client.includes("<InvoiceFollowUpDashboard"));
assert.ok(client.includes("<InvoiceFollowUpPanel"));
assert.ok(client.includes('value="ready"')&&client.includes('value="attention"')&&client.includes('value="awaiting"'));
assert.ok(client.includes("Oppfølging: {follow.label}"));
assert.ok(dash.includes("«Klar for avslutning» betyr at fakturaen er økonomisk oppgjort"));
assert.ok(detail.includes("Fakturaen er ikke automatisk lukket"));
assert.ok(client.includes('id="invoice-payment-actions"'));
assert.ok(reminder.includes('id="invoice-reminder-actions"'));
assert.ok(!dash.includes("fetch(")&&!detail.includes("fetch("));
assert.doesNotMatch(overview,/\bfetch\s*\(|\.insert\s*\(|\.update\s*\(/);
console.log("Fakturaoppfølging bestått: oppgjort, mangler betaling, forfalt, avvik, refusjon, kreditering, Oslo-dato og filtre uten regnskapsendring.");
