import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const scan=read("app/admin/faktura/mva/VatReceiptScanner.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");
for(const [label,token] of [
 ["Form steps","2. Opplysninger"],["MVA section","3. Beløp og MVA"],
 ["Business purpose","4. Hva gjelder kjøpet?"],["Confirmation","5. Kontroller og lagre"],
 ["Optional MVA rates","showMoreRates||otherRateHasValue"],
 ["Default VAT rate","[25]"],["OCR extra rates","otherRateHasValue"],
 ["Registration confirmation","documentConfirmed"],["Deduction confirmation","deductionConfirmed"],
 ["Bank threshold","bankConditionConfirmed"],["OCR mismatch acknowledgement","ocrMismatchChecked"],
 ["Document period","vatDocumentPeriod(form.documentDate)"],
 ["Receipt attachment","attachToDocument(documentId,receiptFile)"],
 ["Upload recovery","retryAttachment"],["Vat original file","<VatOriginalAttachment"]
])assert.ok(form.includes(token),"Missing "+label);
assert.ok(form.includes('form.kind==="credit"'),"Credit note flow must remain");
assert.ok(form.includes('value={form.deductionPercent}'),"Deduction percent editable");
assert.ok(form.includes('value={form.businessPurpose}'),"Custom business purpose editable");
assert.ok(form.includes("purposeChoices.map"),"Business purpose presets in select");
assert.ok(!form.includes("Hurtigvalg – hva gjelder kjøpet?"),"Remove row of dark shortcut buttons");
assert.ok(!form.includes('style={{border:"1px solid #d8cdbb"'),"Remove tall VAT boxes");
assert.ok(scan.includes('capture="environment"')&&scan.includes('accept=".pdf,.jpg'),"Keep camera and files");
assert.ok(scan.includes("<VatReceiptCropper")&&scan.includes("await recognizeSelected(croppedFile"),"Keep cropping/OCR");
assert.ok(scan.includes("styles.uploadActions")&&scan.includes("styles.scanHelp"),"Use simple two-action scanner");
assert.ok(!scan.includes('1. Ta bilde eller velg kvittering'),"Remove long instructions");
assert.ok(css.includes("color-scheme:light"),"Light controls on iOS");
assert.ok(css.includes("background:#fff!important"),"Inputs must not be black on mobile");
assert.ok(css.includes("grid-template-columns:repeat(2,minmax(0,1fr))"),"Compact two-column amount fields");
assert.ok(css.includes("@media(max-width:680px)"),"Mobile stacking");
assert.ok(css.includes("min-height:44px"),"Finger-sized inputs");
console.log("Enklere MVA-registrering bestått: lys mobilstil, kvitteringsknapper, valgfri sats, MVA-fradrag, OCR og alle regnskapskontroller beholdt.");
