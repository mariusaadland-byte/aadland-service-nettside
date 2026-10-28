// A receipt scan is a suggestion, never a reason to overwrite a user's
// correction. When rescanning a cropped photo, replace earlier OCR guesses,
// including withdrawing fields that the improved scan can no longer verify.
export const emptyVatOcrSuggestion=()=>({
 supplierName:"",documentNumber:"",documentDate:"",groups:{}
});
export const snapshotVatOcrSuggestion=result=>({
 supplierName:result?.supplierName||"",
 documentNumber:result?.documentNumber||"",
 documentDate:result?.documentDate||"",
 groups:result?.groups||{}
});
const keepOrUpdate=(current,oldSuggestion,newSuggestion)=>{
 const previous=String(oldSuggestion||""),latest=String(newSuggestion||"");
 // Explicit manual edits win. Empty fields and unchanged OCR guesses can
 // receive updates or be cleared when the next scan is less certain.
 return !current||previous&&current===previous?latest:current;
};
export function mergeVatReceiptSuggestions(form,previousSuggestion,nextResult){
 const old=previousSuggestion||emptyVatOcrSuggestion();
 const next=snapshotVatOcrSuggestion(nextResult);
 const groups={};
 for(const [rate,values] of Object.entries(form.groups||{})){
  groups[rate]={
   base:keepOrUpdate(values?.base||"",old.groups?.[rate]?.base,next.groups?.[rate]?.base),
   vat:keepOrUpdate(values?.vat||"",old.groups?.[rate]?.vat,next.groups?.[rate]?.vat)
  };
 }
 return {
  ...form,
  supplierName:keepOrUpdate(form.supplierName,old.supplierName,next.supplierName),
  documentNumber:keepOrUpdate(form.documentNumber,old.documentNumber,next.documentNumber),
  documentDate:keepOrUpdate(form.documentDate,old.documentDate,next.documentDate),
  groups
 };
}
export function clearVatReceiptSuggestions(form,previousSuggestion){
 return mergeVatReceiptSuggestions(form,previousSuggestion,emptyVatOcrSuggestion());
}

/**
 * The next valid receipt is a new accounting document, not another OCR pass.
 * In contrast to clearVatReceiptSuggestions (which preserves manual edits
 * while changing the OCR image), this intentionally discards ALL old receipt
 * fields, including amounts manually corrected on the previous receipt.
 */
export function startNewVatReceiptDraft(form){
 const groups={};
 for(const rate of [0,12,15,25])groups[rate]={base:"",vat:""};
 return {
  ...form,
  supplierName:"",documentNumber:"",documentDate:"",
  kind:"purchase",originalDocumentNumber:"",
  evidenceReference:"",businessPurpose:"",deductionPercent:"100",
  groups,
  documentConfirmed:false,deductionConfirmed:false,
  bankConditionConfirmed:false
 };
}
