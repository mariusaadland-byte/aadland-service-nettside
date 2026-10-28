import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const code=read("lib/vatReceiptAutofill.js").replace(/^export /gm,"");
const {startNewVatReceiptDraft,emptyVatOcrSuggestion,mergeVatReceiptSuggestions,snapshotVatOcrSuggestion}=
 new Function(code+";return {startNewVatReceiptDraft,emptyVatOcrSuggestion,mergeVatReceiptSuggestions,snapshotVatOcrSuggestion};")();
const jula={supplierName:"Jula Norge AS",documentNumber:"37889",documentDate:"2026-10-19",
 kind:"credit",originalDocumentNumber:"12411",evidenceReference:"Tidligere fil",
 businessPurpose:"Verktøy og utstyr",deductionPercent:"50",groups:{
  0:{base:"",vat:""},12:{base:"",vat:""},15:{base:"",vat:""},
  25:{base:"841,31",vat:"210,33"}
 },documentConfirmed:true,deductionConfirmed:true,bankConditionConfirmed:true};
const newDraft=startNewVatReceiptDraft(jula);
for(const field of ["supplierName","documentNumber","documentDate","businessPurpose",
 "evidenceReference","originalDocumentNumber"])
 assert.equal(newDraft[field],"",field+" must not carry over to the next receipt");
assert.equal(newDraft.kind,"purchase");
assert.equal(newDraft.deductionPercent,"100");
for(const entry of Object.values(newDraft.groups))assert.deepEqual(entry,{base:"",vat:""});
for(const field of ["documentConfirmed","deductionConfirmed","bankConditionConfirmed"])
 assert.equal(newDraft[field],false,field+" cannot remain checked");
// A rescan of the SAME receipt must still preserve manual corrections.
const ocr={supplierName:"Jula",documentNumber:"37889",documentDate:"2026-10-19",
 groups:{25:{base:"841,32",vat:"210,33"}}};
const corrected=mergeVatReceiptSuggestions(jula,snapshotVatOcrSuggestion(ocr),ocr);
assert.equal(corrected.supplierName,"Jula Norge AS");
assert.equal(corrected.groups[25].base,"841,31");
const different={supplierName:"Byggern",documentNumber:"88889",documentDate:"2026-10-28",
 groups:{25:{base:"200,00",vat:"50,00"}}};
const next=mergeVatReceiptSuggestions(newDraft,emptyVatOcrSuggestion(),different);
assert.equal(next.supplierName,"Byggern");
assert.equal(next.documentNumber,"88889");
assert.equal(next.documentDate,"2026-10-28");
assert.equal(next.groups[25].base,"200,00");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(form.includes("setForm(x=>startNewVatReceiptDraft(x))"),
 "Use new draft reset only when new photo is validated");
assert.ok(form.includes("setForm(x=>({...mergeVatReceiptSuggestions(x,previous,result)"),
 "Preserve manual corrections on crop and retry");
assert.ok(form.includes("setReceiptSession(n=>n+1)"),
 "Reset scanner after a successful registered purchase");
assert.ok(form.includes("resetToken={receiptSession}"));
assert.ok(scanner.includes("lastResetToken.current===resetToken"));
assert.ok(scanner.includes("setCropJob(null);setImageForCrop(null);setDiagnostic(null);setLiveCamera(false)"),
 "Do not leave previous photo visible for next accounting purchase");
assert.ok(scanner.indexOf("const prepared=await prepareReceiptFile(source,setProgress);") <
 scanner.indexOf("   onSelected(null);"),
 "Invalid new photo must leave current receipt alone");
assert.ok(scanner.includes("preserveAttachment:true"),
 "OCR retries must never switch accounting attachments");
console.log("Ny kvittering bestått: gammelt kjøp nullstilles, manuelt rettet OCR beholdes kun ved samme bilag.");
