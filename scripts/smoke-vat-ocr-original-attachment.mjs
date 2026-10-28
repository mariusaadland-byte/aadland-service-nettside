import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const cropper=read("app/admin/faktura/mva/VatReceiptCropper.js");

assert.ok(scanner.includes("if(!options.preserveAttachment)onSelected(file,meta)"),
 "Only a new selected original can replace the accounting attachment");
assert.ok(scanner.includes('await recognizeSelected(file,{converted:prepared.converted,originalName:source.name});'),
 "Original is attached on initial photo");
assert.ok(scanner.includes('await recognizeSelected(croppedFile,{converted:copied,originalName:original.originalName},{preserveAttachment:true});'),
 "Manual crop must not become a replacement accounting attachment");
assert.ok(scanner.includes('{noAutoCrop,preserveAttachment:true}'),
 "Retry of full image or corrected image must not change the original attachment");
assert.ok(scanner.includes("Originalfotoet beholdes som bilagsvedlegg"),
 "Explain that cropped images are for reading only");
assert.ok(cropper.includes("await onApply(preview,{cropped:true})"),
 "The cropper gives a temporary copy to the OCR layer");

assert.ok(form.includes("setReceiptFile(file||null)"),
 "Initial file chosen for bookkeeping is stored separately from temporary OCR copy");
assert.ok(form.includes('payload.append("file",file)'),
 "Private attachment API receives the selected bookkeeping document");
assert.ok(form.includes("attachToDocument(documentId,receiptFile)"),
 "Saved document must get the retained original, not the OCR crop");
assert.ok(form.includes("attachmentSaved=!receiptFile"),"Do not claim attached until upload completes");
assert.ok(form.includes("disabled={busy||Boolean(attachmentIssue)}"),
 "Block new receipt scans while a previous original could not be uploaded");
assert.ok(form.includes('if(attachmentIssue){'),
 "Refuse another register request while a previously saved original is missing");
assert.ok(form.includes('disabled={busy||scanBusy||Boolean(attachmentIssue)'),
 "Disable the final register button while attachment retry is unresolved");
assert.ok(form.includes("documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));"),
 "Require fresh confirmation after a new OCR result");
console.log("Originalkvittering bestått: beskjæring og ny OCR endrer ikke valgt bilagsvedlegg, kontroll kreves på nytt.");
