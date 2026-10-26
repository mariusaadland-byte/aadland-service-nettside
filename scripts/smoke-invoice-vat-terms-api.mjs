import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const raw=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const methods=new Function(raw+";return {vatTermBounds,buildInvoiceVatTermReport,invoiceVatTermCsv};")();
const purchaseCode=readFileSync("lib/invoiceInputVat.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const input=new Function("vatTermBounds",purchaseCode+
 ";return {parseKronerOre,validInvoiceDay,calculateInputVatSummary,mergedVatReport,combinedVatCsv};")(methods.vatTermBounds);
const rawExternal=readFileSync("lib/vatExternalSales.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const external=new Function("parseKronerOre","validInvoiceDay",rawExternal+
 ";return {validateVatExternalSale,calculateExternalSalesSummary,mergeExternalVatReport};")(
 input.parseKronerOre,input.validInvoiceDay);
let role="owner",failed="",writes=0,reads=[],tooMany=false;
const tables={
 invoice_drafts:[{
  id:"invoice-1",status:"issued",invoice_number:"AS-2026-001",issued_date:"2026-10-13",
  customer:{name:"Person"},line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}]
 }],
 invoice_credit_notes:[{
  id:"credit-1",invoice_id:"invoice-older",credit_number:"AS-KN-2026-001",credit_date:"2026-10-14",
  original_invoice_number:"AS-2026-OLD",customer:{name:"Person"},
  lines:[{netOre:2000,vatOre:500,vatRate:25}],subtotal_ore:2000,vat_ore:500,total_ore:2500
 }],
 vat_purchase_documents:[],
 vat_external_sales_documents:[],
 vat_reporting_profile:[{id:"primary",registration_date:"2026-06-01",first_term_year:2026,first_term:3}]
};
const db=()=>({from(table){
 let lower,upper;
 const q={
  select(columns){assert.ok(!columns.includes("pdf_base64"));return q;},
  gte(field,value){assert.ok(["issued_date","credit_date","document_date"].includes(field));lower=value;return q;},
  lte(field,value){assert.ok(["issued_date","credit_date","document_date"].includes(field));upper=value;return q;},
  neq(field,value){assert.equal(field,"status");assert.equal(value,"draft");return q;},
  is(field,value){assert.equal(field,"voided_at");assert.equal(value,null);return q;},
  order(){return q;},
  eq(field,value){assert.equal(field,"id");assert.equal(value,"primary");return q;},
  async maybeSingle(){
   reads.push({table});
   if(failed===table)return {data:null,error:{message:"database unavailable"}};
   return {data:tables[table][0]||null,error:null};
  },
  async range(start,end){
   reads.push({table,start,end,lower,upper});
   if(failed===table)return {data:null,error:{message:"database unavailable"}};
   if(tooMany&&table==="invoice_drafts")return {data:Array(500).fill(tables[table][0]),error:null};
   const field=table==="invoice_drafts"?"issued_date":table==="invoice_credit_notes"?"credit_date":"document_date";
   return {data:tables[table].filter(v=>v[field]>=lower&&v[field]<=upper).slice(start,end+1),error:null};
  },
  update(){writes++;throw Error("not allowed");},
  insert(){writes++;throw Error("not allowed");}
 };return q;
}});
class NextResponse{
 constructor(buffer,{headers={}}={}){this.status=200;this.body=buffer;this.headers=headers;}
 static json(data,{status=200,headers={}}={}){return {status,body:data,headers};}
}
const source=readFileSync("app/api/admin/invoices/vat-terms/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const guardSrc=readFileSync("lib/vatRegistrationGuard.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {applyVatRegistrationGuard}=new Function("vatPeriodKey",guardSrc+
 ";return {applyVatRegistrationGuard};")((year,term)=>{
 const y=Number(year),t=Number(term);return y>=2000&&y<=2100&&t>=1&&t<=6?y*10+t:null;
});
const GET=new Function("NextResponse","getAdminUser","db","buildInvoiceVatTermReport","invoiceVatTermCsv","vatTermBounds",
 "calculateInputVatSummary","mergedVatReport","combinedVatCsv",
 "calculateExternalSalesSummary","mergeExternalVatReport","applyVatRegistrationGuard",
 source+";return GET;")(NextResponse,async()=>({role}),db,methods.buildInvoiceVatTermReport,
 methods.invoiceVatTermCsv,methods.vatTermBounds,input.calculateInputVatSummary,input.mergedVatReport,input.combinedVatCsv,
 external.calculateExternalSalesSummary,external.mergeExternalVatReport,applyVatRegistrationGuard);
const call=query=>GET({url:"https://localhost/api/admin/invoices/vat-terms?"+query});
let r=await call("year=2026&term=5");
assert.equal(r.status,200);
assert.equal(r.body.total.invoiceCount,1);
assert.equal(r.body.total.creditCount,1);
assert.equal(r.body.total.vatOre,2000);
assert.equal(r.body.total.grossOre,10000);
assert.equal(r.headers["Cache-Control"],"private, no-store");
assert.deepEqual(reads.map(x=>x.table).sort(),["invoice_credit_notes","invoice_drafts","vat_external_sales_documents","vat_purchase_documents","vat_reporting_profile"]);
assert.equal(r.body.purchases.inputVatOre,0);
assert.equal(r.body.comparison.estimateAllowed,true);
tables.vat_external_sales_documents.push({
 id:"ext-1",document_date:"2026-10-15",document_number:"OLD-10",customer_name:"Kunde",
 source_system:"Conta",kind:"invoice",base_ore:20000,vat_ore:5000,voided_at:null,
 vat_groups:{"25":{baseOre:20000,vatOre:5000}}
});
r=await call("year=2026&term=5");
assert.equal(r.status,200);
assert.equal(r.body.total.invoiceCount,2);
assert.equal(r.body.total.vatOre,7000);
assert.equal(r.body.comparison.differenceOre,7000);
assert.ok(r.body.rows.some(row=>row.externalDocumentId==="ext-1"));
tables.vat_external_sales_documents.length=0;
tables.vat_reporting_profile.length=0;
r=await call("year=2026&term=5");
assert.equal(r.status,200);
assert.equal(r.body.comparison.estimateAllowed,false,"No registration profile: do not estimate payment");
assert.equal(r.body.registrationReview.kind,"registration_unknown");
tables.vat_reporting_profile.push({registration_date:"2026-06-01",first_term_year:2026,first_term:3});
r=await call("year=2026&term=2");
assert.equal(r.status,200);
assert.equal(r.body.comparison.estimateAllowed,false,"No VAT estimate before first term");
r=await call("year=2026&term=3");
assert.equal(r.body.comparison.estimateAllowed,true,"First term permits ordinary qualifying input VAT");

assert.ok(reads.filter(x=>x.table!=="vat_reporting_profile").every(x=>x.lower==="2026-09-01"&&x.upper==="2026-10-31"));
r=await call("year=2026&term=5&format=csv");
assert.equal(r.status,200);
assert.equal(r.headers["Content-Type"],"text/csv; charset=utf-8");
assert.match(r.headers["Content-Disposition"],/attachment/);
assert.ok(r.body.toString("utf8").startsWith("\uFEFF"));
assert.ok(r.body.toString("utf8").includes("AS-KN-2026-001"));
r=await call("year=2026&term=7");
assert.equal(r.status,400);
r=await call("year=2026&term=5&format=jsonp");
assert.equal(r.status,400);
role="staff";r=await call("year=2026&term=5");
assert.equal(r.status,403);
role="owner";failed="invoice_credit_notes";
r=await call("year=2026&term=5");
assert.equal(r.status,503,"Failed credit lookup cannot yield misleading VAT totals");
failed="";tooMany=true;
r=await call("year=2026&term=5");
assert.equal(r.status,503,"Pagination maximum must fail closed");
tooMany=false;
tables.invoice_credit_notes[0].vat_ore=499;
r=await call("year=2026&term=5");
assert.equal(r.status,503,"Malformed credit sums must not be silently included");
assert.equal(writes,0);
const page=readFileSync("app/admin/faktura/mva/page.js","utf8");
const ui=readFileSync("app/admin/faktura/mva/InvoiceVatTermClient.js","utf8");
const archive=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(page.includes('user.role!=="owner"'));
assert.ok(ui.includes("Eksporter salgsdokumenter, innkjøpsbilag"));
assert.ok(ui.includes("ikke en ferdig MVA-melding"));
assert.ok(archive.includes('href="/admin/faktura/mva"'));
console.log("MVA-termin-API bestått: eiertilgang, 3 dokumenttabeller, manglende data, CSV, paginering og ingen endringer.");
