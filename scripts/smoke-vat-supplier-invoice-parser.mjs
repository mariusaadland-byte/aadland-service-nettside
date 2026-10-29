import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const parser=new Function(read("lib/vatSupplierInvoiceParser.js").replace(/^export /gm,"")+
 ";return {parseNorwegianSupplierInvoice,isLikelySupplierInvoice};")();
const {parseNorwegianSupplierInvoice,isLikelySupplierInvoice}=parser;
const samples=[
 {name:"Byggmakker supplier invoice",input:[
 "BYGGMAKKER AS","FAKTURA","Fakturanummer: 500245",
 "Fakturadato: 24.10.2026","Forfallsdato: 07.11.2026",
 "Kunde: Aadland Service","Sum eks. mva 2 000,00",
 "MVA 25 % 500,00","Totalt inkl. mva 2 500,00","KID 999999999"
 ].join("\n"),supplier:"BYGGMAKKER AS",number:"500245",date:"2026-10-24",due:"2026-11-07",
 total:250000,group:{25:{base:"2000,00",vat:"500,00"}}},
 {name:"Ahlsell invoice, inferred rate from independently read net and VAT",input:[
 "Ahlsell Norge AS","Faktura nr: 7200401","Dato 19.10.2026",
 "Forfall 02.11.2026","Beløp eks mva 841,32","MVA 210,33",
 "Å betale 1 051,65"
 ].join("\n"),supplier:"Ahlsell Norge AS",number:"7200401",date:"2026-10-19",due:"2026-11-02",
 total:105165,group:{25:{base:"841,32",vat:"210,33"}}},
 {name:"MVA table in PDF",input:[
 "MEGAFLIS AS","FAKTURA","Fakturanr. 456789",
 "Fakturadato 19.10.2026","Forfall 01.11.2026",
 "MVA Grunnlag Avgift Totalt","25 % 1 000,00 250,00 1 250,00",
 "Fakturasum 1 250,00"
 ].join("\n"),supplier:"MEGAFLIS AS",number:"456789",date:"2026-10-19",due:"2026-11-01",
 total:125000,group:{25:{base:"1000,00",vat:"250,00"}}},
 {name:"Two rates from explicit columns",input:[
 "Leverandør: Eksempelfirma AS","Fakturanr: 2026-320",
 "Fakturadato 18.10.2026","Forfallsdato 03.11.2026",
 "MVA Grunnlag Avgift Totalt","25 % 1 000,00 250,00 1 250,00",
 "15 % 200,00 30,00 230,00","Sum inkl mva 1 480,00"
 ].join("\n"),supplier:"Eksempelfirma AS",number:"2026-320",date:"2026-10-18",due:"2026-11-03",
 total:148000,group:{25:{base:"1000,00",vat:"250,00"},15:{base:"200,00",vat:"30,00"}}},
];
for(const sample of samples){
 const p=parseNorwegianSupplierInvoice(sample.input);
 assert.equal(isLikelySupplierInvoice(sample.input),true,sample.name);
 assert.equal(p.supplierName,sample.supplier,sample.name+" supplier");
 assert.equal(p.documentNumber,sample.number,sample.name+" invoice number");
 assert.equal(p.documentDate,sample.date,sample.name+" invoice date");
 assert.equal(p.dueDate,sample.due,sample.name+" due date (never invoice date)");
 assert.equal(p.totalOre,sample.total,sample.name+" gross");
 assert.deepEqual(p.groups,sample.group,sample.name+" VAT breakdown");
 assert.deepEqual(p.warnings,[],sample.name+" warnings");
}
const decimalRate=parseNorwegianSupplierInvoice(
 "Leverandør: Grossist AS\\nFakturanr: 233301\\nFakturadato: 20.10.2026\\n"+
 "Sum eks. mva 2 000,00\\nMVA 25,00 % 500,00\\nÅ betale 2 500,00");
assert.deepEqual(decimalRate.groups[25],{base:"2000,00",vat:"500,00"},
 "Common Norwegian 25,00 % notation must work");
const wrongVat=parseNorwegianSupplierInvoice(
 "Leverandør: Test AS\nFakturanr: 100020\nFakturadato: 20.10.2026\n"+
 "MVA Grunnlag Avgift Totalt\n25 % 100,00 25,00 125,00\nÅ betale 170,00");
