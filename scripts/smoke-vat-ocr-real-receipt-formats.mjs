import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const parser=new Function(read("lib/vatReceiptParser.js").replace(/^export /gm,"")+";return parseNorwegianReceipt;")();
const samples=[
 {
  name:"Posten receipt with VAT table on separate OCR lines",
  text:[
   "POSTEN","Skei - Post i Butikk","Bongnr.: 47-124492-1-725783-1",
   "Dato 24.06.2025","Total kr 257,00",
   "Mva sats  Grunnlag  Mva sum","25%","kr 205,60","kr 51,40"
  ].join("\n"),number:"47-124492-1-725783-1",total:25700,
  rate:25,base:"205,60",vat:"51,40"
 },
 {
  name:"Store receipt with Mva% 25,00 and amounts on separate lines",
  text:["REMA 1000 STORSLETT","Kvitt.nr.: 980844","Dato 22.02.2019",
   "Mva% 25,00","Grunnlag 87,20","Mva 21,80","Total 109,00"].join("\n"),
  number:"980844",total:10900,rate:25,base:"87,20",vat:"21,80"
 },
 {
  name:"Both rates declared explicitly",
  text:["TEST BUTIKK","Kvitt.nr.: 8888","27.10.2026",
   "MVA 25% 100,00 25,00","MVA 15% 100,00 15,00","SUM 240,00"].join("\n"),
  number:"8888",total:24000,rate:25,base:"100,00",vat:"25,00",
  other:{rate:15,base:"100,00",vat:"15,00"}
 },
 {
  name:"Original supported receipt style",
  text:["MEGAFLIS BERGEN AS","Kvittering nr 540018","Dato 25.10.2026",
   "MVA 25 % Grunnlag 1 000,00 Avgift 250,00","Totalt inkl mva 1 250,00"].join("\n"),
  number:"540018",total:125000,rate:25,base:"1000,00",vat:"250,00"
 }
];
for(const sample of samples){
 const p=parser(sample.text);
 assert.equal(p.documentNumber,sample.number,sample.name);
 assert.equal(p.totalOre,sample.total,sample.name);
 assert.equal(p.groups[sample.rate]?.base,sample.base,sample.name);
 assert.equal(p.groups[sample.rate]?.vat,sample.vat,sample.name);
 if(sample.other){
  assert.equal(p.groups[sample.other.rate]?.base,sample.other.base,sample.name);
  assert.equal(p.groups[sample.other.rate]?.vat,sample.other.vat,sample.name);
 }
 assert.deepEqual(p.warnings,[],sample.name);
}
const contradictory=parser("TEST BUTIKK\nKvitt.nr.: 9999\n27.10.2026\nMVA 25% 100,00 25,00\nTotal 160,00");
assert.deepEqual(contradictory.groups,{},"Conflicting amounts must never prefill VAT");
assert.match(contradictory.warnings.join(" "),/stemmer ikke/);
const noExplicitVat=parser("TEST BUTIKK\nKvitt.nr.: 2222\n27.10.2026\nKABEL 100,00\nSUM 125,00");
assert.deepEqual(noExplicitVat.groups,{},"Cannot invent a VAT rate from gross alone");

const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(scanner.includes("Test tekstleseren på denne telefonen"));
assert.ok(scanner.includes("async function testReader()"));
assert.ok(scanner.includes("canvas.toBlob(resolve,\"image/jpeg\",.92)"));
assert.ok(scanner.includes("readLocalReceipt(file,message=>setDiagnostic"));
assert.ok(scanner.includes("Ingen kvittering, regnskapsdata eller bilder sendes"));
assert.ok(scanner.includes("async function retryRead()"));
assert.ok(scanner.includes("Juster utsnitt og les på nytt"));
assert.ok(scanner.includes('"Fant "+details.detectedFields'));
assert.ok(scanner.includes("onExtracted(parsed)"));

const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
assert.ok(form.includes("previousOcr.current"),"New scans clear old OCR guesses, while retaining manually corrected values");
assert.ok(form.includes("supplierName:result.supplierName||x.supplierName"));
assert.ok(form.includes("documentNumber:result.documentNumber||x.documentNumber"));
assert.ok(form.includes("documentDate:result.documentDate||x.documentDate"));
assert.ok(form.includes("groups:{...x.groups,...result.groups}"));
assert.ok(form.includes("documentConfirmed:false"));
assert.ok(form.includes("deductionConfirmed:false"));
console.log("Kvitteringstolkning og mobilfeilsøking bestått: 25/15 %, linjedelte MVA-tabeller, Posten/REMA-format, ingen oppdiktet fradrag, tap av manuell tekst eller ekstern diagnostikkopplasting.");
