import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const scanner=readFileSync("app/admin/faktura/mva/VatReceiptScanner.js","utf8");
const form=readFileSync("app/admin/faktura/mva/InputVatRegisterClient.js","utf8");
assert.ok(scanner.includes("Importer fra skriver/skanner på PC"));
assert.ok(scanner.includes("HP DeskJet 4510"));
assert.ok(scanner.includes("Velg skannet PDF fra PC"));
assert.ok(scanner.includes('accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"'));
assert.ok(scanner.includes('disabled={disabled||busy||Boolean(cropJob)} onChange={choose}'),
 "The printer file picker must enter the same validated OCR flow as mobile scans");
assert.ok(scanner.includes('if(source)void chooseSource(source);'),
 "Printer scans must use the standard receipt flow");
assert.ok(scanner.includes('await recognizeSelected(file,{converted:prepared.converted,originalName:source.name});'),
 "OCR must read the chosen PDF or image");
assert.ok(scanner.includes('Maks 4 MB per PDF'));
assert.ok(scanner.includes('Nettleseren kan ikke starte den fysiske skanneren direkte'),
 "The site must not imply it can initiate hardware scans");
assert.ok(form.includes("attachToDocument(documentId,receiptFile)"),
 "Selected documents stay behind explicit registration and attachment controls");
assert.ok(form.includes("documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false"),
 "Document recognition must not bypass user verification");
console.log("Skriverskanner: dedikert PDF-import, eksisterende OCR, vedleggs- og MVA-kontroller bevart.");
