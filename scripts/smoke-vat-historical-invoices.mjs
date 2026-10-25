import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const term=read("lib/vatDocumentPeriod.js").replace(/^export /gm,"");
const {vatDocumentPeriod}=new Function(term+";return {vatDocumentPeriod};")();
assert.deepEqual(vatDocumentPeriod("2026-04-17"),{year:2026,term:2,title:"2. termin 2026",months:"mars–april",key:"2026-2"});
assert.equal(vatDocumentPeriod("2025-11-30").term,6);
assert.equal(vatDocumentPeriod("2026-02-29"),null);
assert.equal(vatDocumentPeriod(""),null);
const saleCode=read("lib/vatExternalSales.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const parseKronerOre=value=>{
 const raw=String(value||"").replace(",",".");
 assert.match(raw,/^\d+(?:\.\d{1,2})?$/);
 return Math.round(Number(raw)*100);
};
const validInvoiceDay=value=>vatDocumentPeriod(value)!==null;
const {validateVatExternalSale,calculateExternalSalesSummary,mergeExternalVatReport}=
 new Function("parseKronerOre","validInvoiceDay",saleCode+
 ";return {validateVatExternalSale,calculateExternalSalesSummary,mergeExternalVatReport};")(
 parseKronerOre,validInvoiceDay);
const form={sourceSystem:"Conta",customerName:"Ola Nordmann",documentNumber:"OLD-100",
 documentDate:"2026-04-17",kind:"invoice",originalDocumentNumber:"",
 documentConfirmed:true,notDuplicateConfirmed:true,
 groups:{25:{base:"1000,00",vat:"250,00"}}};
const record=validateVatExternalSale(form);
assert.equal(record.base_ore,100000);assert.equal(record.vat_ore,25000);
assert.equal(record.source_system,"Conta");
assert.throws(()=>validateVatExternalSale({...form,notDuplicateConfirmed:false}),/allerede|registrert|Kontroller/i);
assert.throws(()=>validateVatExternalSale({...form,groups:{25:{base:"100,00",vat:"20,00"}}}),/stemmer/);
assert.throws(()=>validateVatExternalSale({...form,kind:"credit"}),/Kreditnota/);
const summary=calculateExternalSalesSummary([
 {...record,id:"ext-1",voided_at:null},
 {...record,id:"ext-2",kind:"credit",original_document_number:"OLD-100",document_number:"KN-100"}
],{from:"2026-03-01",to:"2026-04-30"});
assert.equal(summary.invoiceCount,1);assert.equal(summary.creditCount,1);
assert.equal(summary.vatOre,0);assert.equal(summary.rows.length,2);
const invoice=calculateExternalSalesSummary([{...record,id:"ext-3"}],{from:"2026-03-01",to:"2026-04-30"});
const vat=Object.fromEntries([0,12,15,25].map(rate=>[rate,{baseOre:0,vatOre:0}]));
const report={period:{year:2026,term:2,from:"2026-03-01",to:"2026-04-30"},
 total:{vat,invoiceCount:0,creditCount:0,baseOre:0,vatOre:0,grossOre:0,invoiceGrossOre:0,creditedGrossOre:0},
 rows:[],comparison:{outputVatOre:0,inputVatOre:5000,differenceOre:-5000,isComplete:false}};
const combined=mergeExternalVatReport(report,invoice);
assert.equal(combined.total.vatOre,25000);
assert.equal(combined.comparison.differenceOre,20000);
assert.equal(combined.rows[0].documentDate,"2026-04-17");
assert.equal(report.total.vatOre,0,"Never mutate the source report");
const route=read("app/api/admin/invoices/vat-external-sales/route.js");
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes('process.env.VERCEL_ENV==="preview"'));
assert.ok(route.includes("invoice_drafts")&&route.includes("invoice_credit_notes"));
const upload=read("app/api/admin/invoices/vat-external-files/route.js");
assert.ok(upload.includes("inspectVatAttachment"));
assert.ok(upload.includes("crypto.createHash")&&upload.includes('upsert:false'));
const ui=read("app/admin/faktura/mva/InvoiceVatTermClient.js");
const inputUI=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const externalUI=read("app/admin/faktura/mva/ExternalVatSalesClient.js");
assert.ok(inputUI.includes("documentPeriod.title"));
assert.ok(inputUI.includes("onChanged?.({documentDate"));
assert.ok(ui.includes("<ExternalVatSalesClient"));
assert.ok(ui.includes("setChosen({year:String(target.year),term:String(target.term)})"));
assert.ok(externalUI.includes("documentType=\"invoice\"")&&externalUI.includes("Prøv filopplasting igjen"));
const migration=read("supabase/migrations/20261025221500_vat_external_sales_documents.sql");
assert.ok(migration.includes("row level security"));
assert.ok(migration.includes("vat_external_sales_unique_active"));
assert.ok(migration.includes("before update or delete"));
console.log("Historiske MVA-bilag: automatisk terminkobling, ekstern fakturaarv, kreditering og privat dokumentarkiv OK.");
