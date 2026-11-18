import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const calc=read("lib/adminAccountingOverview.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {invoiceGrossOre,invoicePaymentState}=new Function(read("lib/invoicePaymentStatus.js").replace(/^export /gm,"")+
 ";return {invoiceGrossOre,invoicePaymentState};")();
const {buildAccountingOverview,accountingOverviewCsv}=new Function("invoiceGrossOre","invoicePaymentState",
 calc+";return {buildAccountingOverview,accountingOverviewCsv};")(invoiceGrossOre,invoicePaymentState);
const invoices=[
 {id:"i1",status:"sent",issued_date:"2026-10-01",due_date:"2026-10-25",
  sent_at:"2026-10-02T10:00:00Z",invoice_number:"FA-2026-1",
  customer:{name:"Testkunde AS"},
  line_items:[{description:"Arbeid",quantity:2,unitPriceOre:10000,vatRate:25}],
  paid_ore:25000,credited_ore:0},
 {id:"i2",status:"sent",issued_date:"2026-10-12",due_date:"2026-12-01",
  sent_at:"2026-10-12T10:00:00Z",invoice_number:"FA-2026-2",
  customer:{name:"Kunde 2"},
  line_items:[{description:"Jobb",quantity:1,unitPriceOre:10000,vatRate:25}],
  paid_ore:0,credited_ore:0},
 {id:"i3",status:"draft",issued_date:null,line_items:[],paid_ore:0,credited_ore:0},
 {id:"i4",status:"sent",issued_date:"2025-12-30",due_date:"2026-01-20",
  sent_at:"2025-12-30T00:00:00Z",invoice_number:"FA-2025-1",
  customer:{name:"Tidligere kunde"},line_items:[{description:"Jobb",quantity:1,unitPriceOre:10000,vatRate:25}],
  paid_ore:12500,credited_ore:0}
];
const purchases=[
 {id:"p1",supplier_name:"Byggvare AS",supplier_document_number:"881",document_date:"2026-10-12",
  kind:"purchase",base_ore:4000,vat_ore:1000,deductible_vat_ore:1000,voided_at:null},
 {id:"p2",supplier_name:"Byggvare AS",supplier_document_number:"K-881",document_date:"2026-10-13",
  kind:"credit",base_ore:1000,vat_ore:250,deductible_vat_ore:250,voided_at:null},
 {id:"p3",supplier_name:"Skal ikke telles",supplier_document_number:"VOID",
  document_date:"2026-10-14",kind:"purchase",base_ore:999999,vat_ore:100000,
  deductible_vat_ore:100000,voided_at:"2026-10-15T00:00:00Z"}
];
const payments=[
 {id:"pay1",invoice_id:"i1",paid_on:"2026-11-02",amount_ore:25000,reversed_at:null,vipps_reference:"VP-FAKE"},
 {id:"pay2",invoice_id:"i4",paid_on:"2026-01-02",amount_ore:12500,reversed_at:null,vipps_reference:null},
 {id:"pay3",invoice_id:"i2",paid_on:"2026-11-10",amount_ore:1000,reversed_at:"2026-11-11T00:00:00Z",vipps_reference:null}
];
const transfers=[{id:"t1",purchase_document_id:"p1",status:"accepted",
 recipient:"company@ebilag.com",attempted_at:"2026-11-12T10:00:00Z"}];
const files=[{purchase_document_id:"p1"},{purchase_document_id:"p2"}];
const fixtures={invoices,purchases,payments,transfers,files};
const info=buildAccountingOverview(fixtures,2026,"2026-11-18");
assert.equal(info.total.issuedCount,2);
assert.equal(info.total.paidCount,1);
assert.equal(info.total.unpaidCount,1);
assert.equal(info.total.invoicedGrossOre,37500);
assert.equal(info.total.invoicedNetOre,30000);
assert.equal(info.total.outputVatOre,7500);
assert.equal(info.total.recordedPaidOnInvoicesOre,25000);
assert.equal(info.total.recordedPaymentsThisYearOre,37500,
 "Payment time belongs to the payment year even for a prior-year invoice");
assert.equal(info.total.outstandingOre,12500);
assert.equal(info.total.purchasesCount,2);
assert.equal(info.total.expenseGrossOre,3750,"Credit note reduces registered purchases");
assert.equal(info.total.expenseNetOre,3000);
assert.equal(info.total.inputVatProposedOre,750);
assert.equal(info.total.vatDifferenceIndicativeOre,6750);
assert.equal(info.total.transfersTotal,2);
assert.equal(info.total.transfersAccepted,1);
assert.equal(info.total.transfersNotSent,1);
assert.equal(info.ledger.length,6,"Two invoices, two purchases, two actual payments");
assert.ok(info.ledger.some(x=>x.kind==="Innbetaling (Vipps)"&&x.receivedOre===25000&&x.salesOre===0));
assert.ok(info.ledger.some(x=>x.kind==="Kreditnota fra leverandør"&&x.expenseOre===-1250));
assert.ok(info.warnings.some(x=>x.includes("ikke et fullstendig bokført regnskap")));
const csv=accountingOverviewCsv(info.ledger);
assert.ok(csv.startsWith("\uFEFF")&&csv.includes("Innbetalt (kr)"));
assert.ok(csv.includes('"FA-2026-1"'));
assert.ok(csv.includes('"-12,50"'));
const danger=accountingOverviewCsv([{date:"2026-10-10",kind:"Kundefaktura",
 name:"=HYPERLINK('evil')",ref:"+123",salesOre:100,expenseOre:0,receivedOre:0,vatOre:0}]);
