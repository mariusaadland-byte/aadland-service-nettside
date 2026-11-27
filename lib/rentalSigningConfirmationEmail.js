import "server-only";
import {Resend} from "./safeResend";
import {rentalResendApiKey,rentalEmailFrom,rentalReplyTo} from "./rentalEmailConfig";
import {evidenceKey,signingArchiveEnabled} from "./signingArchiveConfig";
import {signingConfirmationPayload} from "./signingConfirmation.mjs";
// Only called by a future private worker after committed evidence.
// store.claim MUST be durable, one per agreement, and return fresh committed
// agreement/group/evidence/account. Never retry an ambiguous provider outcome automatically.
export async function sendSigningConfirmationOnce({agreementId,store}){
 if(!signingArchiveEnabled()||process.env.AADLAND_SIGNING_CONFIRMATION_ENABLED!=="true")return {status:"disabled"};
 const apiKey=rentalResendApiKey();if(!apiKey)return {status:"unavailable"};
 const claimed=await store.claim(agreementId);
 if(claimed?.status!=="claimed")return {status:"not_claimed"};
 try{
  const payload=signingConfirmationPayload({...claimed,key:evidenceKey(claimed.record?.key_id)});
  if(!payload){await store.markReview(agreementId);return {status:"review"};}
  const {idempotencyKey,...message}=payload;
  const client=new Resend(apiKey);
  const result=await client.emails.send({from:rentalEmailFrom(),replyTo:rentalReplyTo(),...message},{idempotencyKey});
  if(result?.error||!result?.data?.id){await store.markReview(agreementId);return {status:"review"};}
  await store.markAccepted(agreementId,result.data.id);
  return {status:"accepted"};
 }catch{
  // If recording acceptance failed, leave claim blocked for manual review.
  try{await store.markReview(agreementId);}catch{}
  return {status:"review"};
 }
}
