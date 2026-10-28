import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const parseCode=read("lib/vatReceiptParser.js").replace(/^export /gm,"");
const {parseNorwegianReceipt}=new Function(parseCode+";return {parseNorwegianReceipt};")();
const expectDate=(text,wanted)=>{
 const got=parseNorwegianReceipt(text);
 assert.equal(got.documentDate,wanted,text);
 if(!wanted)assert.match(got.warnings.join(" "),/dato/i);
};
expectDate("MEGAFLIS BERGEN AS\nKvittering nr 120\nDato 25.10.2026\nForfall 31.10.2026","2026-10-25");
expectDate("REMA 1000\nDato:\n28.10.2026\nTotal 125,00","2026-10-28");
expectDate("BUTIKK\nUtskriftsdato 28.10.2026\nForfallsdato 30.10.2026","");
expectDate("BUTIKK\n23.10.2026\n24.10.2026","");
expectDate("BUTIKK\nKjøpsdato 22.10.2026\nDato 28.10.2026","2026-10-22");
expectDate("BUTIKK\nDato 31.02.2026","");
expectDate("BUTIKK\n25.10.2026\nSum 125,00","2026-10-25");
expectDate("BUTIKK\nIngen dato\nTotal 125,00","");
const ambiguous=parseNorwegianReceipt("BUTIKK\nDato 24.10.2026\nDato 25.10.2026\nTotal 125,00");
assert.equal(ambiguous.documentDate,"");
assert.match(ambiguous.warnings.join(" "),/flere mulige/);

const imageSource=read("lib/vatOcrImage.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {vatOcrGeometry,vatOcrSegments}=new Function("detectReceiptBounds",
 imageSource+";return {vatOcrGeometry,vatOcrSegments};")(()=>null);
const standard=vatOcrGeometry(3024,4032);
assert.deepEqual(vatOcrSegments(standard),[],"Ordinary camera photos remain one OCR image");
const tall=vatOcrGeometry(1800,6800);
const pages=vatOcrSegments(tall);
assert.ok(pages.length>=2&&pages.length<=3);
assert.equal(pages[0].sy,tall.sy);
assert.equal(pages.at(-1).sy+pages.at(-1).sh,tall.sy+tall.sh);
assert.ok(pages.every(p=>p.width*p.height<=2605000&&p.width<=2200&&p.height<=2200));
assert.ok(pages.slice(1).every((p,i)=>p.sy<pages[i].sy+pages[i].sh),
 "Neighboring OCR crops overlap so rows are not cut in two");
const cropped=vatOcrGeometry(2400,6800,{x:.20,y:.05,w:.58,h:.90});
const cropPages=vatOcrSegments(cropped);
assert.ok(cropPages.length>=2);
assert.ok(cropPages.every(p=>p.sx===cropped.sx&&p.sw===cropped.sw));
assert.ok(imageSource.includes("return sections;"));
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(scanner.includes(")).flat()"),"Pass every sharp OCR section to Tesseract");
assert.ok(scanner.includes("confidence<55&&parsed.documentDate"),"Do not fill dates from low-confidence scans");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
assert.ok(form.includes('documentDate:"",kind:"purchase"'),"Do not pretend today was read from the receipt");
assert.ok(form.includes("previousOcr.current"),"Forget old OCR suggestions on the next photo");
assert.ok(form.includes('documentDate:"",originalDocumentNumber:""'),
 "Reset document date after saving the previous receipt");
console.log("OCR-regresjon bestått: ingen oppdiktet dato, konflikter varsles, lange kvitteringer leses i skarpe deler.");
