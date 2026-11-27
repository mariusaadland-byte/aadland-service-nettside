import {signingContext,requestSigningCode} from "./aadlandSigningWorkflow.mjs";
import {signingConsent} from "./aadlandSigning.mjs";
import {signingCommitPlan} from "./aadlandSigningCommit.mjs";
import {archiveDocument,checkedEvidence} from "./signingArchiveDownload.mjs";
import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export function checkoutSigningContext({agreement,group,account,currentId,now}={}){
 const bytes=archiveDocument(agreement);
 if(!bytes||!checkFrozenGroupQuote(group)||typeof account?.email!=="string"||agreement.signing_email!==account.email.trim().toLowerCase())return null;
 return signingContext({agreement:{...agreement,document_bytes:bytes},group,account,currentId,now});
}
export function signingChallengeRow(row){
 if(!row||!rentalUnitId(row.id)||!Number.isFinite(Date.parse(row.issued_at))||!Number.isFinite(Date.parse(row.expires_at)))return null;
 return {challengeId:row.id,agreementId:row.agreement_id,customerId:row.customer_user_id,email:row.email,documentDigest:row.document_digest,quoteDigest:row.quote_digest,termsVersion:row.terms_version,issuedAt:new Date(row.issued_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),attempts:row.attempts,state:row.state,codeMac:row.code_mac};
}
export function signingRequestInput(body,verify=false){
 if(!rentalUnitId(body?.agreementId)||typeof body.name!=="string"||body.name.length>120||body.accepted!==true||body.paymentObligation!==true||typeof body.documentDigest!=="string"||!/^[a-f0-9]{64}$/.test(body.documentDigest)||typeof body.quoteDigest!=="string"||!/^[a-f0-9]{64}$/.test(body.quoteDigest)||typeof body.termsVersion!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(body.termsVersion))return null;
 if(verify&&(!rentalUnitId(body.challengeId)||typeof body.code!=="string"||!/^\d{6}$/.test(body.code)))return null;
 return {agreementId:body.agreementId,name:body.name,accepted:true,paymentObligation:true,documentDigest:body.documentDigest,quoteDigest:body.quoteDigest,termsVersion:body.termsVersion,...(verify?{challengeId:body.challengeId,code:body.code}:{})};
}
export async function issueCheckoutSigningCode({context,input,key,keyId,now,store,send}){
 if(!context||input?.agreementId!==context.agreementId||!Buffer.isBuffer(key)||key.length!==32)return {status:"unavailable"};
 return requestSigningCode({context,input,key,keyId,now,store,send});
}
export function confirmedCheckoutSignature({agreement,context,record,key,input}){
 if(!context||!record||!signingConsent(input,context)||record.challenge_id!==input.challengeId)return false;
 const e=checkedEvidence({agreement,record,key});
 return !!e&&e.email===context.email&&e.name===input.name.trim();
}
// Re-read after stale CAS. Never trust caller MAC/action or count.
export async function verifyCheckoutSigningCode({context,agreement,input,store,readChallenge,readEvidence,keyFor,clock}){
 if(!context||input?.agreementId!==context.agreementId||!signingConsent(input,context))return {status:"unavailable"};
 const prior=await readEvidence();
 if(prior)return {status:confirmedCheckoutSignature({agreement,context,record:prior,key:keyFor(prior.key_id),input})?"signed":"unavailable"};
 for(let i=0;i<6;i++){
  const row=await readChallenge(input.challengeId),challenge=signingChallengeRow(row);
  if(!challenge||challenge.agreementId!==context.agreementId||challenge.customerId!==context.customerId)return {status:"unavailable"};
  const key=keyFor(row.key_id);if(!Buffer.isBuffer(key)||key.length!==32)return {status:"unavailable"};
  const plan=signingCommitPlan({challenge,expected:context,code:input.code,input,now:clock(),key,keyId:row.key_id,accountAttemptsAllowed:true});
  if(plan?.status!=="commit_required"){
   if(plan?.status==="closed"){const record=await readEvidence();if(confirmedCheckoutSignature({agreement,context,record,key:keyFor(record?.key_id),input}))return {status:"signed"};}
   return {status:["expired","locked","closed","limited"].includes(plan?.status)?plan.status:"unavailable"};
  }
  const result=await store.commit(plan);
  if(result==="stale")continue;
  if(result==="signed"||result==="closed"){
   const record=await readEvidence();
   if(confirmedCheckoutSignature({agreement,context,record,key:keyFor(record?.key_id),input}))return {status:"signed"};
   return {status:"unavailable"};
  }
  return {status:["wrong_code","expired","limited"].includes(result)?result:"unavailable"};
 }
 return {status:"retry"};
}
