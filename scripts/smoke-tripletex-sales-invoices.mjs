import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(file,"utf8");
const paymentSrc=read("lib/invoicePaymentStatus.js").replace(/^export /gm,"");
const {invoiceGrossOre,invoicePaymentState}=new Function(paymentSrc+
 ";return {invoiceGrossOre,invoicePaymentState};")();
const settlementSrc=read("lib/invoiceSettlementInfo.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {invoiceSettlementInfo,summarizeInvoiceActivity}=new Function("invoicePaymentState",
 settlementSrc+";return {invoiceSettlementInfo,summarizeInvoiceActivity};")(invoicePaymentState);
const exportSrc=read("lib/tripletexSalesInvoiceExport.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {inspectSalesInvoice,salesInvoiceExportOverview,tripletexSalesInvoiceCsv,
 salesInvoiceArchiveCsv,importHeaders,auditInvoicePaymentEntries}=new Function("invoiceGrossOre","invoicePaymentState","invoiceSettlementInfo",
 exportSrc+";return {inspectSalesInvoice,salesInvoiceExportOverview,tripletexSalesInvoiceCsv,salesInvoiceArchiveCsv,importHeaders,auditInvoicePaymentEntries};")(
 invoiceGrossOre,invoicePaymentState,invoiceSettlementInfo
);
const zipSrc=read("lib/zipFrozenInvoices.js").replace(/^export /gm,"");
const {zipFrozenInvoicePdfs}=new Function(zipSrc+";return {zipFrozenInvoicePdfs};")();

const pdf=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.alloc(140,65),Buffer.from("\n%%EOF")]);
const invoice=(id,paid=0,rate=25,options={})=>({
 id,status:"sent",title:"Eksempel",
 invoice_number:"AS-2026-"+id,
 issued_date:"2026-10-"+String(Number(id)+10).padStart(2,"0"),
 issued_at:"2026-10-"+String(Number(id)+10).padStart(2,"0")+"T09:00:00Z",
 due_date:"2026-11-20",sent_at:"2026-10-25T10:00:00Z",
 customer:{name:"Fiktiv kunde "+id,email:"customer"+id+"@example.invalid",
  phone:"00000000",organizationNumber:"999888777"},
 line_items:[{description:"Arbeid – utført",quantity:2,unitPriceOre:10000,vatRate:rate}],
 paid_ore:paid,credited_ore:0,
 pdf_base64:pdf.toString("base64"),
 ...options
});
const rows=[
 invoice("1"),
 invoice("2",25000),
 invoice("3",10000),
 invoice("4",0,0),
 invoice("5",0,25,{credited_ore:5000,activity:{creditNoteCount:1,creditDocumentsOre:5000}}),
 invoice("6",0,25,{status:"draft",invoice_number:null}),
 invoice("7",0,25,{sent_at:null})
];
const payments=[
 {id:"p2",invoice_id:"2",amount_ore:25000,vipps_reference:"test-vipps-2",reversed_at:null},
 {id:"p3",invoice_id:"3",amount_ore:10000,vipps_reference:null,reversed_at:null}
];
const captures=[
 {id:"c2",invoice_id:"2",state:"captured",captured_ore:25000,refunded_ore:0}
];
rows[1].activity={vippsCapturedOre:25000,vippsRefundedOre:0,creditDocumentsOre:0,vippsActiveCount:0};
rows[1].paymentAudit=auditInvoicePaymentEntries(rows[1],[payments[0]]);
rows[2].activity={vippsCapturedOre:0,vippsRefundedOre:0,creditDocumentsOre:0,vippsActiveCount:0};
rows[2].paymentAudit=auditInvoicePaymentEntries(rows[2],[payments[1]]);
assert.equal(rows[1].paymentAudit.matched,true);
assert.equal(rows[1].paymentAudit.source,"vipps");
assert.equal(rows[2].paymentAudit.source,"other");
assert.equal(auditInvoicePaymentEntries(rows[1],[]).matched,false);
assert.equal(auditInvoicePaymentEntries(rows[1],[{...payments[0],amount_ore:24000}]).matched,false);
assert.equal(auditInvoicePaymentEntries(rows[1],[{...payments[0],amount_ore:20000},{...payments[1],invoice_id:"2",amount_ore:5000}]).source,"mixed");
const overview=salesInvoiceExportOverview(rows,"2026-11-16");
assert.equal(overview.summary.total,6);
assert.equal(overview.summary.unpaid,1);
assert.equal(overview.summary.paid,2);
assert.equal(overview.summary.needsReview,3);
assert.equal(overview.summary.withFrozenPdf,6);
assert.equal(overview.rows[0].invoice.id,"1");
assert.equal(inspectSalesInvoice(rows[3],"2026-11-16").state,"review","Never guess 0% VAT category");
assert.equal(inspectSalesInvoice(rows[4],"2026-11-16").state,"review","Credit requires handling");
assert.equal(inspectSalesInvoice(rows[6],"2026-11-16").state,"review","Unconfirmed send not importable");
assert.throws(()=>tripletexSalesInvoiceCsv(overview,{startNumber:5}),/ledig numerisk/);
assert.throws(()=>tripletexSalesInvoiceCsv(overview,{includePaid:true}),/Import-ID/);
const pending=tripletexSalesInvoiceCsv(overview,{startNumber:80000000});
assert.equal(pending.accepted.length,1,"Only one fully unpaid safe invoice by default");
assert.equal(pending.accepted[0].importNumber,"80000000");
assert.ok(pending.csv.startsWith("\uFEFF"));
assert.ok(pending.csv.includes('"INVOICE NO"'));
assert.ok(pending.csv.includes('"ORDER LINE - VAT CODE"'));
assert.ok(pending.csv.includes('"Arbeid – utført"'));
assert.ok(pending.csv.includes('"3"'));
assert.ok(pending.csv.includes('"80000000"'));
assert.ok(pending.csv.includes("Opprinnelig fakturanr AS-2026-1"));
assert.ok(!pending.csv.includes('"AS-2026-2"')&&!pending.csv.includes("Opprinnelig fakturanr AS-2026-2"));
assert.deepEqual(importHeaders.slice(0,3),["INVOICE NO","INVOICE DATE","DUE DATE"]);
assert.throws(()=>tripletexSalesInvoiceCsv(overview,{includePaid:true,paymentTypeOther:"BANK"}),/Import-ID/);
assert.throws(()=>tripletexSalesInvoiceCsv(overview,{includePaid:true,paymentTypeVipps:"VIPPS"}),/Import-ID/);
const withPayment=tripletexSalesInvoiceCsv(overview,{startNumber:80000000,includePaid:true,
 paymentTypeVipps:"VIPPS",paymentTypeOther:"BANK"});
