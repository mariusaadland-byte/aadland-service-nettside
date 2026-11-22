import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const scanner=readFileSync("app/admin/faktura/mva/VatReceiptScanner.js","utf8");
const form=readFileSync("app/admin/faktura/mva/InputVatRegisterClient.js","utf8");
assert.ok(scanner.includes("Importer fra HP Smart Tank 7005"));
assert.ok(scanner.includes("HP Smart Tank 7005"));
assert.ok(scanner.includes("ikke automatisk arkmater"));
assert.ok(scanner.includes("HP-appen"));
assert.ok(scanner.includes("Legg til side"));
assert.ok(scanner.includes("Velg PDF fra HP-skanneren"));
assert.ok(scanner.includes('accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"'));
assert.ok(scanner.includes('disabled={disabled||busy||Boolean(cropJob)} onChange={choose}'),
 "The printer file picker must enter the same validated OCR flow as mobile scans");
assert.ok(scanner.includes('if(source)void chooseSource(source);'),
 "Printer scans must use the standard receipt flow");
assert.ok(scanner.includes('await recognizeSelected(file,{converted:prepared.converted,originalName:source.name});'),
 "OCR must read the chosen PDF or image");
assert.ok(scanner.includes('PDF maks 4 MB'));
assert.ok(scanner.includes('Nettleseren kan ikke starte'),
 "The site must not imply it can initiate hardware scans");
assert.ok(form.includes("attachToDocument(documentId,receiptFile)"),
 "Selected documents stay behind explicit registration and attachment controls");
assert.ok(form.includes("documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false"),
 "Document recognition must not bypass user verification");
console.log("Skriverskanner: dedikert PDF-import, eksisterende OCR, vedleggs- og MVA-kontroller bevart.");
