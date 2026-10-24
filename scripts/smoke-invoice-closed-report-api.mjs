import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// All remote reads are mocked. Export never writes invoices, ledgers, or credits.
const reportSource=readFileSync("lib/invoiceClosedReport.js","utf8").replace(/^export /gm,"");
const {buildClosedInvoiceReport,closedInvoiceReportCsv}=new Function(reportSource+";return {buildClosedInvoiceReport,closedInvoiceReportCsv};")();
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0411";
let role="owner",failedTable="",queryCount=0,writes=0,truncate=false,reopenDuringReport=false,closureReadCount=0;
const data={
 invoice_admin_closures:[{invoice_id:id,closed_at:"2026-10-24T18:00:00Z"}],
 invoice_drafts:[{
  id,status:"issued",invoice_number:"AS-WEB-2026-000411",issued_date:"2026-10-15",
  customer:{name:"Testkunde"},line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],
  paid_ore:12500,credited_ore:0
 }],
 invoice_credit_notes:[]
};
const db=()=>({from(table){
 let ids=null,fields="";
 const q={
  select(f){fields=f;return q;},
  not(){return q;},
  order(){return q;},
  in(key,value){assert.ok(["id","invoice_id"].includes(key));ids=value;return q;},
  async range(start,end){
   queryCount++;
   assert.ok(!fields.includes("pdf_base64"),"Never fetch frozen PDF blobs for VAT report");
   if(table===failedTable)return {error:{message:"Database down"},data:null};
   if(table==="invoice_admin_closures"){
    closureReadCount++;
    if(reopenDuringReport&&closureReadCount%2===0)return {data:[],error:null};
   }
   if(truncate&&table==="invoice_admin_closures")return {data:Array(500).fill(data[table][0]),error:null};
   return {data:(data[table]||[]).filter(x=>!ids||ids.includes(x.id??x.invoice_id)).slice(start,end+1),error:null};
  },
  update(){writes++;throw Error("No financial writes in a report")},
  insert(){writes++;throw Error("No financial writes in a report")},
  delete(){writes++;throw Error("No financial writes in a report")}
 };
 return q;
}});
class NextResponse{
 constructor(body,{headers={}}={}){this.status=200;this.body=body;this.headers=headers;}
 static json(data,{status=200,headers={}}={}){return {status,body:data,headers};}
}
const raw=readFileSync("app/api/admin/invoices/closed-report/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const GET=new Function("NextResponse","getAdminUser","db","buildClosedInvoiceReport","closedInvoiceReportCsv",
 raw+";return GET;")(NextResponse,async()=>({role}),db,buildClosedInvoiceReport,closedInvoiceReportCsv);
const get=query=>GET({url:"https://localhost/api/admin/invoices/closed-report"+(query?"?"+query:"")});
let result=await get("");
assert.equal(result.status,200);
assert.equal(result.body.total.count,1);
assert.equal(result.body.total.grossOre,12500);
assert.equal(result.body.total.netVatOre,2500);
assert.equal(result.headers["Cache-Control"],"private, no-store");
assert.ok(queryCount>=3);
result=await get("from=2026-10-25&to=2026-10-25");
assert.equal(result.status,200);
assert.equal(result.body.total.count,0);
result=await get("format=csv");
assert.equal(result.status,200);
assert.equal(result.headers["Content-Type"],"text/csv; charset=utf-8");
assert.match(result.headers["Content-Disposition"],/attachment;/);
assert.ok(result.body.toString("utf8").startsWith("\uFEFF"));
assert.ok(result.body.toString("utf8").includes("AS-WEB-2026-000411"));
result=await get("from=2026-11-10&to=2026-01-01");
assert.equal(result.status,400);
result=await get("from=2026-02-31");
assert.equal(result.status,400,"Impossible calendar dates must be rejected");
role="staff";result=await get("");
assert.equal(result.status,403,"Report is owner-only");
role="owner";failedTable="invoice_credit_notes";
result=await get("");
assert.equal(result.status,503,"Never present an incomplete VAT report on failed fetch");
failedTable="";truncate=true;
result=await get("");
assert.equal(result.status,503,"Overlong closure pagination must fail closed");
truncate=false;
reopenDuringReport=true;closureReadCount=0;
result=await get("");
assert.equal(result.status,503,"Concurrent reopening must prevent a stale export");
reopenDuringReport=false;
data.invoice_drafts[0].paid_ore=12499;
result=await get("");
assert.equal(result.status,503,"A closed invoice with stale payment balance must not be included silently");
assert.equal(writes,0);
const page=readFileSync("app/admin/faktura/rapport/page.js","utf8");
const ui=readFileSync("app/admin/faktura/rapport/ClosedInvoicesReportClient.js","utf8");
const archive=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(page.includes('user.role!=="owner"'));
assert.ok(ui.includes("Eksporter rapport til CSV (Excel)"));
assert.ok(ui.includes("ikke en MVA-melding"));
assert.ok(ui.includes('type="date"'));
assert.ok(archive.includes('href="/admin/faktura/rapport"'));
console.log("Rapport-API bestått: eiertilgang, CSV med Excel-BOM, datofilter, ingen PDF-blobs, avvikssperre og ingen endringer.");
