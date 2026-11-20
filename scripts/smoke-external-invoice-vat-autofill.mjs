import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const amountSrc=read("lib/externalInvoiceRegister.js").replace(/^export /gm,"");
const {parseExternalInvoiceOre}=new Function(amountSrc+
 ";return {parseExternalInvoiceOre};")();
const supplierSrc=read("lib/vatSupplierInvoiceParser.js").replace(/^export /gm,"");
const {parseNorwegianSupplierInvoice}=new Function(supplierSrc+
 ";return {parseNorwegianSupplierInvoice};")();
const suggestionSrc=read("lib/externalInvoiceAutofill.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {suggestExternalInvoiceVat}=new Function(
 "parseNorwegianSupplierInvoice","parseExternalInvoiceOre",suggestionSrc+
 ";return {suggestExternalInvoiceVat};")(parseNorwegianSupplierInvoice,parseExternalInvoiceOre);
const base={invoice_number:"EXT-11",amount_ore:125000};
const invoice=[
 "FAKTURA","Fakturanummer EXT-11","Fakturadato 20.11.2026",
 "Forfallsdato 04.12.2026","SUM EKS. MVA 1 000,00",
 "MVA 25% 250,00","Sum inkl. mva 1 250,00"
].join("\n");
const detected=suggestExternalInvoiceVat(invoice,base);
assert.equal(detected.ok,true);
assert.equal(detected.source,"original_invoice");
assert.equal(detected.vatRate,25);
assert.equal(detected.baseOre,100000);
assert.equal(detected.vatOre,25000);
assert.equal(detected.baseAmount,"1000,00");
assert.equal(detected.grossOre,125000);
assert.equal(suggestExternalInvoiceVat(invoice,{...base,amount_ore:130000}).ok,false,
 "Never accept original whose gross disagrees with archived amount");
assert.equal(suggestExternalInvoiceVat(invoice,{...base,invoice_number:"DIFFERENT"}).ok,false,
 "Must not silently fill amount from a wrong invoice");
const noVat=[
 "FAKTURA","Fakturanummer EXT-11",
 "Fakturadato 20.11.2026","Å betale 1 250,00"
].join("\n");
assert.equal(suggestExternalInvoiceVat(noVat,base).ok,false,
 "A divisible total does NOT prove 25 percent VAT");
const formatted=[
 "Faktura","Fakturanr EXT-11",
 "MVA % Grunnlag Avgift","25% 1 000,00 250,00","Å betale 1 250,00"
].join("\n");
assert.equal(suggestExternalInvoiceVat(formatted,base).baseOre,100000);
const mixed=[
 "Faktura","Fakturanummer EXT-11",
 "MVA % Grunnlag Avgift","25% 800,00 200,00",
 "12% 223,21 26,79","Å betale 1 250,00"
].join("\n");
assert.equal(suggestExternalInvoiceVat(mixed,base).ok,false,
 "Multiple VAT rates must not be flattened into one Tripletex line");
const reader=read("lib/externalInvoiceDocumentReader.js");
assert.ok(reader.includes('fetch("/api/admin/invoices/external-register?download=1&id="'),
 "Read the existing private original, not a frontend amount or arbitrary link");
assert.ok(reader.includes("vatPdfTextRows(content.items)"));
assert.ok(reader.includes("suggestExternalInvoiceVat(pieces.join("));
assert.ok(reader.includes("createVatReceiptReader(tesseract)"));
assert.ok(reader.includes('PDFJS_URL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/'));
assert.ok(reader.includes("return {ok:false"));
assert.ok(reader.includes("Math.min(pdf.numPages,12)"));
assert.ok(reader.includes("signal"));
assert.ok(!reader.includes("fetch(TESSERACT_URL,blob"),"Never upload PDF to OCR provider");
const ui=read("app/admin/faktura/eksterne/ExternalInvoiceTripletexPanel.js");
for(const marker of [
 "readExternalInvoiceAmountFromOriginal","readOriginalAmount",
 "manualAmountChange","userChanged.current","readOriginalAmount({manualRetry:true})",
 "Hentet fra {readerSource}","importAmountsMatch",
 "Beløp ekskl. MVA og avgift er hentet fra originalfakturaen",
 "Beregnet fra den registrerte totalsummen, ikke lest fra PDF-en"
])assert.ok(ui.includes(marker),"Missing UI "+marker);
assert.ok(ui.includes('useState(""),[base,setBase]=useState("")'),
 "Do not preset 25% tax when original VAT rate is unknown");
assert.ok(ui.includes('customerStatus!=="linked_to_tripletex"'),
 "Do not weaken customer and Tripletex import checks");
assert.ok(ui.includes("setConfirmed(false)"),
 "Changing auto-filled values must require a new manual review");
const importEngine=read("lib/externalInvoiceTripletex.js");
assert.ok(importEngine.includes("baseOre+vatOre!==total"),
 "Server must independently reconcile base and VAT with gross");
assert.ok(importEngine.includes("vatConfirmed!==true"),
 "No VAT transfer without explicit reviewer approval");
console.log("Ekstern faktura MVA-autoutfylling bestått: PDF-tekst, OCR-fallback, gross/netto/MVA, fakturanummer, blandede satser, manuell bekreftelse og ingen automatisk bokføring.");
