// Shared with the purchase form; pure browser-safe checks.
export const vatUploadMaxBytes=4*1024*1024;
const allowedTypes={
 "application/pdf":["pdf"],"image/jpeg":["jpg","jpeg"],
 "image/png":["png"],"image/webp":["webp"]
};
export function vatReceiptAttachmentIssue(file,evidenceReference){
 const reference=String(evidenceReference||"").trim();
 if(!file){
  if(/^Aadland MVA\s*[–-]\s*(?:privat originalvedlegg|vedlagt JPEG-kopi)/i.test(reference))
   return "Kvitteringsbildet er fjernet. Velg kvitteringen på nytt, eller oppgi en faktisk referanse til hvor originalbilaget er lagret.";
  return "";
 }
 if(!Number.isFinite(file.size)||file.size<12||file.size>vatUploadMaxBytes)
  return "Kvitteringsbildet kan ikke lagres som vedlegg (maks 4 MB). Velg et mindre bilde før du registrerer bilaget.";
 const type=String(file.type||"").toLowerCase();
 const ext=String(file.name||"").split(".").pop().toLowerCase();
 if(!allowedTypes[type]?.includes(ext))
  return "Bilagsvedlegget må være PDF, JPG, PNG eller WebP med riktig filtype og filendelse.";
 return "";
}
export function removeVatReceiptAttachmentReference(form){
 const reference=String(form.evidenceReference||"").trim();
 const automatic=/^Aadland MVA\s*[–-]\s*(?:privat originalvedlegg|vedlagt JPEG-kopi)/i.test(reference);
 return {...form,
  evidenceReference:automatic?"":form.evidenceReference,
  documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false
 };
}
