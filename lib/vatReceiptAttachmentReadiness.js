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

// Validate file signatures locally, before the purchase row is created.
// This mirrors the server check; the bytes never leave the browser here.
export async function validateVatReceiptAttachmentBytes(file,evidenceReference){
 const prelim=vatReceiptAttachmentIssue(file,evidenceReference);
 if(prelim||!file)return prelim;
 try{
  const data=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const ascii=(from,to)=>String.fromCharCode(...data.subarray(from,to));
  const t=String(file.type||"").toLowerCase();
  const valid=t==="application/pdf"?ascii(0,5)==="%PDF-":
   t==="image/jpeg"?data[0]===255&&data[1]===216&&data[2]===255:
   t==="image/png"?data.length>=8&&
    [137,80,78,71,13,10,26,10].every((value,i)=>data[i]===value):
   t==="image/webp"?ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP":false;
  return valid?"":"Kvitteringsfilens innhold stemmer ikke med filtypen. Velg originalbildet eller ta et nytt bilde før registrering.";
 }catch{
  return "Kunne ikke kontrollere kvitteringsfilen på denne enheten. Velg bildet på nytt før registrering.";
 }
}
