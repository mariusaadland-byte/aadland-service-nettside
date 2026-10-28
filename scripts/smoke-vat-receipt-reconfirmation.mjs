import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const methods=new Function(read("lib/vatReceiptReview.js").replace(/^export /gm,"")+
 ";return {updateVatReceiptReviewedField,updateVatReceiptReviewedAmount};")();
const {updateVatReceiptReviewedField,updateVatReceiptReviewedAmount}=methods;
const reviewed={
 supplierName:"JULA",documentNumber:"37889",documentDate:"2026-10-19",
 businessPurpose:"Verktøy og utstyr",evidenceReference:"Aadland MVA – privat originalvedlegg",
 deductionPercent:"100",kind:"purchase",originalDocumentNumber:"",
 groups:{0:{base:"",vat:""},12:{base:"",vat:""},15:{base:"",vat:""},
  25:{base:"841,32",vat:"210,33"}},
 documentConfirmed:true,deductionConfirmed:true,bankConditionConfirmed:true
};
for(const [field,value] of [
 ["supplierName","Jula Norge AS"],["documentNumber","37880"],["documentDate","2026-10-20"],
 ["businessPurpose","Materialer til kundeoppdrag"],["deductionPercent","50"],
 ["kind","credit"],["originalDocumentNumber","INV-37889"],["evidenceReference","Annet bilag"]
]){
 const updated=updateVatReceiptReviewedField(reviewed,field,value);
 assert.equal(updated[field],value);
 assert.equal(updated.documentConfirmed,false,field+" invalidates document review");
 assert.equal(updated.deductionConfirmed,false,field+" invalidates VAT deduction review");
 assert.equal(updated.bankConditionConfirmed,false,field+" invalidates bank payment review");
 assert.equal(updated.groups[25].base,"841,32","Amounts stay intact");
}
for(const [rate,key,value] of [[25,"base","841,31"],[25,"vat","210,34"],
 [15,"base","100,00"],[0,"vat","0,00"]]){
 const changed=updateVatReceiptReviewedAmount(reviewed,rate,key,value);
 assert.equal(changed.groups[rate][key],value);
 for(const approval of ["documentConfirmed","deductionConfirmed","bankConditionConfirmed"])
  assert.equal(changed[approval],false,rate+"% "+key+" invalidates "+approval);
 assert.equal(changed.supplierName,"JULA");
}
for(const approval of ["documentConfirmed","deductionConfirmed","bankConditionConfirmed"]){
 const first={...reviewed,documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false};
 const checked=updateVatReceiptReviewedField(first,approval,true);
 assert.equal(checked[approval],true);
 assert.equal(checked.supplierName,"JULA");
 assert.equal(checked.deductionPercent,"100");
 for(const other of ["documentConfirmed","deductionConfirmed","bankConditionConfirmed"].filter(x=>x!==approval))
  assert.equal(checked[other],false,"Checking one box must not check others");
}
assert.equal(updateVatReceiptReviewedField(reviewed,"supplierName","JULA"),reviewed,
 "An unchanged field need not invalidate confirmed review");
assert.equal(updateVatReceiptReviewedAmount(reviewed,25,"vat","210,33"),reviewed,
 "An unchanged amount should not invalidate reviewed VAT");
assert.throws(()=>updateVatReceiptReviewedAmount(reviewed,23,"vat","20,00"),/Ukjent MVA/);
assert.throws(()=>updateVatReceiptReviewedAmount(reviewed,25,"gross","100,00"),/Ukjent MVA/);
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
assert.ok(form.includes("setForm(x=>updateVatReceiptReviewedField(x,name,value))"));
assert.ok(form.includes("setForm(x=>updateVatReceiptReviewedAmount(x,rate,key,value))"));
assert.ok(form.includes('if(!["documentConfirmed","deductionConfirmed","bankConditionConfirmed"].includes(name))setOcrMismatchChecked(false)'),
 "Changing a reviewed value requires new mismatch confirmation");
assert.ok(form.includes('checked={form.documentConfirmed}'));
assert.ok(form.includes('checked={form.deductionConfirmed}'));
assert.ok(form.includes('checked={form.bankConditionConfirmed}'));
assert.ok(form.includes('!form.documentConfirmed||!form.deductionConfirmed'),
 "Final save stays locked until both confirmations are given");
console.log("MVA-etterkontroll bestått: endret dato, leverandør, sats, grunnlag eller fradrag krever nye avkrysninger.");
