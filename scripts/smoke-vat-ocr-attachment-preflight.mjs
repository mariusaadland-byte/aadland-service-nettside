import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const raw=read("lib/vatReceiptAttachmentReadiness.js").replace(/^export /gm,"");
const {vatUploadMaxBytes,vatReceiptAttachmentIssue,removeVatReceiptAttachmentReference}=
 new Function(raw+";return {vatUploadMaxBytes,vatReceiptAttachmentIssue,removeVatReceiptAttachmentReference};")();
assert.equal(vatUploadMaxBytes,4*1024*1024);
const file=(size,type="image/jpeg",name="kvittering.jpg")=>({size,type,name});
assert.equal(vatReceiptAttachmentIssue(file(2*1024*1024),"Aadland MVA – privat originalvedlegg"),"");
assert.equal(vatReceiptAttachmentIssue(file(vatUploadMaxBytes),"Aadland MVA – privat originalvedlegg"),"");
assert.match(vatReceiptAttachmentIssue(file(vatUploadMaxBytes+1),"Aadland MVA – privat originalvedlegg"),/4 MB/);
assert.match(vatReceiptAttachmentIssue(file(0),"Noe"),/4 MB/);
assert.match(vatReceiptAttachmentIssue(file(1000,"image/heic","foto.heic"),"Noe"),/JPG/);
assert.match(vatReceiptAttachmentIssue(file(1000,"image/png","kvittering.jpg"),"Noe"),/filendelse/);
assert.equal(vatReceiptAttachmentIssue(file(1000,"image/png","kvittering.png"),"Noe"),"");
assert.equal(vatReceiptAttachmentIssue(file(1000,"application/pdf","kvittering.pdf"),"Noe"),"");
assert.equal(vatReceiptAttachmentIssue(null,"Systima bilag 104"),"","External original can be recorded manually");
assert.match(vatReceiptAttachmentIssue(null,"Aadland MVA – privat originalvedlegg"),/fjernet/);
assert.match(vatReceiptAttachmentIssue(null,"Aadland MVA – vedlagt JPEG-kopi, original beholdes eksternt"),/fjernet/);
const original={supplierName:"Jula",evidenceReference:"Aadland MVA – privat originalvedlegg",
 documentConfirmed:true,deductionConfirmed:true,bankConditionConfirmed:true,documentDate:"2026-10-19"};
const removed=removeVatReceiptAttachmentReference(original);
assert.equal(removed.evidenceReference,"");
assert.equal(removed.supplierName,"Jula");
assert.equal(removed.documentDate,"2026-10-19");
for(const k of ["documentConfirmed","deductionConfirmed","bankConditionConfirmed"])assert.equal(removed[k],false);
assert.equal(removeVatReceiptAttachmentReference({...original,evidenceReference:"Systima bilag 104"}).evidenceReference,"Systima bilag 104");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
assert.ok(form.includes("vatReceiptAttachmentIssue(receiptFile,form.evidenceReference)"));
assert.ok(form.includes("if(receiptUploadIssue){setError(receiptUploadIssue);return;}"),
 "Do not create a database row before file preflight passes");
assert.ok(form.includes("Boolean(receiptUploadIssue)"),
 "Disable register button if attachment cannot be uploaded");
assert.ok(form.includes("setForm(x=>removeVatReceiptAttachmentReference(x))"),
 "Removing a picture must also remove the fake reference to its original");
assert.ok(form.includes("setReceiptSession(n=>n+1)"),
 "Do not keep an OCR image available after removing its bookkeeping attachment");
assert.ok(form.includes('attachToDocument(documentId,receiptFile)'));
console.log("Vedleggsforhåndskontroll bestått: ingen falsk originalreferanse, max 4 MB, filformat og manuelle eksterne referanser.");
