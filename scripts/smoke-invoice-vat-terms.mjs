import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const raw=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const {vatTermBounds,buildInvoiceVatTermReport,invoiceVatTermCsv}=
 new Function(raw+";return {vatTermBounds,buildInvoiceVatTermReport,invoiceVatTermCsv};")();
assert.deepEqual(vatTermBounds("2026","5"),
 {year:2026,term:5,from:"2026-09-01",to:"2026-10-31",title:"5. termin 2026"});
assert.deepEqual(vatTermBounds("2024","1").to,"2024-02-29");
assert.deepEqual(vatTermBounds("2026","6").to,"2026-12-31");
assert.throws(()=>vatTermBounds("2026","7"),/termin/);
assert.throws(()=>vatTermBounds("2026","0"),/termin/);
assert.throws(()=>vatTermBounds("202X","5"),/gyldig/);

const inv1={
 id:"invoice-A",invoice_number:"AS-2026-000001",status:"issued",issued_date:"2026-09-30",
 customer:{name:"=cmd('danger')"},paid_ore:0,adminClosure:null,
 line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}]
};
const inv2={
 id:"invoice-B",invoice_number:"AS-2026-000002",status:"issued",issued_date:"2026-10-02",
 customer:{name:"Normal kunde"},paid_ore:0,
 line_items:[{quantity:1,unitPriceOre:10000,vatRate:12},
 {quantity:1,unitPriceOre:5000,vatRate:15}]
};
const inv3={
 id:"invoice-C",invoice_number:"AS-2026-000003",status:"draft",issued_date:"2026-10-03",
 customer:{name:"Kladd"},line_items:[{quantity:1,unitPriceOre:9900,vatRate:25}]
};
const note={
 id:"credit-1",invoice_id:"invoice-older-than-term",
 credit_number:"AS-KN-2026-000001",credit_date:"2026-10-03",
 original_invoice_number:"AS-2026-000001",customer:{name:"Normal kunde"},
 lines:[{sourceIndex:0,quantity:0.4,netOre:4000,vatOre:1000,vatRate:25,totalOre:5000}],
 subtotal_ore:4000,vat_ore:1000,total_ore:5000
};
const copy=JSON.stringify({inv1,inv2,inv3,note});
const report=buildInvoiceVatTermReport([inv1,inv2,inv3],[note],{year:2026,term:5});
assert.equal(report.total.invoiceCount,2,"Unpaid issued invoices are included");
assert.equal(report.total.creditCount,1,"Credit note from older invoice included on its own date");
assert.equal(report.total.invoiceGrossOre,29450);
assert.equal(report.total.creditedGrossOre,5000);
assert.equal(report.total.baseOre,21000);
assert.equal(report.total.vatOre,3450);
assert.equal(report.total.grossOre,24450);
assert.equal(report.total.vat[25].baseOre,6000);
assert.equal(report.total.vat[25].vatOre,1500);
assert.equal(report.total.vat[12].baseOre,10000);
assert.equal(report.total.vat[12].vatOre,1200);
assert.equal(report.total.vat[15].baseOre,5000);
assert.equal(report.total.vat[15].vatOre,750);
assert.equal(report.rows[2].kind,"credit");
assert.equal(report.rows[2].totalOre,-5000);
assert.equal(report.rows[2].invoiceNumberReference,inv1.invoice_number);
assert.equal(JSON.stringify({inv1,inv2,inv3,note}),copy,"Pure report may not mutate saved invoices");
const septOnly=buildInvoiceVatTermReport([inv1],[/* credit is not issued until October */],{year:2026,term:5});
assert.equal(septOnly.total.vatOre,2500);
const zero=buildInvoiceVatTermReport([{...inv1,id:"zero",line_items:[{quantity:1,unitPriceOre:10000,vatRate:0}]}],[],{year:2026,term:5});
assert.equal(zero.total.vatOre,0);
assert.equal(zero.total.vat[0].baseOre,10000);

const csv=invoiceVatTermCsv(report);
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv,/"'\=cmd\('danger'\)"/,"Formula injection must be escaped");
assert.ok(csv.includes('"244,50"'));
assert.ok(csv.includes('"-50,00"'));
assert.ok(csv.includes('"AS-2026-000001"'));
assert.ok(csv.includes('"MVA 25 % (kr)"'));
assert.ok(csv.includes("Inngående MVA vises separat"));
assert.ok(csv.includes("\r\n"));
assert.ok(csv.includes('"SUM"'));
assert.throws(()=>buildInvoiceVatTermReport([{...inv1,issued_date:"2026-11-01"}],[],{year:2026,term:5}),/utenfor valgt termin/);
assert.throws(()=>buildInvoiceVatTermReport([{...inv1,issued_date:"2026-02-31"}],[],{year:2026,term:1}),/gyldig dokumentdato/);
assert.throws(()=>buildInvoiceVatTermReport([inv1,inv1],[],{year:2026,term:5}),/Duplisert/);
assert.throws(()=>buildInvoiceVatTermReport([{...inv1,line_items:[{quantity:1,unitPriceOre:10000,vatRate:23}]}],[],{year:2026,term:5}),/Ukjent MVA-sats/);
assert.throws(()=>buildInvoiceVatTermReport([], [{...note,vat_ore:999}],{year:2026,term:5}),/Kreditnotasummene/);
assert.throws(()=>buildInvoiceVatTermReport([], [{...note,lines:[{...note.lines[0],vatOre:400}]}],{year:2026,term:5}),/MVA-sats/);
assert.equal(buildInvoiceVatTermReport([],[],{year:2026,term:5}).total.grossOre,0);
console.log("MVA-termin-rapport bestått: 6 terminer, ubetalte fakturaer, kreditnota i senere termin, satser, summer, CSV og datoer.");
