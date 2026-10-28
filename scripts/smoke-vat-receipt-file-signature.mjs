import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const raw=read("lib/vatReceiptAttachmentReadiness.js").replace(/^export /gm,"");
const {validateVatReceiptAttachmentBytes,vatReceiptAttachmentIssue}=
 new Function(raw+";return {validateVatReceiptAttachmentBytes,vatReceiptAttachmentIssue};")();
const uploaded=(bytes,type,name)=>({
 size:bytes.length,type,name,
 slice(start,end){return {arrayBuffer:async()=>Uint8Array.from(bytes.slice(start,end)).buffer}}
});
const pad=(start,len=32)=>[...start,...Array(Math.max(0,len-start.length)).fill(0)];
const validFiles=[
 uploaded(pad([255,216,255,224]),"image/jpeg","photo.jpg"),
 uploaded(pad([255,216,255,224]),"image/jpeg","photo.jpeg"),
 uploaded(pad([137,80,78,71,13,10,26,10]),"image/png","photo.png"),
 uploaded(pad([37,80,68,70,45,49,46,55]),"application/pdf","receipt.pdf"),
 uploaded(pad([82,73,70,70,0,0,0,0,87,69,66,80]),"image/webp","photo.webp")
];
for(const file of validFiles)
 assert.equal(await validateVatReceiptAttachmentBytes(file,"Aadland MVA – privat originalvedlegg"),"",
  "Valid "+file.type+" should pass local preflight");
for(const file of [
 uploaded(pad([37,80,68,70,45]),"image/jpeg","photo.jpg"),
 uploaded(pad([255,216,255]),"application/pdf","receipt.pdf"),
 uploaded(pad([82,73,70,70]),"image/webp","photo.webp"),
 uploaded(pad([137,80,78,71,0,0,0,0]),"image/png","photo.png")
])assert.match(await validateVatReceiptAttachmentBytes(file,"Aadland MVA – privat originalvedlegg"),
 /innhold.*filtypen/,"Fake files must be rejected before a purchase row exists");
assert.match(await validateVatReceiptAttachmentBytes({
 type:"image/jpeg",name:"broken.jpg",size:1024,
 slice(){return {arrayBuffer:async()=>{throw Error("cannot read")}}}
},""),/Kunne ikke kontrollere/);
assert.equal(await validateVatReceiptAttachmentBytes(null,"Systima bilag 104"),"");
assert.match(vatReceiptAttachmentIssue({size:4194305,type:"image/jpeg",name:"big.jpg"},""),/4 MB/);
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const submit=form.slice(form.indexOf(" const submit=async e=>{"),form.indexOf(" const voidDoc=async"));
assert.ok(submit.includes("if(submittingRef.current||busy)return"),
 "Second tap must not launch a duplicate request");
assert.ok(submit.includes("submittingRef.current=true"));
assert.ok(submit.includes("finally{submittingRef.current=false;setBusy(false);}"));
assert.ok(submit.indexOf("submittingRef.current=true")<submit.indexOf("await validateVatReceiptAttachmentBytes"),
 "Lock synchronously before async file check");
assert.ok(submit.indexOf("await validateVatReceiptAttachmentBytes")<
 submit.indexOf('fetch("/api/admin/invoices/vat-purchases"'),
 "Reject wrong file bytes before database row creation");
assert.ok(submit.indexOf("await validateVatReceiptAttachmentBytes")<submit.indexOf("window.confirm(question)"),
 "Do not ask for booking approval when the file is invalid");
console.log("Bilagsfilsignatur bestått: ekte JPEG/PNG/WebP/PDF, avviste falske filer, sjekk før databasen og dobbelttrykk-sperre.");
