import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Pure in-memory report calculation only: no financial writes and no customer messages.
const source=readFileSync("lib/invoiceClosedReport.js","utf8").replace(/^export /gm,"");
const {osloClosedDate,buildClosedInvoiceReport,closedInvoiceReportCsv}=
 new Function(source+";return {osloClosedDate,buildClosedInvoiceReport,closedInvoiceReportCsv};")();
const id1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0201";
const id2="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0202";
const id3="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0203";
const closures=[
 {invoice_id:id1,closed_at:"2026-10-24T22:30:00Z"},
 {invoice_id:id2,closed_at:"2026-10-23T09:30:00Z"},
 {invoice_id:id3,closed_at:null}
];
const invoices=[
 {id:id1,status:"issued",invoice_number:"AS-2026-000001",issued_date:"2026-10-19",
  customer:{name:"=SUM(1,2)"},paid_ore:18700,credited_ore:5000,
  line_items:[{quantity:1,unitPriceOre:10000,vatRate:25},{quantity:1,unitPriceOre:10000,vatRate:12}]},
 {id:id2,status:"issued",invoice_number:"AS-2026-000002",issued_date:"2026-10-20",
  customer:{name:"Vanlig kunde"},paid_ore:16500,credited_ore:0,
  line_items:[{quantity:1,unitPriceOre:10000,vatRate:15},{quantity:1,unitPriceOre:5000,vatRate:0}]},
 {id:id3,status:"issued",invoice_number:"AS-2026-000003",issued_date:"2026-10-20",
  customer:{name:"Gjenåpnet"},paid_ore:12500,credited_ore:0,
  line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}]}
];
const notes=[{
 id:"credit-1",invoice_id:id1,subtotal_ore:4000,vat_ore:1000,total_ore:5000,
 lines:[{sourceIndex:0,quantity:0.4,netOre:4000,vatOre:1000,vatRate:25,totalOre:5000}]
}];
assert.equal(osloClosedDate("2026-10-24T22:30:00Z"),"2026-10-25",
 "Must filter on closure date in Oslo, not UTC");
assert.equal(osloClosedDate("2026-12-31T23:20:00Z"),"2027-01-01");
const inputCopy=JSON.stringify({closures,invoices,notes});
const report=buildClosedInvoiceReport(closures,invoices,notes);
assert.equal(report.total.count,2,"Reopened invoice with null closed_at excluded");
assert.equal(report.rows[0].id,id1,"Closed date must sort descending");
assert.deepEqual(report.rows[0].vat[25],{netOre:6000,vatOre:1500});
assert.deepEqual(report.rows[0].vat[12],{netOre:10000,vatOre:1200});
assert.equal(report.rows[0].grossOre,23700);
assert.equal(report.rows[0].creditOre,5000);
assert.equal(report.rows[0].netSaleOre,16000);
assert.equal(report.rows[0].netVatOre,2700);
assert.equal(report.rows[0].netGrossOre,18700);
assert.equal(report.rows[0].paidOre,18700);
assert.deepEqual(report.rows[1].vat[15],{netOre:10000,vatOre:1500});
assert.deepEqual(report.rows[1].vat[0],{netOre:5000,vatOre:0});
assert.deepEqual({
 count:report.total.count,originalNetOre:report.total.originalNetOre,
 originalVatOre:report.total.originalVatOre,grossOre:report.total.grossOre,
 creditNetOre:report.total.creditNetOre,creditVatOre:report.total.creditVatOre,
 netSaleOre:report.total.netSaleOre,netVatOre:report.total.netVatOre,
 netGrossOre:report.total.netGrossOre,paidOre:report.total.paidOre
},{count:2,originalNetOre:35000,originalVatOre:5200,grossOre:40200,
  creditNetOre:4000,creditVatOre:1000,netSaleOre:31000,netVatOre:4200,
  netGrossOre:35200,paidOre:35200});
assert.equal(report.total.vat[25].vatOre,1500);
assert.equal(report.total.vat[12].vatOre,1200);
assert.equal(report.total.vat[15].vatOre,1500);
assert.equal(report.total.vat[0].netOre,5000);
assert.equal(JSON.stringify({closures,invoices,notes}),inputCopy,"Report must not mutate any financial record");

const october24=buildClosedInvoiceReport(closures,invoices,notes,{from:"2026-10-24",to:"2026-10-24"});
assert.equal(october24.total.count,0,"Oslo closure at 00:30 next day must not leak into previous day");
const october25=buildClosedInvoiceReport(closures,invoices,notes,{from:"2026-10-25",to:"2026-10-25"});
assert.equal(october25.total.count,1);
assert.equal(october25.total.netVatOre,2700);
const csv=closedInvoiceReportCsv(report);
assert.ok(csv.startsWith("\uFEFF"),"CSV must contain UTF-8 BOM for Excel");
assert.ok(csv.includes(";"),"Norwegian Excel uses semicolon fields");
assert.ok(csv.includes("\r\n"),"CSV should use CRLF");
assert.ok(csv.includes('"\'=SUM(1,2)"'),"CSV must neutralize spreadsheet formula injection in customer name");
assert.ok(csv.includes('"187,00"'),"Monetary amount exported as kroner with decimal comma");
assert.ok(csv.includes('"MVA 25 % (kr)"'),"CSV exports VAT per tax rate");
assert.ok(csv.includes('"SUM"'),"CSV includes explicit totals");
assert.ok(csv.includes("ikke MVA-melding"),"The administrative date is not a tax period");

assert.throws(()=>buildClosedInvoiceReport(closures,[{...invoices[0],paid_ore:18701},invoices[1]],notes),/fullt oppgjort/);
assert.throws(()=>buildClosedInvoiceReport(closures,invoices,[{...notes[0],vat_ore:999}]),/Kreditnotasummene/);
assert.throws(()=>buildClosedInvoiceReport(closures,invoices,[{...notes[0],lines:[{...notes[0].lines[0],vatOre:500}]}]),/MVA på kreditnotalinje/);
assert.throws(()=>buildClosedInvoiceReport(closures,invoices.slice(1),notes),/dokumentgrunnlag/);
assert.throws(()=>buildClosedInvoiceReport([...closures,closures[0]],invoices,notes),/flere ganger/);
assert.throws(()=>buildClosedInvoiceReport(closures,invoices,notes,{from:"2026-11-01",to:"2026-10-01"}),/Fra-dato/);
assert.equal(buildClosedInvoiceReport([],[],[]).total.netVatOre,0);
console.log("Avsluttede fakturaers MVA-rapport bestått: satsene 0/12/15/25 %, kreditnota, Oslo-dato, saldo og sikker CSV.");
