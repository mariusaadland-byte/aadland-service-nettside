import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const helpers=new Function(read("lib/vatReceiptQuality.js").replace(/^export /gm,"")+
 ";return {vatReceiptScanQuality,needsVatReceiptRetry,chooseVatReceiptScan};")();
const {vatReceiptScanQuality,needsVatReceiptRetry,chooseVatReceiptScan}=helpers;
const scan=(values={},confidence=85)=>({text:"tekst",confidence,
 parsed:{supplierName:"",documentNumber:"",documentDate:"",totalOre:null,groups:{},warnings:[],...values}});
const first=scan({supplierName:"MEGAFLIS",documentDate:"2026-10-28",totalOre:12500},85);
assert.equal(needsVatReceiptRetry(first),true,"Try another layout when VAT cannot be read");
const second=scan({supplierName:"MEGAFLIS",documentNumber:"12345",documentDate:"2026-10-28",totalOre:12500,
 groups:{25:{base:"100,00",vat:"25,00"}}},75);
assert.equal(chooseVatReceiptScan(first,second).parsed.groups[25].vat,"25,00");
assert.equal(chooseVatReceiptScan(first,second).retried,true);
const wrongDate=scan({...second.parsed,documentDate:"2026-10-27"},95);
const conflicting=chooseVatReceiptScan(first,wrongDate);
assert.equal(conflicting.parsed.documentDate,"","Do not guess when two runs disagree on date");
assert.match(conflicting.parsed.warnings.join(" "),/ulike datoer/);
const worse=scan({supplierName:"Utydelig"},50);
assert.equal(chooseVatReceiptScan(second,worse).parsed.documentDate,"2026-10-28");
assert.equal(needsVatReceiptRetry(second),false,"Do not spend extra OCR time on complete receipts");
assert.equal(needsVatReceiptRetry(scan({supplierName:"Butikk"},50)),true);

const julaBase=scan({supplierName:"JULA",documentNumber:"37889",
 documentDate:"2026-10-19",totalOre:105165},82);
const julaVat=scan({groups:{25:{base:"841,32",vat:"210,33"}},
 documentDate:"2026-10-19"},77);
const combined=chooseVatReceiptScan(julaBase,julaVat);
assert.equal(combined.parsed.supplierName,"JULA");
assert.equal(combined.parsed.documentNumber,"37889");
assert.equal(combined.parsed.documentDate,"2026-10-19");
assert.equal(combined.parsed.totalOre,105165);
assert.deepEqual(combined.parsed.groups[25],{base:"841,32",vat:"210,33"});
assert.ok(combined.text.includes("Alternativ OCR-lesing"),"Show both text sources when fields are combined");
assert.equal(combined.parsed.warnings.length,0,"No stale 'missing' messages after complementary reads");

const grossConflict=chooseVatReceiptScan(julaBase,scan({
 totalOre:105155,groups:{25:{base:"841,32",vat:"210,33"}}
},94));
assert.equal(grossConflict.parsed.totalOre,null,"Conflicting totals must not be guessed");
assert.equal(Object.keys(grossConflict.parsed.groups).length,0,"Conflicting gross cannot autofill tax");
assert.match(grossConflict.parsed.warnings.join(" "),/ulike totalbeløp/);
const taxConflict=chooseVatReceiptScan(scan({...julaBase.parsed,groups:{25:{base:"841,32",vat:"210,33"}}}),
 scan({...julaBase.parsed,groups:{25:{base:"841,32",vat:"210,34"}}},93));
assert.deepEqual(taxConflict.parsed.groups,{},"Conflicting VAT amounts must not be filled");
assert.match(taxConflict.parsed.warnings.join(" "),/MVA-tallene/);
const idConflict=chooseVatReceiptScan(julaBase,scan({...julaBase.parsed,documentNumber:"37880"}));
assert.equal(idConflict.parsed.documentNumber,"","Conflicting receipt numbers require user review");
const incompleteDate=chooseVatReceiptScan(scan({...julaBase.parsed,documentDate:"",
 warnings:["Fant flere mulige dokumentdatoer. Velg riktig dato."]}),julaVat);
assert.equal(incompleteDate.parsed.documentDate,"","Ambiguous first-pass date cannot be silently replaced");
assert.equal(needsVatReceiptRetry(scan({supplierName:"JULA",documentNumber:"37889",
 totalOre:105165,groups:{25:{base:"841,32",vat:"210,33"}}})),true,"Retry to find missing date");

assert.ok(vatReceiptScanQuality(second).score>vatReceiptScanQuality(first).score);

const createVatReceiptReader=new Function(read("lib/vatReceiptRecognition.js")
 .replace(/^export /gm,"")+";return createVatReceiptReader;")();
let psm="6",setCalls=[],recognitionModes=[],created=0;
const reader=createVatReceiptReader({createWorker:async()=>{
 created++;
 return {setParameters:async params=>{psm=params.tessedit_pageseg_mode;setCalls.push(psm);},
  recognize:async()=>{recognitionModes.push(psm);return {data:{text:"Butikk\nDato 28.10.2026",confidence:81}};},
  terminate:async()=>{}};
}});
await reader.recognize([{}]);
await reader.recognize([{}],()=>{},{layout:"column"});
await reader.recognize([{}]);
assert.deepEqual(recognitionModes,["6","4","6"],"Column mode is temporary");
assert.deepEqual(setCalls,["4","6"],"Restore normal OCR mode");
assert.equal(created,1,"Reuse OCR worker after alternative attempt");
await reader.close();

const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(scanner.includes('recognize(prepared,onProgress,{layout:"column"})'));
assert.ok(scanner.includes("chooseVatReceiptScan(first,"));
assert.ok(scanner.includes("Noen felt mangler."));
assert.ok(scanner.includes("parsed:best.parsed"));
console.log("OCR fallback bestått: nytt oppsett prøves bare ved mangler, beste forslag beholdes, konfliktende dato avvises, worker gjenbrukes.");