assert.equal(withPayment.accepted.length,3);
assert.ok(withPayment.csv.includes('"80000001"'));
assert.ok(withPayment.csv.includes('"250,00"'));
assert.ok(withPayment.csv.includes('"BANK"'));
assert.ok(withPayment.csv.includes('"VIPPS"'));
assert.ok(withPayment.csv.includes('"250,00"'));
assert.ok(withPayment.csv.includes('"100,00"'));
assert.ok(!withPayment.csv.includes("Opprinnelig fakturanr AS-2026-4"));
const archive=salesInvoiceArchiveCsv(overview,{startNumber:80000000});
for(const id of ["1","2","3","4","5","7"])assert.ok(archive.includes("AS-2026-"+id),"All originals in archive");
assert.ok(!archive.includes("AS-2026-6"),"Never export draft");
assert.match(archive,/\/api\/admin\/invoices\/pdf\?id=1/);
const bad=invoice("8",0,25,{customer:{name:"=cmd|1",email:"e@fake.invalid"}});
const injection=salesInvoiceArchiveCsv(salesInvoiceExportOverview([bad],"2026-11-16"));
assert.ok(injection.includes("'=cmd"),"Neutralize CSV formulas");
const zip=zipFrozenInvoicePdfs(overview.rows);
assert.equal(zip.subarray(0,4).toString("latin1"),"PK\u0003\u0004");
assert.ok(zip.includes(Buffer.from("%PDF-1.4")));
assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
assert.equal(zip.readUInt16LE(zip.length-14),6);
assert.throws(()=>zipFrozenInvoicePdfs([{invoice:{pdf_base64:Buffer.from("bad").toString("base64")}}]),/ugyldig/);
assert.throws(()=>zipFrozenInvoicePdfs([]),/mellom 1 og 500/);

