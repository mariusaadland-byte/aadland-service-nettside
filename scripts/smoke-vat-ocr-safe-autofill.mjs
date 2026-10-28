import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/vatReceiptAutofill.js").replace(/^export /gm,"");
const {emptyVatOcrSuggestion,snapshotVatOcrSuggestion,mergeVatReceiptSuggestions,clearVatReceiptSuggestions}=
 new Function(source+";return {emptyVatOcrSuggestion,snapshotVatOcrSuggestion,mergeVatReceiptSuggestions,clearVatReceiptSuggestions};")();
const blank=()=>({supplierName:"",documentNumber:"",documentDate:"",businessPurpose:"",
 groups:{0:{base:"",vat:""},12:{base:"",vat:""},15:{base:"",vat:""},25:{base:"",vat:""}}});
const first={supplierName:"Jula",documentNumber:"12345",documentDate:"2026-10-19",
 groups:{25:{base:"841,32",vat:"210,33"}}};
const before=emptyVatOcrSuggestion();
const state=mergeVatReceiptSuggestions(blank(),before,first);
assert.equal(state.documentDate,first.documentDate);
assert.equal(state.supplierName,"Jula");
assert.equal(state.groups[25].vat,"210,33");
const changed={...state,supplierName:"Jula Norge AS",groups:{...state.groups,25:{...state.groups[25],base:"841,31"}}};
const corrected=mergeVatReceiptSuggestions(changed,snapshotVatOcrSuggestion(first),
 {...first,documentNumber:"12346",documentDate:"",groups:{25:{base:"841,32",vat:"210,34"}}});
assert.equal(corrected.supplierName,"Jula Norge AS","Never overwrite a supplier edited manually");
assert.equal(corrected.groups[25].base,"841,31","Keep manual net correction");
assert.equal(corrected.groups[25].vat,"210,34","Update OCR values not edited");
assert.equal(corrected.documentNumber,"12346","Improve a previously guessed receipt number");
assert.equal(corrected.documentDate,"","Withdraw uncertain date after a new OCR pass");
assert.equal(corrected.businessPurpose,"","Never touch accounting fields");
const cleared=clearVatReceiptSuggestions(changed,snapshotVatOcrSuggestion(first));
assert.equal(cleared.documentDate,"","Do not bring an old receipt date into a new scan");
assert.equal(cleared.documentNumber,"","Do not bring an old receipt number into a new scan");
assert.equal(cleared.supplierName,"Jula Norge AS","Keep manually entered supplier");
assert.equal(cleared.groups[25].base,"841,31","Keep manually corrected amount");
assert.equal(cleared.groups[25].vat,"","Withdraw old OCR VAT from new receipt");
assert.equal(mergeVatReceiptSuggestions(blank(),before,{}).supplierName,"");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
assert.ok(form.includes("mergeVatReceiptSuggestions(x,previous,result)"));
assert.ok(form.includes("startNewVatReceiptDraft(x)"));
assert.ok(form.includes("snapshotVatOcrSuggestion(result)"));
assert.ok(form.includes("setOcrMismatchChecked(false)"));
assert.ok(form.includes('setForm(x=>({...x,supplierName:"",documentNumber:"",documentDate:""'),"New purchase must not inherit previous supplier");
assert.ok(form.includes("previousOcr.current=emptyVatOcrSuggestion();"),"Reset OCR snapshot after saved receipt");

console.log("Sikker OCR-autofyll bestått: bevarer manuelt korrigerte felt, trekker tilbake usikre tidligere forslag.");
