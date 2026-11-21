import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const src=read("lib/developmentApprovalChecklist.js")
 .replace(/^export /gm,"");
const {APPROVAL_CHECKS,APPROVAL_GROUPS,approvalMeta,developmentApprovalQueue}
 =new Function(src+";return {APPROVAL_CHECKS,APPROVAL_GROUPS,approvalMeta,developmentApprovalQueue};")();
const testIDs=[
 "custom-invoice-customer-card-20261021",
 "custom-invoice-archive-payments-20261021",
 "custom-manual-product-price-list-20261021",
 "custom-material-shared-prices-20261008",
 "custom-quote-private-margin-pdf-20261009",
 "custom-vipps-fee-price-preview-20261022",
 "calculator",
 "custom-drawing-report-20261008",
 "custom-kitchen-open-walls-20261008",
 "custom-drawing-customer-20261008",
 "custom-drawing-customer-archive-20261008",
 "custom-drawing-mobile-menu-20261008",
 "responsive",
 "custom-invoice-issue-email-20261021",
 "quote_pdf",
 "custom-invoice-reminders-20261021",
 "quotes_orders",
 "custom-drawing-customer-publication-20261008",
 "custom-customer-access-isolation-20261021",
 "customer_drawings","emails",
 "custom-invoice-admin-alerts-20261021",
 "custom-rental-deposit-reminders-20261021",
 "custom-external-ledger-review-20261120",
 "suppliers","rental_booking","vipps",
 "custom-invoice-vipps-payment-20261021",
 "custom-external-vat-double-count-20261120",
 "custom-tripletex-original-pdf-20261120"
];
assert.deepEqual(Object.keys(APPROVAL_CHECKS).sort(),testIDs.slice().sort(),
 "Every development plan task currently awaiting approval must have reviewed criteria");
for(const [id,meta] of Object.entries(APPROVAL_CHECKS)){
 assert.ok(APPROVAL_GROUPS[meta.group],"Unknown approval group "+id);
 assert.equal(meta.checks.length,id==="responsive"?6:3,"Responsive S-15 needs six device checks; other tasks keep three checks: "+id);
 assert.ok(meta.checks.every(t=>typeof t==="string"&&t.length>25));
 assert.ok(Number.isSafeInteger(meta.order)&&meta.order>0);
}
const queue=developmentApprovalQueue(testIDs.map((id,i)=>({
 id,title:id,status:"test",sortOrder:i,priority:"normal"
})).concat([
 {id:"done",status:"done",priority:"high"},
 {id:"planned",status:"todo",priority:"high"},
 {id:"progress",status:"progress",priority:"high"}
]));
assert.equal(queue.length,30);
assert.equal(queue[0].id,"custom-invoice-customer-card-20261021",
 "Begin with fast, nonpayment customer-card approval");
assert.equal(queue.at(-1).id,"custom-tripletex-original-pdf-20261120",
 "Actual PDF attachment confirmation must not be prematurely approved");
assert.equal(queue.filter(x=>x.approval.group==="quick").length,13);
assert.equal(queue.filter(x=>x.approval.group==="workflow").length,11);
assert.equal(queue.filter(x=>x.approval.group==="dependent").length,6);
assert.equal(approvalMeta({id:"done",status:"done"}),null);
assert.equal(developmentApprovalQueue(null).length,0);
assert.equal(approvalMeta({id:"unknown",status:"test"}).checks.length,3,
 "Any new test task still gets explicit manual review prompts");
const ui=read("app/admin/utviklingsplan/ApprovalQueue.js");
for(const phrase of [
 "Trykk på en boks for å starte testen",
 "developmentApprovalQueue(tasks)",
 "Dette skal du teste nå",
 "Fungerer – neste steg",
 "Fungerer ikke",
 "Godkjenn og gå til neste test",
 "onApprove(current)",
 "onReport(current,description)",
 "window.confirm",
 "setProgress(prev",
 "Ta denne senere – neste test",
 "Vis alle ",
 "APPROVAL_GROUPS[current.approval.group]",
 "role=\"dialog\" aria-modal=\"true\"",
 "target=\"_blank\"",
 "rel=\"noopener noreferrer\"",
 "disabled={!done||Boolean(savingId)||busy}",
 "Alle oppgaver som var klare til testing",
 "localStorage.setItem"
])assert.ok(ui.includes(phrase),"Missing guided test window: "+phrase);
const parent=read("app/admin/utviklingsplan/RoadmapClient.js");
assert.ok(parent.includes('onReport={reportTaskIssue}'));
assert.ok(parent.includes('onApprove={approveTask}'));
assert.ok(parent.includes('reportTaskIssue(task,description)'));
assert.ok(parent.includes('if(task.status!=="test"||savingId)return false;'));
assert.ok(parent.includes('return updateTask(task,{status:"done",notes:updated});'));
assert.ok(parent.includes('showCatalog&&<>'));
assert.ok(parent.includes("Vis alle oppgaver, notater og prioriteringer"));
assert.ok(parent.includes("Godkjent av eier via oppgavens sjekkliste"));
const route=read("app/api/admin/utviklingsplan/route.js");
assert.ok(route.includes("sameOriginGuard(request)"));
assert.ok(route.includes('user?.role==="owner"'));
assert.ok(route.includes('if(!STATUSES.has')===false||route.includes("STATUSES.has(status)"));
const css=read("app/admin/utviklingsplan/roadmap.module.css");
for(const key of [".approvalBoard",".wizardTileGrid",".wizardBackdrop",
 ".wizardDialog",".wizardStepBody",".wizardPrimary",".wizardIssue",
 ".wizardDialogFooter",".fullPlanToggle","@media(max-width:740px)"])
 assert.ok(css.includes(key));
console.log("Utviklingsplan testvindu: 30 testoppgaver, 13 raske, 11 fullflyt, 6 avhengigheter, veiledet steg for steg, eiergodkjenning og lagret fremdrift.");
