import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const pure=paths=>paths.map(path=>read(path).replace(/^import .*;\n/gm,"").replace(/^export /gm,"")).join("\n");
const {invoiceReviewAlerts,invoiceReviewEmail,summarizeInvoiceActivity,invoiceSettlementInfo}=
 new Function(pure(["lib/invoicePaymentStatus.js","lib/invoiceSettlementInfo.js","lib/osloTime.js","lib/invoiceAdminAlerts.js"])+
 "\nreturn {invoiceReviewAlerts,invoiceReviewEmail,summarizeInvoiceActivity,invoiceSettlementInfo};")();
const today="2026-11-21";
const lineItems=[{description:"Arbeid",quantity:1,unitPriceOre:10000,vatRate:25}];
const mk=(id,rest={})=>({
 id,invoice_number:"AS-WEB-"+id,status:"sent",due_date:"2026-11-01",
 customer:{name:"Testkunde "+id},line_items:lineItems,paid_ore:0,credited_ore:0,...rest
});
const credit=mk("fullcredit",{credited_ore:12500});
const part=mk("partial",{credited_ore:5000});
const paid=mk("paid",{paid_ore:12500});
const normal=mk("normal");
const mismatch=mk("mismatch",{credited_ore:12500});
const vippsMismatch=mk("vippsmismatch");
const vippsActive=mk("vippsactive");
const refund=mk("refund",{paid_ore:4000});
const data=[credit,part,paid,normal,mismatch,vippsMismatch,vippsActive,refund];
const history=JSON.stringify(data);
const credits=[
 {invoice_id:credit.id,total_ore:12500,sent_at:today},
 {invoice_id:part.id,total_ore:5000,sent_at:today}
];
const payments=[
 {invoice_id:vippsMismatch.id,state:"captured",captured_ore:12500,refunded_ore:0},
 {invoice_id:vippsActive.id,state:"authorized",captured_ore:0,refunded_ore:0},
 {invoice_id:refund.id,state:"captured",captured_ore:10000,refunded_ore:6000}
];
const adjusted=summarizeInvoiceActivity(data,payments,credits);
const alerts=invoiceReviewAlerts(adjusted,[],today);
const byId=new Map(alerts.map(x=>[x.invoiceId,x]));
assert.equal(byId.has("fullcredit"),false,"Full credit with matching document has NO outstanding debt");
assert.equal(byId.has("paid"),false,"Paid invoice never generates debt reminder");
assert.equal(byId.get("partial").outstandingOre,7500,"Partial credit reduces amount due");
assert.equal(byId.get("partial").requiresReconciliation,false);
assert.equal(byId.get("normal").outstandingOre,12500,"Unpaid ordinary overdue debt");
assert.equal(byId.get("mismatch").requiresReconciliation,true,"Ledger credit with missing document must be reviewed");
assert.equal(byId.get("mismatch").outstandingOre,0);
assert.equal(byId.get("vippsmismatch").requiresReconciliation,true,"Captured Vipps greater than paid_ore requires reconciliation");
assert.equal(byId.get("vippsactive").requiresReconciliation,true,"Active Vipps must not be pursued as ordinary overdue");
assert.equal(byId.get("refund").requiresReconciliation,true,"Refund plus outstanding balance requires review");
assert.equal(adjusted.find(x=>x.id==="refund").activity.vippsRefundedOre,6000);
assert.equal(JSON.stringify(data),history,"No source invoice is mutated");

const email=invoiceReviewEmail(alerts,today);
assert.ok(email.body.includes("Registrert restbeløp (IKKE avstemt)"));
assert.ok(email.body.includes("før du purrer kunden"));
assert.ok(email.body.includes("Gjenstående: "));
assert.ok(!email.body.includes("AS-WEB-fullcredit"),"Fully credited invoice must not be in digest");

const outstandingOnly=invoiceReviewAlerts(summarizeInvoiceActivity([normal],[],[]),[
 {invoice_id:normal.id,status:"sent",kind:"purring",sent_at:"2026-11-05",due_date:"2026-11-15"}
],today);
assert.equal(outstandingOnly[0].stage,"Purrefrist utløpt – vurder inkassovarsel");

