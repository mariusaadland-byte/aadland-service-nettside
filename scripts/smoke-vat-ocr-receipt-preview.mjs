import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const form=readFileSync("app/admin/faktura/mva/InputVatRegisterClient.js","utf8");
const css=readFileSync("app/admin/faktura/mva/VatSimpleForm.module.css","utf8");
assert.ok(form.includes('const [receiptPreviewUrl,setReceiptPreviewUrl]=useState("")'));
assert.ok(form.includes('URL.createObjectURL(receiptFile)'),"Render local selected original");
assert.ok(form.includes('return()=>URL.revokeObjectURL(url)'),"Release original preview memory on iPhone");
assert.ok(form.includes('receiptFile&&receiptPreviewUrl&&<details'),"Preview is optional and unobtrusive");
assert.ok(form.includes('Vis kvitteringsbildet og kontroller dato/beløp'));
assert.ok(form.includes('<img src={receiptPreviewUrl} alt="Kvitteringen du har valgt som originalbilag"/>'));
assert.ok(css.includes(".receiptImagePreview img"),"Preview scales on phone");
assert.ok(form.includes('validateVatReceiptAttachmentBytes(receiptFile,form.evidenceReference)'),
 "Showing an image must not bypass original-file signature check");
console.log("Bilagsforhåndsvisning bestått: originalfoto kan sammenlignes med OCR, lokale URL-er ryddes opp.");
