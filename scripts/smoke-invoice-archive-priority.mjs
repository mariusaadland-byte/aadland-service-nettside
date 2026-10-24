import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const paymentSource=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const osloSource=readFileSync("lib/osloTime.js","utf8").replace(/^export /gm,"");
const overviewSource=readFileSync("lib/invoiceArchiveOverview.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const settlementSource=readFileSync("lib/invoiceSettlementInfo.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const methods=new Function(paymentSource+"\n"+osloSource+"\n"+settlementSource+"\n"+overviewSource+"\nreturn {invoiceArchiveOverview,invoiceArchiveVisible,invoiceArchiveDueInfo,invoiceSettlementInfo,summarizeInvoiceActivity};")();
const {invoiceArchiveOverview,invoiceArchiveVisible,invoiceArchiveDueInfo,invoiceSettlementInfo,summarizeInvoiceActivity}=methods;
const today="2026-10-23";
const invoice=(id,due,paid=0,status="issued",customer="Kunde "+id)=>({
 id,invoice_number:"AS-TEST-"+id,customer:{name:customer,email:id+"@example.invalid"},
 due_date:due,issued_at:"2026-10-"+String(Math.max(1,Number(id.slice(1))||1)).padStart(2,"0")+"T12:00:00Z",
 status,title:"Arbeid",line_items:[{description:"Arbeid",quantity:1,unitPriceOre:10000,vatRate:25}],paid_ore:paid
});
const invoices=[
 invoice("a1","2026-09-30",5000,"sent","Ola Overdue"),
 invoice("a2","2026-10-09",0,"issued","Anne Etterslep"),
 invoice("a3","2026-10-22",0),
 invoice("a4","2026-10-23",0),
 invoice("a5","2026-10-30",0),  // exactly 7 days ahead
 invoice("a6","2026-10-31",0),  // after 7 days
 invoice("a7","2026-09-01",12500,"sent","Berit Betalt"),
 invoice("a8","2026-09-01",0,"draft"),
 invoice("a9",null,0),
 invoice("a10","2026-10-24",7500,"sent")
];
const orig=invoices.map(x=>({...x}));
const stats=invoiceArchiveOverview(invoices,today);
assert.equal(stats.issuedCount,9);
assert.equal(stats.unpaidCount,8);
assert.equal(stats.paidCount,1);
assert.equal(stats.partialCount,2);
assert.equal(stats.outstanding,8*12500-5000-7500);
assert.equal(stats.paid,5000+12500+7500);
assert.equal(stats.overdueCount,3);
assert.equal(stats.overdue,7500+12500+12500);
assert.equal(stats.overdue14Count,2,"Due 14 days ago counts as 14+ overdue");
assert.equal(stats.overdue14,7500+12500);
assert.equal(stats.dueSoonCount,3,"Today, tomorrow and exactly 7 days count as due soon");
assert.equal(stats.dueSoon,12500+12500+5000);
assert.equal(invoiceArchiveDueInfo(invoices[0],today).label,"23 dager forfalt");
assert.equal(invoiceArchiveDueInfo(invoices[1],today).kind,"oldOverdue");
assert.equal(invoiceArchiveDueInfo(invoices[2],today).label,"1 dag forfalt");
assert.equal(invoiceArchiveDueInfo(invoices[3],today).label,"Forfaller i dag");
assert.equal(invoiceArchiveDueInfo(invoices[4],today).label,"Forfaller om 7 dager");
assert.equal(invoiceArchiveDueInfo(invoices[5],today).kind,"upcoming");
assert.equal(invoiceArchiveDueInfo(invoices[6],today).kind,"paid");
assert.equal(invoiceArchiveDueInfo(invoices[8],today).kind,"noDate");

const selection=(filter,sort="priority",query="")=>invoiceArchiveVisible(invoices,today,{filter,sort,query}).map(i=>i.id);
assert.deepEqual(selection("overdue"),["a1","a2","a3"]);
assert.deepEqual(selection("overdue14"),["a1","a2"]);
assert.deepEqual(selection("dueSoon"),["a4","a10","a5"]);
assert.deepEqual(selection("partial"),["a1","a10"]);
assert.deepEqual(selection("paid"),["a7"]);
assert.deepEqual(selection("unpaid"),["a1","a2","a3","a4","a10","a5","a6","a9"]);
assert.equal(selection("all")[0],"a1","Full archive prioritizes oldest outstanding balance");
assert.equal(selection("all").at(-1),"a7","Paid invoices appear last in priority mode");
const byAmount=invoiceArchiveVisible(invoices,today,{filter:"all",sort:"amount"});
assert.ok(byAmount.every((row,i)=>i===0||methods.invoiceArchiveOverview([byAmount[i-1]],today).outstanding>=methods.invoiceArchiveOverview([row],today).outstanding),"Largest outstanding balances first");
assert.deepEqual(byAmount.slice(0,3).map(row=>row.id),["a9","a6","a5"]);
assert.deepEqual(selection("unpaid","due").slice(-1),["a9"],"Missing due dates sort last");
assert.deepEqual(selection("all","priority","ola overdue"),["a1"]);
assert.deepEqual(selection("all","priority","ANNE ETTER"),["a2"]);
assert.deepEqual(selection("all","priority","a7@example.invalid"),["a7"]);
assert.deepEqual(selection("all","priority","AS-TEST-a4"),["a4"]);
assert.deepEqual(selection("all","priority","ikke funnet"),[]);
assert.equal(selection("invalid").length,0,"Unexpected filter does not accidentally reveal all rows");
assert.equal(invoiceArchiveVisible(invoices,today,{archiveMode:false}).length,1,"Draft view must stay draft-only");
assert.deepEqual(invoices,orig,"Overview and sorting must not mutate invoices");

const november="2026-11-01", crossing=[invoice("b1","2026-10-18"),invoice("b2","2026-10-25"),invoice("b3","2026-11-08")];
const monthStats=invoiceArchiveOverview(crossing,november);
assert.equal(monthStats.overdueCount,2,"Month boundary based on Oslo calendar days");
assert.equal(monthStats.dueSoonCount,1,"Seven days ahead across month boundary");
assert.equal(invoiceArchiveDueInfo(crossing[0],november).label,"14 dager forfalt");

const creditInvoice=invoice("refund","2026-10-23",80000);
creditInvoice.line_items=[{description:"Arbeid",quantity:1,unitPriceOre:80000,vatRate:25}];
creditInvoice.credited_ore=20000;
const reconciled=summarizeInvoiceActivity([creditInvoice],[
 {invoice_id:creditInvoice.id,captured_ore:100000,refunded_ore:20000,state:"partial"}
],[
 {invoice_id:creditInvoice.id,total_ore:20000,sent_at:"2026-10-24T10:00:00Z"}
]);
assert.equal(reconciled[0].activity.vippsCapturedOre,100000);
assert.equal(reconciled[0].activity.vippsRefundedOre,20000);
assert.equal(reconciled[0].activity.creditNoteCount,1);
assert.equal(reconciled[0].activity.creditNoteSentCount,1);
assert.equal(invoiceSettlementInfo(reconciled[0],today).label,"Oppgjort med refusjon og kreditnota");
assert.equal(invoiceSettlementInfo(reconciled[0],today).outstanding,0);
assert.equal(invoiceSettlementInfo(reconciled[0],today).netVipps,80000);
const refundedOutstanding={...reconciled[0],credited_ore:0};
refundedOutstanding.activity={...reconciled[0].activity,creditDocumentsOre:0};
assert.equal(invoiceSettlementInfo(refundedOutstanding,today).kind,"refundedOutstanding");
assert.equal(invoiceSettlementInfo(refundedOutstanding,today).outstanding,20000);
assert.equal(invoiceArchiveOverview([refundedOutstanding],today).needsReviewCount,1);
assert.equal(invoiceArchiveVisible([refundedOutstanding],today,{filter:"review"}).length,1);
assert.equal(invoiceArchiveVisible([refundedOutstanding],today,{filter:"refunded"}).length,1);
const wrongCredits={...reconciled[0],activity:{...reconciled[0].activity,creditDocumentsOre:10000}};
assert.equal(invoiceSettlementInfo(wrongCredits,today).kind,"mismatch");
const activeVipps={...creditInvoice,activity:{...reconciled[0].activity,vippsActiveCount:1}};
assert.equal(invoiceSettlementInfo(activeVipps,today).kind,"activeVipps");
const regular=invoice("normal","2026-11-05",12500);
assert.equal(invoiceSettlementInfo(regular,today).label,"Betalt");
assert.equal(invoiceArchiveOverview([regular],today).needsReviewCount,0);

const ui=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(ui.includes("invoiceArchiveOverview(items,today)"));
assert.ok(ui.includes("invoiceArchiveVisible(items,today,{archiveMode,filter,query:search,sort:sortMode})"));
assert.ok(ui.includes("Minst 14 dager forfalt"));
assert.ok(ui.includes("Forfaller innen 7 dager"));
assert.ok(ui.includes("Høyest restbeløp først"));
assert.ok(ui.includes("Oppdater oversikten"));
assert.ok(ui.includes("invoiceArchiveDueInfo(x,today).label"));
assert.ok(ui.includes("invoiceSettlementInfo(x,today)"));
assert.ok(ui.includes("Må kontrolleres"));
assert.ok(ui.includes("Med Vipps-refusjon"));
assert.ok(ui.includes("<InvoiceSettlementPanel"));
const listApi=readFileSync("app/api/admin/invoices/route.js","utf8");
assert.ok(listApi.includes("summarizeInvoiceActivity(invoices,payments,credits)"));
assert.ok(listApi.includes('invoice_vipps_payments'));
assert.ok(listApi.includes('invoice_credit_notes'));
assert.ok(listApi.includes('"Cache-Control":"private, no-store"'));
assert.ok(ui.includes('cache:"no-store"'),"Refresh should bypass cached invoice data");
assert.doesNotMatch(overviewSource,/\bfetch\s*\(|\.insert\s*\(|\.update\s*\(/,"Archive presentation must have no payment or reminder writes");
console.log("Fakturaarkiv bestått: restbeløp, forfalte 14+, neste 7 dager, delbetalt, betalt, prioritet, søk, DST-uavhengige datoer og ingen sending.");
