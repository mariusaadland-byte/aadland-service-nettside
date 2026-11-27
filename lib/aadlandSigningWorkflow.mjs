// Node-only workflow. Store operations MUST be atomic; no production store is wired yet.
import {issueSigningChallenge,verifySigningCode,signingConsent,sealSigningEvidence,agreementDocumentDigest,MAX_CODE_ATTEMPTS} from "./aadlandSigning.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const SIGNING_LIMITS=Object.freeze({resendSeconds:60,issuesPerHour:3,attemptsPerHour:5});
export function signingContext({agreement,account,group,currentId,now}){
 if(!agreement||!account||!group||!rentalUnitId(account.id)||!account.email_confirmed_at||agreement.customer_user_id!==account.id||group.customer_user_id!==account.id||agreement.group_id!==group.id||currentId!==agreement.id||group.status!=="held"||group.quote_digest!==agreement.quote_digest||group.terms_version!==agreement.terms_version||!Number.isFinite(Date.parse(group.expires_at))||!Number.isFinite(Date.parse(now))||Date.parse(now)>=Date.parse(group.expires_at))return null;
 const email=typeof account.email==="string"?account.email.trim().toLowerCase():"";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!Buffer.isBuffer(agreement.document_bytes)||agreement.document_bytes.length<1||agreement.document_bytes.length>1048576||agreementDocumentDigest(agreement.document_bytes)!==agreement.document_digest)return null;
 return {agreementId:agreement.id,customerId:account.id,email,documentDigest:agreement.document_digest,quoteDigest:agreement.quote_digest,termsVersion:agreement.terms_version};
}
export function signingCodeMail({code,challenge}){
 if(!/^\d{6}$/.test(code)||!rentalUnitId(challenge?.agreementId)||typeof challenge.email!=="string"||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(challenge.email))throw Error("INVALID_SIGNING_MAIL");
 return {to:challenge.email,subject:"Din engangskode – Aadland Signering",text:"Din engangskode for Aadland Utleie er "+code+".\n\nKoden er gyldig i maksimalt 10 minutter, og bare mens reservasjonen er aktiv. Bruk den kun på www.aadlandutleie.no for avtalen du nettopp har lest. Ikke del koden med andre.\n\nHvis du ikke har bedt om signering, kan du se bort fra denne e-posten.\n\nAadland Utleie"};
}
// account, agreement, group and currentId must originate from authorized server reads.
// reserveChallenge must lock group/current agreement and account quota, recheck
// context and deadline, revoke previous challenge, persist new MAC and count issue.
// Delivery failure never returns the code or grants signature; revoke only this pending ID.
export async function requestSigningCode({context,input,key,keyId,now,store,send}){
 if(!context||!signingConsent(input,context)||typeof keyId!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId))return {status:"unavailable"};
 const {challenge,code}=issueSigningChallenge({...context,now,key});
 const result=await store.reserveChallenge({context,challenge,keyId,limits:SIGNING_LIMITS});
 if(result!=="reserved")return {status:result==="limited"?"limited":"unavailable"};
 try{
  const delivered=await send(signingCodeMail({code,challenge}));
  if(delivered!==true)throw Error("DELIVERY_UNCONFIRMED");
  return {status:"sent",challengeId:challenge.challengeId,expiresAt:challenge.expiresAt};
 }catch{
  await store.revokePending({context,challengeId:challenge.challengeId});
  return {status:"delivery_unconfirmed"};
 }
}
// Store must obtain locks and provide fresh context, current challenge, key ID,
// account-wide attempt allowance, database clock; persist wrong attempts and close
// exhausted challenges. Commit consume + append-only evidence in ONE transaction.
// Do not throw on wrong code (would roll back counter). Never pass a code to store/logs.
export function decideSigningAttempt({challenge,expected,code,input,now,key,accountAttemptsAllowed}){
 if(accountAttemptsAllowed!==true)return {action:"limited"};
 const consent=signingConsent(input,expected);
 if(!consent)return {action:"review"};
 const status=verifySigningCode({challenge,expected,code,now,key});
 if(status==="wrong_code"){
  const attempts=challenge.attempts+1;
  return {action:"record_failure",attempts,state:attempts>=MAX_CODE_ATTEMPTS?"locked":"pending",clearMac:attempts>=MAX_CODE_ATTEMPTS};
 }
 if(status==="expired")return {action:"expire",clearMac:true};
 if(status!=="verified")return {action:status};
 const record=sealSigningEvidence({expected,challenge:{...challenge,state:"consumed"},consent,verifiedAt:now,key});
 if(!record)return {action:"review"};
 return {action:"consume_and_record",clearMac:true,evidenceText:JSON.stringify(record.evidence),seal:record.seal};
}
