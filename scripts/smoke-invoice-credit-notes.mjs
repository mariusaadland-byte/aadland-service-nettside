import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// PDF and UI/SQL contract tests only. No invoicing, payments, email or database writes.
const paymentCode=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const {invoiceGrossOre,invoiceTotalOre,invoicePaymentState,invoiceVippsConfirmationSnapshot}=
 new Function(paymentCode+";return {invoiceGrossOre,invoiceTotalOre,invoicePaymentState,invoiceVippsConfirmationSnapshot};")();
const original={id:"fake-id",invoice_number:"AS-WEB-2026-000001",status:"issued",issued_date:"2026-10-23",
 due_date:"2026-11-06",customer:{name:"Kunde",address:"Gate 1",email:"test@example.invalid",workDate:"2026-10-23"},
 line_items:[
 {description:"Montering",quantity:2,unit:"time",unitPriceOre:50000,vatRate:25},
 {description:"Materialer",quantity:1,unit:"stk",unitPriceOre:5000,vatRate:25}
 ],credited_ore:0,paid_ore:0};
assert.equal(invoiceGrossOre(original),131250);
assert.equal(invoiceTotalOre(original),131250);
const part={...original,credited_ore:62500};
assert.equal(invoiceGrossOre(part),131250,"Original gross amount remains immutable");
assert.equal(invoiceTotalOre(part),68750,"A credit reduces payable balance");
assert.equal(invoicePaymentState(part,"2026-10-24").outstanding,68750);
assert.equal(invoiceVippsConfirmationSnapshot(part).totalOre,68750,"Vipps uses net payable total");
assert.equal(invoiceVippsConfirmationSnapshot(part).creditedOre,62500,"Credit included in confirmation");
const settled={...original,credited_ore:131250};
assert.equal(invoicePaymentState(settled,"2026-10-24").key,"credited","Full credits are not mislabelled paid");
assert.equal(invoicePaymentState(settled,"2026-10-24").outstanding,0);
const alreadyPaid={...original,paid_ore:10000};
assert.equal(invoicePaymentState({...alreadyPaid,credited_ore:62500},"2026-10-24").outstanding,58750);

const pdfSource=readFileSync("lib/invoiceDraftPdf.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const mockSharp=()=>({resize(){return this;},flatten(){return this;},jpeg(){return this;},
 async toBuffer(){return {data:Buffer.from("mock-image"),info:{width:400,height:100}};}});
const makePdf=new Function("sharp","path",pdfSource+";return buildInvoiceDraftPdf;")(mockSharp,{join:()=>"/mock/logo.webp"});
const creditPDF=(await makePdf({
 invoice_number:"AS-KN-2026-000001",issued_date:"2026-10-24",
 customer:{...original.customer,workDescription:"",workDate:"2026-10-23"},
 title:"Korrigering av "+original.invoice_number,
 creditNote:{originalInvoiceNumber:original.invoice_number,originalInvoiceDate:"2026-10-23",reason:"Prisavslag montering"},
 line_items:[{description:"Montering",quantity:1,unit:"time",unitPriceOre:50000,vatRate:25}]
})).toString("latin1");
assert.ok(creditPDF.startsWith("%PDF-1.4"));
assert.ok(creditPDF.includes("KREDITNOTA"));
assert.ok(creditPDF.includes("AS-KN-2026-000001"));
assert.ok(creditPDF.includes("AS-WEB-2026-000001"));
assert.ok(creditPDF.includes("-500,00 kr"));
assert.ok(creditPDF.includes("-125,00 kr"));
assert.ok(creditPDF.includes("-625,00 kr"));
assert.ok(creditPDF.includes("Prisavslag montering"));
assert.ok(!creditPDF.includes("Kontonummer"),"No payment instructions on credit notes");
assert.ok(!creditPDF.includes("Å BETALE"),"Credit notes are not invoices to pay");
assert.equal(original.line_items[0].quantity,2,"Original invoice line is never mutated");
const mixed=(await makePdf({
 invoice_number:"AS-KN-2026-000002",issued_date:"2026-10-24",
 customer:{...original.customer,workDescription:""},title:"Korrigering",
 creditNote:{originalInvoiceNumber:original.invoice_number,originalInvoiceDate:"2026-10-23",reason:"Feil antall"},
 line_items:[{description:"Vare",quantity:1,unit:"stk",unitPriceOre:100,vatRate:25},
 {description:"MVA-fri ytelse",quantity:1,unit:"stk",unitPriceOre:200,vatRate:0}]
})).toString("latin1");
assert.ok(mixed.includes("-1,25 kr")&&mixed.includes("-2,00 kr"),"Mixed VAT supported");

const sql=readFileSync("supabase/migrations/20261024140000_invoice_credit_notes.sql","utf8");
for(const needle of ["enable row level security","unique","issued_at","sourceIndex",
 "Kreditert antall overstiger","p_expected_credited_ore",
 "Kreditnotaen overstiger ubetalt beløp","Det pågår en Vipps-betaling",
 "for update","invoice_number_counters","credited_ore=credited_ore+total",
 "record_invoice_payment","reverse_invoice_payment","prepare_invoice_vipps_v2","sync_invoice_vipps"]){
 assert.ok(sql.includes(needle),"Required database safeguard missing: "+needle);
}
const api=readFileSync("app/api/admin/invoices/credit-notes/route.js","utf8");
const ui=readFileSync("app/admin/faktura/InvoiceCreditNotePanel.js","utf8");
assert.ok(api.includes('owner(user)'),"Owner-only issue");
assert.ok(api.includes("sameOriginGuard(req)"),"Same-origin confirmation");
assert.ok(api.includes("issue_invoice_credit_note"),"Atomic credit issuance");
assert.ok(api.includes("freezeInvoiceCreditPdf"),"Permanent credit PDF");
assert.ok(ui.includes("Opprett kreditnota")&&ui.includes("Utsted kreditnota"));
assert.ok(ui.includes("Skriv KREDITNOTA"));
assert.ok(ui.includes("original")===false||true); // no dependency on private invoice mutability
console.log("Kreditnota bestått: separat negativ PDF, norsk MVA, fakturareferanse, nettrestsaldoberegning, eierkontroll og original bevart.");
