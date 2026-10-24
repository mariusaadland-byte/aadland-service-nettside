import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const raw=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const methods=new Function(raw+";return {vatTermBounds,buildInvoiceVatTermReport,invoiceVatTermCsv};")();
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
 }]
};
const db=()=>({from(table){
 let lower,upper;
 const q={
  select(columns){assert.ok(!columns.includes("pdf_base64"));return q;},
  gte(field,value){assert.ok(["issued_date","credit_date"].includes(field));lower=value;return q;},
  lte(field,value){assert.ok(["issued_date","credit_date"].includes(field));upper=value;return q;},
  neq(field,value){assert.equal(field,"status");assert.equal(value,"draft");return q;},
  order(){return q;},
  async range(start,end){
   reads.push({table,start,end,lower,upper});
   if(failed===table)return {data:null,error:{message:"database unavailable"}};
   if(tooMany&&table==="invoice_drafts")return {data:Array(500).fill(tables[table][0]),error:null};
   const field=table==="invoice_drafts"?"issued_date":"credit_date";
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
const GET=new Function("NextResponse","getAdminUser","db","buildInvoiceVatTermReport","invoiceVatTermCsv","vatTermBounds",
 source+";return GET;")(NextResponse,async()=>({role}),db,methods.buildInvoiceVatTermReport,
 methods.invoiceVatTermCsv,methods.vatTermBounds);
const call=query=>GET({url:"https://localhost/api/admin/invoices/vat-terms?"+query});
let r=await call("year=2026&term=5");
assert.equal(r.status,200);
assert.equal(r.body.total.invoiceCount,1);
assert.equal(r.body.total.creditCount,1);
assert.equal(r.body.total.vatOre,2000);
assert.equal(r.body.total.grossOre,10000);
assert.equal(r.headers["Cache-Control"],"private, no-store");
assert.deepEqual(reads.map(x=>x.table).sort(),["invoice_credit_notes","invoice_drafts"]);
assert.ok(reads.every(x=>x.lower==="2026-09-01"&&x.upper==="2026-10-31"));
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
assert.ok(ui.includes("Eksporter terminens dokumenter og MVA"));
assert.ok(ui.includes("ikke en ferdig MVA-melding"));
assert.ok(archive.includes('href="/admin/faktura/mva"'));
console.log("MVA-termin-API bestått: eiertilgang, 2 dokumenttabeller, manglende data, CSV, paginering og ingen endringer.");