const cronSource=read("app/api/cron/invoice-review-alerts/route.js");
for(const check of [
 "credited_ore",
 "summarizeInvoiceActivity(invoices,vippsPayments,creditNotes)",
 '["invoice_vipps_payments","id,invoice_id,state,captured_ore,refunded_ore",vippsPayments]',
 '["invoice_credit_notes","id,invoice_id,total_ore,sent_at",creditNotes]',
 "if(error)throw Error(\"Avstemming av betalinger og kreditnotaer kunne ikke gjennomføres.\")",
 "range(offset,offset+499)"
])assert.ok(cronSource.includes(check),"Missing cron reconciliation: "+check);

// Functional route test: no real email, only a mocked provider.
const quoteDate="2026-11-21",invoiceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const prepared={...credit,id:invoiceId};
let dbRows={invoices:[prepared],credits:[{invoice_id:invoiceId,total_ore:12500,sent_at:today}],payments:[]};
let emailCount=0,readFailure=false,batch=null;
const dbMock={
 from(table){
  const query={
   select(){return query},eq(){return query},in(){return query},order(){return query},
   range(){return Promise.resolve({data:table==="invoice_drafts"?dbRows.invoices:
    table==="invoice_reminder_sends"?[]:
    table==="invoice_vipps_payments"?dbRows.payments:
    table==="invoice_credit_notes"?dbRows.credits:[],
    error:readFailure&&table==="invoice_credit_notes"?{message:"simulated private DB failure"}:null})},
   maybeSingle(){return Promise.resolve({data:table==="invoice_admin_alert_batches"?batch:null,error:null})},
   single(){return Promise.resolve({data:batch,error:null})},
   upsert(value){batch={...value,id:"batch-mock",created_at:new Date().toISOString(),status:"pending"};return Promise.resolve({error:null})},
   update(value){
    batch={...batch,...value};
    return {eq(){return Promise.resolve({error:null})}};
   }
  };return query;
 }
};
class FakeResend {
 emails={async send(message,opts){
  emailCount++;
  assert.equal(message.to,"post@aadland-service.no");
  assert.ok(opts.idempotencyKey.includes("invoice-admin-review/"));
  return {data:{id:"simulated-email"},error:null};
 }};
}
const NextResponse={json(value,opts={}){return {body:value,status:opts.status||200}}};
const noImport=cronSource.replace(/^import .*;\n/gm,"")
 .replace(/^export const .*\n/gm,"")
 .replace("export async function GET(","async function GET(")
 .replace(/const \{Resend\}=await import\("[^"]*safeResend"\);/,"const Resend=FakeResend;");
const route=new Function("NextResponse","db","cronGuard","osloDateKey",
 "invoiceReviewAlerts","invoiceReviewEmail","summarizeInvoiceActivity","FakeResend","process",
 noImport+"\nreturn {GET};"
)(NextResponse,()=>dbMock,()=>null,()=>quoteDate,
 invoiceReviewAlerts,invoiceReviewEmail,summarizeInvoiceActivity,FakeResend,
 {env:{VERCEL_ENV:"production",RESEND_API_KEY:"simulated-only"}});
const request={url:"https://aadland-service.no/api/cron/invoice-review-alerts"};
let response=await route.GET(request);
assert.equal(response.status,200);
assert.equal(response.body.sent,0,"Fully credited invoice does not send owner overdue message");
assert.equal(emailCount,0);
assert.equal(batch,null,"No unnecessary empty digest is stored");
dbRows={invoices:[{...prepared,credited_ore:12500}],credits:[],payments:[]};
response=await route.GET(request);
assert.equal(response.status,200);
assert.equal(response.body.sent,1,"Mismatch sends owner reconciliation alert");
assert.ok(batch.body.includes("IKKE avstemt"));
assert.equal(emailCount,1);
batch=null;emailCount=0;readFailure=true;
response=await route.GET(request);
assert.equal(response.status,500,"Credit-note read failure must stop owner digest");
assert.equal(emailCount,0,"No misleading owner email on unavailable credit data");
assert.equal(batch,null);

console.log("S-04 bestått: full kreditering, delkreditering, Vipps, uavstemte beløp, trygge varsler og fail-closed ved utilgjengelige bilag.");
