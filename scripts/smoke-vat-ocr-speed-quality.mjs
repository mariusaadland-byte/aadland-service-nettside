import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const imageSrc=read("lib/vatOcrImage.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {vatOcrGeometry}=new Function("detectReceiptBounds",imageSrc+";return {vatOcrGeometry};")(()=>null);
const img=vatOcrGeometry(4032,3024);
assert.equal(img.cropped,false);
assert.equal(img.sx,0);assert.equal(img.sy,0);
assert.ok(img.width*img.height<=2600000+5000,"Max 2.6 MP OCR pixel budget");
assert.ok(img.width<=2200&&img.height<=2200);
const portrait=vatOcrGeometry(3024,4032);
assert.ok(portrait.width*portrait.height<=2605000);
const paper=vatOcrGeometry(4032,3024,{x:.25,y:.18,w:.5,h:.64});
assert.equal(paper.cropped,true);
assert.ok(paper.sx>0&&paper.sy>0);
assert.ok(paper.width*paper.height<=2605000);
assert.ok(paper.sw<img.sw&&paper.sh<img.sh);
assert.equal(vatOcrGeometry(1100,1500).height,1500,"Keep smaller images sharp");
assert.equal(vatOcrGeometry(4032,3024,{x:0,y:0,w:.20,h:.20}).cropped,false,
 "Do not crop uncertain or tiny detected papers");
assert.equal(vatOcrGeometry(4032,3024,{x:.02,y:.02,w:.95,h:.95}).cropped,false,
 "No need to crop nearly full image");
assert.ok(imageSrc.includes("return new File([blob]"),"Create a separate OCR file");
assert.ok(imageSrc.includes("URL.revokeObjectURL"),"Release source image URLs");

const recognizerSrc=read("lib/vatReceiptRecognition.js").replace(/^export /gm,"");
const createVatReceiptReader=new Function(recognizerSrc+";return createVatReceiptReader;")();
let created=0,recognized=0,terminated=0,failNext=false;
const fake={createWorker:async(lang,oem,options)=>{
 created++;assert.deepEqual(lang,["nor","eng"]);
 assert.equal(oem,1);assert.equal(typeof options.logger,"function");
 return {recognize:async()=>{
  recognized++;
  if(failNext){failNext=false;throw Error("worker died")}
  return {data:{text:"MEGAFLIS BERGEN AS\nSUM 125,00",confidence:82}};
 },terminate:async()=>{terminated++}};
}};
const reader=createVatReceiptReader(fake);
const progress=[];
const first=await reader.recognize([{}],v=>progress.push(v));
const second=await reader.recognize([{}]);
assert.equal(first.confidence,82);
assert.match(first.text,/MEGAFLIS/);
assert.equal(second.confidence,82);
assert.equal(created,1,"Reuse one language model for multiple photos");
assert.equal(recognized,2);
assert.equal(terminated,0,"Do not tear down worker after each photo");
assert.ok(progress.some(x=>x.includes("Leser bilde")));
failNext=true;
await assert.rejects(reader.recognize([{}]),/worker died/);
assert.equal(terminated,1,"Terminate broken OCR worker");
await reader.recognize([{}]);
assert.equal(created,2,"Recreate worker only after a failure");
await reader.close();assert.equal(terminated,2,"Release OCR memory when leaving page");

const parser=new Function(read("lib/vatReceiptParser.js").replace(/^export /gm,"")+";return parseNorwegianReceipt;")();
const bad=parser(["p EERO ES, NNN ~, Uh Wa BF nh, . ra","Dato 20.10.2026"].join("\n"));
assert.equal(bad.supplierName,"","Do not fill a nonsense supplier name");
assert.equal(bad.documentDate,"2026-10-20");
const legit=parser("MEGAFLIS BERGEN AS\nKvittering nr 1111\nDato 28.10.2026");
assert.equal(legit.supplierName,"MEGAFLIS BERGEN AS");
const grocery=parser("REMA 1000 STORSLETT\nKvitt.nr. 1111\nDato 28.10.2026");
assert.equal(grocery.supplierName,"REMA 1000 STORSLETT");
const text=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(text.includes("prepareVatOcrImage(image,onProgress)"));
assert.ok(text.includes("createVatReceiptReader(tess)"));
assert.ok(text.includes("readerRef.current.close()"));
assert.ok(text.includes("recognized.confidence<45"));
assert.ok(text.includes("Brukte {details.seconds} sekunder"));
assert.ok(text.includes("onExtracted(parsed)"));
assert.ok(text.includes("recognizeSelected(file"));
assert.ok(read("app/admin/faktura/mva/InputVatRegisterClient.js").includes("mergeVatReceiptSuggestions(x,previous,result)"));
console.log("iPhone OCR hastighet/sikkerhet bestått: maks 2,6 MP lesekopi, trygg beskæring, gjenbrukt worker, feilgjenoppretting, avvist feilnavn og bevart manuell informasjon.");
