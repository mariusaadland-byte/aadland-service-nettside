// Any material change after review invalidates all three accounting confirmations.
// Preserve typed values and OCR suggestions; only the approvals are withdrawn.
const approvals=new Set(["documentConfirmed","deductionConfirmed","bankConditionConfirmed"]);
const unconfirm=form=>({...form,
 documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false
});
export function updateVatReceiptReviewedField(form,name,value){
 if(!form||typeof form!=="object")throw Error("Mangler bilagsutkast.");
 if(approvals.has(name))return {...form,[name]:Boolean(value)};
 if(form[name]===value)return form;
 return {...unconfirm(form),[name]:value};
}
export function updateVatReceiptReviewedAmount(form,rate,key,value){
 if(![0,12,15,25].includes(Number(rate))||!["base","vat"].includes(key))
  throw Error("Ukjent MVA-felt.");
 const current=form.groups?.[rate]?.[key]??"";
 if(current===value)return form;
 return {...unconfirm(form),
  groups:{...form.groups,[rate]:{...form.groups?.[rate],[key]:value}}
 };
}
