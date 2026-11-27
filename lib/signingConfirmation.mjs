import {rentalUnitId} from "./rentalUnitQr.mjs";
import {archiveAccess,archiveDocument,checkedEvidence,buildEvidencePdf} from "./signingArchiveDownload.mjs";
const fmt=v=>new Date(v).toLocaleString("nb-NO",{timeZone:"Europe/Oslo",dateStyle:"medium",timeStyle:"short"});
// Only build mail from verified persisted evidence and current confirmed account.
// A changed account address suppresses automated mail; never redirect documents to new email.
export function signingConfirmationPayload({agreement,group,record,account,key}){
 if(!account?.email_confirmed_at||!archiveAccess({actor:{kind:"customer",id:account.id},agreement,group}))return null;
 const original=archiveDocument(agreement),e=checkedEvidence({agreement,record,key});
 if(!original||!e||typeof account.email!=="string"||account.email.trim().toLowerCase()!==e.email)return null;
 const proof=buildEvidencePdf({agreement,evidence:e});
 const suffix=agreement.id.toLowerCase();
 return {to:e.email,subject:"Signeringsbekreftelse – Aadland Utleie",text:"Din signering er registrert "+fmt(e.signedAt)+".\n\nVedlagt finner du original leieavtale og separat signeringsbevis. Oppbevar begge dokumentene.\n\nDu kan også logge inn på https://www.aadlandutleie.no/min-side/signering for å finne avtalene dine.\n\nDenne e-posten bekrefter signering, ikke betaling eller endelig bookingbekreftelse.\n\nAadland Utleie",attachments:[{filename:"Aadland-avtale-"+suffix+".pdf",content:original},{filename:"Aadland-bevis-"+suffix+".pdf",content:proof}],idempotencyKey:"aadland-signing-confirmation/"+suffix};
}
export function signingArchiveRow({actor,agreement,group,current,record,key}){
 if(!archiveAccess({actor,agreement,group})||!Number.isSafeInteger(agreement.revision)||agreement.revision<1||!Number.isFinite(Date.parse(agreement.created_at)))return null;
 const original=archiveDocument(agreement);
 if(!original)return null;
 const e=record?checkedEvidence({agreement,record,key}):null;
 if(record&&!e)return null;
 const id=agreement.id;
 return {id,revision:agreement.revision,createdAt:agreement.created_at,orderNumber:String(group.order_number),current:current===true,signedAt:e?.signedAt??null,documentUrl:"/api/customer/signing/"+id+"/avtale",proofUrl:e?"/api/customer/signing/"+id+"/bevis":null};
}
