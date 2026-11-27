import {agreementDocumentDigest,signingEvidenceIntact,SIGNING_STATEMENT} from "./aadlandSigning.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {renderAgreementSections} from "./rentalAgreementPdf.mjs";
export function archiveAccess({actor,agreement,group}){
 if(!rentalUnitId(actor?.id)||!rentalUnitId(agreement?.id)||!rentalUnitId(group?.id)||agreement.group_id!==group.id||agreement.customer_user_id!==group.customer_user_id)return false;
 return actor.kind==="owner"||actor.kind==="customer"&&actor.id===agreement.customer_user_id;
}
export function archivedPdfBytes(value){
 if(Buffer.isBuffer(value))return value.length<=1048576?value:null;
 if(typeof value!=="string"||value.length>2097154||!/^\\x(?:[a-f0-9]{2})+$/i.test(value))return null;
 return Buffer.from(value.slice(2),"hex");
}
export function archiveDocument(agreement){
 const bytes=archivedPdfBytes(agreement?.document_bytes);
 if(!bytes||bytes.length<16||bytes.subarray(0,5).toString()!=="%PDF-"||agreementDocumentDigest(bytes)!==agreement.document_digest)return null;
 return bytes;
}
export function checkedEvidence({agreement,record,key}){
 if(!record||record.agreement_id!==agreement?.id||typeof record.evidence_text!=="string"||Buffer.byteLength(record.evidence_text)>20000)return null;
 try{
  const e=JSON.parse(record.evidence_text);
  if(JSON.stringify(e)!==record.evidence_text||!signingEvidenceIntact({evidence:e,seal:record.evidence_seal},key))return null;
  if(e.agreementId!==agreement.id||e.customerId!==agreement.customer_user_id||e.documentDigest!==agreement.document_digest||e.quoteDigest!==agreement.quote_digest||e.termsVersion!==agreement.terms_version||e.challengeId!==record.challenge_id||!rentalUnitId(e.challengeId)||e.method!=="typed_name_email_otp"||e.statement!==SIGNING_STATEMENT||typeof e.name!=="string"||e.name.trim().length<2||e.name.length>120||!Number.isFinite(Date.parse(e.signedAt))||Date.parse(e.signedAt)!==Date.parse(record.signed_at))return null;
  return e;
 }catch{return null;}
}
export function buildEvidencePdf({agreement,evidence}){
 return renderAgreementSections([
 {heading:true,text:"Signeringsbevis"},
 {text:"Avtale-ID: "+agreement.id+"\nAvtaleversjon: "+agreement.revision+"\nVilkårsversjon: "+evidence.termsVersion},
 {heading:true,text:"Registrert signering"},
 {text:"Navn: "+evidence.name+"\nBekreftet e-post: "+evidence.email+"\nSignert (UTC): "+evidence.signedAt+"\nMetode: Skrevet navn og engangskode på e-post"},
 {text:evidence.statement},
 {heading:true,text:"Dokumentbinding"},
 {text:"SHA-256 av original avtale-PDF:\n"+evidence.documentDigest+"\nPrisgrunnlag SHA-256:\n"+evidence.quoteDigest},
 {text:"Beviset er en utskrift av kontrollert serverregistrering. Ikke BankID, kvalifisert signatur eller betalingsbekreftelse. Oppbevares sammen med original avtale-PDF."}
 ],"AADLAND SIGNERING | BEVIS");
}
export function archiveHeaders(id,kind){
 if(!rentalUnitId(id)||!["avtale","bevis"].includes(kind))return null;
 return {"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="Aadland-'+kind+'-'+id.toLowerCase()+'.pdf"',"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow","Cross-Origin-Resource-Policy":"same-origin"};
}