assert.equal(wrongVat.totalOre,17000);
assert.deepEqual(wrongVat.groups,{},"Never silently book VAT when the printed gross disagrees");
assert.match(wrongVat.warnings.join(" "),/stemmer ikke/);
const dateOnlyDue=parseNorwegianSupplierInvoice(
 "Leverandør: Test AS\nFakturanr: 100020\nForfallsdato 03.11.2026\n"+
 "MVA 25 % 25,00\nSum eks mva 100,00\nÅ betale 125,00");
assert.equal(dateOnlyDue.documentDate,"","Never substitute due date for invoice date");
assert.equal(dateOnlyDue.dueDate,"2026-11-03");
const ambiguousNumber=parseNorwegianSupplierInvoice(
 "Leverandør: Test AS\nFakturanr: 100020\nFakturanr: 100030\nFakturadato: 20.10.2026\nÅ betale 125,00");
assert.equal(ambiguousNumber.documentNumber,"","Conflicting invoice numbers must not be auto-filled");
const wrongDate=parseNorwegianSupplierInvoice(
 "Leverandør: Test AS\nFakturanr: 100020\nFakturadato: 31.02.2026\nForfallsdato 14.03.2026\nÅ betale 125,00");
assert.equal(wrongDate.documentDate,"","Impossible invoice dates must be rejected");
assert.equal(wrongDate.dueDate,"2026-03-14");
assert.equal(isLikelySupplierInvoice("JULA\nSalgskvittering\nBong 12345\n25 % MVA 25,00\nTOTAL 125,00"),false,
 "Ordinary POS receipts must retain the existing receipt parser");
const pdfSource=read("lib/vatPdfTextLayout.js").replace(/^export /gm,"");
const {vatPdfTextRows}=new Function(pdfSource+";return {vatPdfTextRows};")();
const item=(str,x,y)=>({str,transform:[1,0,0,11,x,y]});
const items=[
 item("2 500,00",410,180),
 item("Fakturanummer:",40,700),item("500245",172,700),
 item("BYGGMAKKER AS",40,765),
 item("Fakturadato:",40,670),item("24.10.2026",175,670),
 item("Forfallsdato:",40,645),item("07.11.2026",175,645),
 item("Sum eks. mva",40,245),item("2 000,00",410,245),
 item("MVA 25 %",40,210),item("500,00",410,210),
 item("Totalt inkl. mva",40,180)
];
const pdf=vatPdfTextRows(items);
assert.ok(pdf.startsWith("BYGGMAKKER AS\nFakturanummer: 500245"));
const p=parseNorwegianSupplierInvoice(pdf);
assert.equal(p.documentNumber,"500245");
assert.equal(p.documentDate,"2026-10-24");
assert.equal(p.dueDate,"2026-11-07");
assert.equal(p.totalOre,250000);
assert.deepEqual(p.groups[25],{base:"2000,00",vat:"500,00"});
assert.equal(vatPdfTextRows([]),"");
assert.match(vatPdfTextRows([{str:"Fakturanr: 222",hasEOL:true},{str:"Fakturadato: 20.10.2026"}]),/Fakturanr: 222\nFakturadato/);
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(scanner.includes("vatPdfTextRows(items)"),"Use layout-preserving PDF text");
assert.ok(scanner.includes("if(text.replace(/\\s/g,\"\").length>=45&&(!invoice||complete))"),
 "Unreadable invoice PDF should not stop at boilerplate text");
assert.ok(scanner.includes('format:"pdf-skann",extractedText:invoice?text:""'),
 "Retain extracted invoice text while running image OCR");
assert.ok(scanner.includes("const merged=chooseVatReceiptScan(searchable,invoiceOcr)"),
 "Reconcile OCR with searchable PDF data without accepting contradictions");
assert.ok(scanner.includes("isLikelySupplierInvoice(text)"));
assert.ok(scanner.includes("parseNorwegianSupplierInvoice(text)"));
assert.ok(scanner.includes("sourceParsed.documentKind==="+'"supplier-invoice"'),
 "Do not apply receipt-gross guesses to invoices");
assert.ok(scanner.includes('Forfallsdato:'),"Show due date for review");
assert.ok(scanner.includes("ikke lagret i MVA-bilaget"),"Do not imply due date is recorded");
assert.ok(scanner.includes('return {text:best.text'),"Keep OCR second-pass source");
console.log("Norske leverandørfakturaer bestått: fakturadato vs forfall, beløp/MVA, to satser, ugyldig data og PDF-kolonner.");
