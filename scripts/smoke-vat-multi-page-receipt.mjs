import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const library=read("lib/vatMultiPageReceipt.js");
const {buildVatReceiptPdf,VAT_MULTI_PAGE_LIMIT,isVatMultiPageImage}=
 await import("data:text/javascript;base64,"+Buffer.from(library).toString("base64"));
const photo=Uint8Array.from(Buffer.from(
 "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALMAD//Z",
 "base64"));
const page={bytes:photo,width:2,height:2};
const pdf=buildVatReceiptPdf([page,page,page]);
const bytes=Buffer.from(pdf);
const text=bytes.toString("latin1");
assert.ok(bytes.subarray(0,5).equals(Buffer.from("%PDF-")));
assert.ok(text.includes("/Count 3"),"Three pages must stay in one PDF");
assert.equal((text.match(/\/Subtype \/Image/g)||[]).length,3);
assert.equal((text.match(/\/Type \/Page \/Parent/g)||[]).length,3);
assert.ok(text.includes("%%EOF"),"Completed PDF trailer required");
const xrefOffset=Number(text.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
assert.ok(Number.isSafeInteger(xrefOffset));
assert.equal(text.slice(xrefOffset,xrefOffset+4),"xref");
assert.ok(bytes.length<4*1024*1024);
assert.throws(()=>buildVatReceiptPdf([]));
assert.throws(()=>buildVatReceiptPdf(Array(9).fill(page)));
assert.equal(VAT_MULTI_PAGE_LIMIT,8);
assert.equal(isVatMultiPageImage({name:"bilde.jpg",type:"image/jpeg",size:1024}),true);
assert.equal(isVatMultiPageImage({name:"kvittering.pdf",type:"application/pdf",size:1024}),false);
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const readiness=read("lib/vatReceiptAttachmentReadiness.js");
for(const part of [
 "createVatMultiPageReceipt(multiPages,setProgress)",
 "{ocrImages}",
 "setMultiMode(false);setMultiPages([])",
 "Fullfør og les alle sidene",
 "onSelected(null);",
 "if(file.type===\"application/pdf\"&&!options.ocrImages)"
])assert.ok(scanner.includes(part),"Missing scanner support: "+part);
assert.ok(form.includes("vedlagt PDF-kopi"));
assert.ok(readiness.includes("vedlagt PDF-kopi"));
assert.ok(scanner.includes("await recognizeSelected(file,{converted:prepared.converted,originalName:source.name});"),
 "Ordinary single-page scanner must keep working unchanged");
console.log("Flersidig kvittering: PDF-struktur, alle sider, vedleggskontroll og enkeltskanning OK.");
