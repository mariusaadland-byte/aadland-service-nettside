import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(file,"utf8");
const workerSource=read("lib/vatReceiptRecognition.js").replace(/^export /gm,"");
const recognizeVatReceiptImages=new Function(workerSource+";return recognizeVatReceiptImages;")();
const parserCode=read("lib/vatReceiptParser.js").replace(/^export /gm,"");
const parseNorwegianReceipt=new Function(parserCode+";return parseNorwegianReceipt;")();
const receiptText=[
 "MEGAFLIS BERGEN AS",
 "Org nr 912 345 678",
 "Kvittering nr 540018",
 "Dato 25.10.2026",
 "MVA 25 % Grunnlag 1 000,00 Avgift 250,00",
 "Totalt inkl mva 1 250,00",
 "Betalt med kort 1 250,00"
].join("\n");
let calls=[],terminated=0,recognitions=0;
function harness({failNor=false,failEnglish=false,noText=false}={}){
 return {
  createWorker:async (langs,oem,options)=>{
   calls.push({langs,oem,options:!!options.logger});
   if(Array.isArray(langs)&&failNor)throw Error("Norwegian language model cannot be loaded");
   if(langs==="eng"&&failEnglish)throw Error("CDN offline");
   return {
    recognize:async img=>{
     assert.equal(img.type,"image/jpeg");
     recognitions++;
     return {data:{text:noText?"":receiptText}};
    },
    terminate:async()=>{terminated++;}
   };
  }
 };
}
const jpeg={type:"image/jpeg"};
let statuses=[];
let result=await recognizeVatReceiptImages(harness(),[jpeg],msg=>statuses.push(msg));
let parsed=parseNorwegianReceipt(result);
assert.equal(parsed.supplierName,"MEGAFLIS BERGEN AS");
assert.equal(parsed.documentNumber,"540018");
assert.equal(parsed.documentDate,"2026-10-25");
assert.equal(parsed.totalOre,125000);
assert.equal(parsed.groups[25].base,"1000,00");
assert.equal(parsed.groups[25].vat,"250,00");
assert.deepEqual(calls[0].langs,["nor","eng"],"Use Tesseract documented multi-language array");
assert.equal(calls[0].oem,1);
assert.equal(terminated,1);
assert.equal(recognitions,1);
assert.ok(statuses.some(x=>x.includes("Leser bilde")));

calls=[];statuses=[];
result=await recognizeVatReceiptImages(harness({failNor:true}),[jpeg],msg=>statuses.push(msg));
assert.equal(parseNorwegianReceipt(result).supplierName,"MEGAFLIS BERGEN AS");
assert.deepEqual(calls.map(x=>x.langs),[["nor","eng"],"eng"]);
assert.ok(statuses.some(x=>x.includes("Prøver engelsk")));
assert.equal(terminated,2);
calls=[];
await assert.rejects(recognizeVatReceiptImages(harness({failNor:true,failEnglish:true}),[jpeg]),
 /kunne ikke startes/);
assert.equal(terminated,2,"No worker to terminate after failed startup");
calls=[];
result=await recognizeVatReceiptImages(harness({noText:true}),[jpeg]);
parsed=parseNorwegianReceipt(result);
assert.equal(parsed.supplierName,"");
assert.equal(Object.keys(parsed.groups).length,0);
assert.ok(parsed.warnings.some(x=>/lite tekst/.test(x)));
assert.equal(terminated,3);
await assert.rejects(recognizeVatReceiptImages(harness(),[]),/Ingen bilder/);

const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(scanner.includes("await recognizeSelected(file,{converted:prepared.converted"),
 "Automatically run OCR as soon as a photo has been prepared");
assert.ok(scanner.includes('setImageForCrop({file,originalName:source.name'),
 "Keep optional crop retry for unclear receipt");
assert.ok(scanner.includes("Juster utsnitt og les på nytt"));
assert.ok(scanner.includes("Tekstlesing ferdig"));
assert.ok(scanner.includes("Fant ingen sikre opplysninger"));
assert.ok(scanner.includes("Automatisk tekstlesing lyktes ikke"));
assert.ok(scanner.includes("onExtracted(parsed)"));
assert.ok(scanner.includes("detectedFields"));
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
assert.ok(form.includes("receiveScan=result=>"));
assert.ok(form.includes("groups:{...x.groups,...result.groups}"));
assert.ok(form.includes("setOcrGrossOre"));
assert.ok(form.includes("documentConfirmed:false"),"Original review must stay manual");
assert.ok(form.includes("deductionConfirmed:false"),"Deduction approval must stay manual");
console.log("MVA iPhone bilde -> OCR -> autofyll: testet norsk/engelsk språk, fallback, identifisert leverandør, dato, nummer, MVA, tom OCR, feilbeskjed og frivillig beskjæring. Ingen ekte kvittering sendt.");
