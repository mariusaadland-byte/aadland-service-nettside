import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const parserSource=read("lib/vatReceiptParser.js").replace(/^export /gm,"");
const {parseNorwegianReceipt,receiptAmountOre}=new Function(parserSource+
 ";return {parseNorwegianReceipt,receiptAmountOre};")();
assert.equal(receiptAmountOre("1 250,50"),125050);
assert.equal(receiptAmountOre("1.250,50"),125050);
assert.equal(receiptAmountOre("1250,50"),125050);
assert.equal(receiptAmountOre("1,250.50"),125050);
assert.equal(receiptAmountOre("1250.50"),125050);
assert.equal(receiptAmountOre("1.250.50"),null,"Ambiguous separators must not be accepted");
assert.equal(parseNorwegianReceipt(["TESTBUTIKK","25.10.2026","Sum","125,00","MVA 25% 100,00 25,00"].join("\n")).totalOre,12500);
assert.equal(parseNorwegianReceipt(["TESTBUTIKK","25.10.2026","Sum eks mva 100,00","Mva totalt 25,00"].join("\n")).totalOre,null);
assert.equal(parseNorwegianReceipt(["TESTBUTIKK","25.10.2026","MVA 25% 1,000.00 250.00","Total 1,250.00"].join("\n")).groups[25].base,"1000,00");

assert.equal(receiptAmountOre("dårlig"),null);
const sample=[
 "MEGAFLIS BERGEN AS","Org nr 912 345 678","Kvittering nr 540018",
 "Dato 25.10.2026","MVA 25 % Grunnlag 1 000,00 Avgift 250,00",
 "Totalt inkl mva 1 250,00","Betalt med kort 1 250,00"
].join("\n");
const p=parseNorwegianReceipt(sample);
assert.equal(p.supplierName,"MEGAFLIS BERGEN AS");
assert.equal(p.documentNumber,"540018");
assert.equal(p.documentDate,"2026-10-25");
assert.equal(p.totalOre,125000);
assert.equal(p.groups[25].base,"1000,00");
assert.equal(p.groups[25].vat,"250,00");
const inferred=parseNorwegianReceipt([
 "Byggern","Kvittering nr 456789","22.10.2026","MVA 25 %: 50,00","Totalt 250,00"
].join("\n"));
assert.equal(inferred.groups[25].base,"200,00");
assert.equal(inferred.groups[25].vat,"50,00");
const ambiguous=parseNorwegianReceipt([
 "BUTIKK","Dato 23.10.2026","Total 125,00","Ingen MVA-linjer"
].join("\n"));
assert.equal(Object.keys(ambiguous.groups).length,0,"Never infer MVA from gross alone");
const incorrect=parseNorwegianReceipt([
 "Byggern","25.10.2026","MVA 25% 100,00 25,00","Total 160,00"
].join("\n"));
assert.equal(Object.keys(incorrect.groups).length,0,"Mismatched receipt sum never pre-fills VAT");
assert.ok(incorrect.warnings.some(x=>x.includes("stemmer ikke")));
const invalidDate=parseNorwegianReceipt("Butikken\nDato 31.02.2026\nMVA 25% 100,00 25,00\nSum 125,00");
assert.equal(invalidDate.documentDate,"");
const ui=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const ocr=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(ui.includes("<VatReceiptScanner"));
assert.ok(ui.includes("setReceiptFile(file)"));
assert.ok(ui.includes("attachToDocument(documentId,receiptFile)"));
assert.ok(ui.includes("retryAttachment"));
assert.ok(ui.includes("setScanBusy"));
assert.ok(ocr.includes('capture="environment"'));
assert.ok(ocr.includes('application/pdf'));
assert.ok(ocr.includes("createWorker"));
assert.ok(ocr.includes("parseNorwegianReceipt"));
assert.ok(ocr.includes("onBusyChange?.(false)"));
assert.ok(ocr.includes('image/heic')&&ocr.includes('image/heif'));
assert.ok(ocr.includes('source.size>MAX_SOURCE_SIZE'));
assert.ok(ocr.includes('source.size<=MAX_SIZE'));
assert.ok(ocr.includes('converted:true'));
assert.ok(ocr.includes('toBlob(resolve,"image/jpeg"'));
assert.ok(ocr.includes('URL.revokeObjectURL(url)'));
assert.ok(ocr.includes('Behold originalbildet'));
assert.ok(ui.includes('receiptIsCopy'));
assert.ok(ui.includes('JPEG-kopi'));
console.log("MVA-kvitteringstest bestått: mobilkamera, PDF, norsk OCR, MVA-kontroll og sikker vedleggskobling.");