// The server API must only read invoice records; it cannot book in Tripletex.
const routeSrc=read("app/api/admin/invoices/tripletex/sales/route.js");
assert.ok(!routeSrc.includes("Resend")&&!routeSrc.includes("issue_invoice_draft"));
assert.ok(!routeSrc.includes(".update(")&&!routeSrc.includes(".insert("));
assert.ok(routeSrc.includes('user?.role!=="owner"'));
assert.ok(routeSrc.includes('format==="pdfzip"'));
assert.ok(routeSrc.includes("summarizeInvoiceActivity"));
const handler=routeSrc.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
let role="owner",forcedError=false;
const records={
 invoice_drafts:rows.filter(r=>r.status==="sent"),
 invoice_vipps_payments:captures,
 invoice_credit_notes:[],
 invoice_payments:payments
};
function tableQuery(table){
 const eqs=[],ins=[];
 let from=0,to=Infinity;
 const q={
  select(){return q;},order(){return q;},
  range(a,b){from=a;to=b;return q;},
  eq(col,value){eqs.push([col,value]);return q;},
  in(col,values){ins.push([col,values]);return q;},
  then(resolve,reject){
   if(forcedError)return Promise.resolve({data:null,error:{message:"Simulated DB unavailable"}}).then(resolve,reject);
   const selected=(records[table]||[]).filter(row=>eqs.every(([col,val])=>row[col]===val)&&
    ins.every(([col,values])=>values.includes(row[col]))).slice(from,to+1);
   return Promise.resolve({data:selected,error:null}).then(resolve,reject);
  }
 };
 return q;
}
const mockedDb=()=>({from:tableQuery});
const NextResponse=class extends Response{static json(data,opts={}){return Response.json(data,opts)}};
const GET=new Function("NextResponse","getAdminUser","db","summarizeInvoiceActivity","auditInvoicePaymentEntries",
 "osloDateKey","salesInvoiceExportOverview","tripletexSalesInvoiceCsv","salesInvoiceArchiveCsv",
 "zipFrozenInvoicePdfs","process",handler+";return GET;")(
 NextResponse,async()=>({role}),mockedDb,summarizeInvoiceActivity,auditInvoicePaymentEntries,
 ()=>"2026-11-16",salesInvoiceExportOverview,tripletexSalesInvoiceCsv,salesInvoiceArchiveCsv,
 zipFrozenInvoicePdfs,{env:{}}
);
const request=q=>new Request("https://example.invalid/api/admin/invoices/tripletex/sales"+q);
let r=await GET(request(""));
assert.equal(r.status,200);
let j=await r.json();
assert.equal(j.summary.total,6);
assert.equal(j.summary.unpaid,1);
assert.equal(j.summary.paid,2);
assert.equal(j.summary.needsReview,3);
assert.ok(!JSON.stringify(j).includes("pdf_base64"),"Do not send PDF bytes in JSON listing");
r=await GET(request("?format=tripletex"));
assert.equal(r.status,200);
assert.match(r.headers.get("content-type"),/text\/csv/);
assert.match(await r.text(),/AS-2026-1/);
r=await GET(request("?format=tripletex&includePaid=1&paymentTypeVipps=VIPPS&paymentTypeOther=BANK"));
assert.equal(r.status,200);
const paidCsv=await r.text();
assert.match(paidCsv,/AS-2026-3/);
assert.ok(paidCsv.includes('"VIPPS"')&&paidCsv.includes('"BANK"'));
r=await GET(request("?format=archive"));
assert.equal(r.status,200);
assert.match(await r.text(),/AS-2026-5/);
r=await GET(request("?format=pdfzip"));
assert.equal(r.status,200);
assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,2).toString(),"PK");
role="staff";r=await GET(request(""));assert.equal(r.status,403);
role="owner";r=await GET(request("?format=tripletex&startNumber=1"));assert.equal(r.status,400);
r=await GET(request("?format=tripletex&includePaid=1"));assert.equal(r.status,400);
forcedError=true;r=await GET(request(""));assert.equal(r.status,503);
const page=read("app/admin/faktura/mva/tripletex/page.js");
const ui=read("app/admin/faktura/mva/tripletex/TripletexSalesClient.js");
assert.ok(page.includes("TripletexSalesClient"));
assert.ok(ui.includes('url("pdfzip"'));
assert.ok(ui.includes('url("archive"'));
assert.ok(ui.includes('link("tripletex")'));
assert.ok(ui.includes("paymentTypeVipps")&&ui.includes("paymentTypeOther"));
assert.ok(ui.includes("Jeg har kontrollert at importnumrene"));
console.log("Tripletex utgående fakturaer bestått: ekte importkolonner, mva-koder, betalte/ubetalte, kreditt/kontrollsperre, nummerreferanse, CSV, original-PDF ZIP, eier og kun lesing.");