assert.ok(danger.includes("'=HYPERLINK")&&danger.includes("'+123"));
const previous=buildAccountingOverview(fixtures,2025,"2026-11-18");
assert.equal(previous.total.issuedCount,1);
assert.equal(previous.total.recordedPaymentsThisYearOre,0);
assert.equal(previous.total.transfersTotal,2,"Tripletex status must be visible across years");
assert.throws(()=>buildAccountingOverview(fixtures,1999,"2026-11-18"),/Ugyldig/);

const admin=read("app/admin/AdminClient.js");
for(const x of ['title:"Regnskap"','accountPaid','accountUnpaid','accountExpenses','accountVat',
 'accountLedger','accountTransfers','/admin/regnskap?vis=','user?.role==="owner"']){
 assert.ok(admin.includes(x),"Missing desktop owner accounting section: "+x);
}
const mobile=read("app/admin/mobil/page.js");
assert.ok(mobile.includes('name:"Regnskap"')&&mobile.includes('access:"owner"'));
const page=read("app/admin/regnskap/page.js");
assert.ok(page.includes('user.role!=="owner"'));
const view=read("app/admin/regnskap/AccountingOverviewClient.js");
for(const label of ["Betalte fakturaer","Ubetalte fakturaer","Utgifter","Regnskapsark",
 "Tripletex-overføringer","MVA"]){
 assert.ok(view.includes(label),"Missing accounting view "+label);
}
assert.ok(view.includes("Last ned regnskapsark"));
assert.ok(view.includes('href="/admin/faktura/mva/tripletex"')||
 view.includes('link("/admin/faktura/mva/tripletex"'));
const routeSrc=read("app/api/admin/regnskap/route.js");
assert.ok(routeSrc.includes('user?.role!=="owner"'));
assert.ok(routeSrc.includes('format==="csv"'));
assert.ok(!routeSrc.includes(".update(")&&!routeSrc.includes(".insert("),"Read-only financial data");
const clean=routeSrc.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const NextResponse=class extends Response {static json(value,init={}){return Response.json(value,init)}};
let role="owner",broken=false;
const sourceTables={invoice_drafts:invoices,vat_purchase_documents:purchases,
 invoice_payments:payments,vat_tripletex_receipt_transfers:transfers,
 vat_purchase_document_files:files};
const db=()=>({from:table=>{
 let eqs=[],from=0,to=249;
 const q={
  select(){return q},order(){return q},range(a,b){from=a;to=b;return q},
  eq(key,val){eqs.push([key,val]);return q},
  then(resolve,reject){
   if(broken)return Promise.resolve({data:null,error:{message:"DB offline"}}).then(resolve,reject);
   const data=sourceTables[table].filter(row=>eqs.every(([key,val])=>row[key]===val))
    .slice(from,to+1);
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }
 };return q;
}});
const GET=new Function("NextResponse","getAdminUser","db","osloDateKey",
 "buildAccountingOverview","accountingOverviewCsv",
 clean+";return GET;")(NextResponse,async()=>({role}),db,()=>"2026-11-18",
 buildAccountingOverview,accountingOverviewCsv);
const request=part=>new Request("https://example.invalid/api/admin/regnskap"+part);
let response=await GET(request("?year=2026"));
assert.equal(response.status,200);
let payload=await response.json();
assert.equal(payload.total.issuedCount,2);
assert.equal(payload.total.recordedPaymentsThisYearOre,37500);
assert.ok(!JSON.stringify(payload).includes("vipps_reference"),"Do not expose raw Vipps tokens");
response=await GET(request("?year=2026&format=csv"));
assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/csv/);
assert.match(await response.text(),/FA-2026-1/);
role="staff";response=await GET(request(""));assert.equal(response.status,403);
role="owner";response=await GET(request("?year=1000"));assert.equal(response.status,400);
broken=true;response=await GET(request(""));assert.equal(response.status,503);
console.log("Regnskap på PC bestått: eiermeny, betalt/ubetalt, MVA, regnskapsark, originalbilag, Tripletex-status, årsfilter, CSV, betaling uten dobbelttelling og databasefeil.");
