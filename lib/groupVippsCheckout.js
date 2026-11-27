import "server-only";
import {db} from "./supabase";
import {checkoutSigningEnabled} from "./checkoutSigning";
import {vippsPublicPaymentsEnabled,vippsPaymentsEnabled,createVippsPayment,getVippsPayment} from "./vippsClient";
import {vippsUnitConfig} from "./vippsConfig";
import {evidenceKey} from "./signingArchiveConfig";
import {isGroupVippsReference} from "./rentalGroupVipps.mjs";
import {sendGroupConfirmationOnce} from "./rentalGroupConfirmationEmail";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {groupPaymentDraftStore} from "./groupPaymentBridge.mjs";
import {startGroupPayment,groupPaymentStatus} from "./groupVippsCheckout.mjs";
import {ownerPaymentCheck} from "./ownerGroupPaymentCheck.mjs";
export const groupVippsCheckoutEnabled=()=>checkoutSigningEnabled()&&groupVippsReconcileEnabled()&&process.env.AADLAND_GROUP_VIPPS_ENABLED==="true"&&vippsPublicPaymentsEnabled("rental")&&vippsUnitConfig("rental").configured;
export const groupVippsReconcileEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_RECONCILE_ENABLED==="true"&&vippsPaymentsEnabled("rental")&&vippsUnitConfig("rental").configured;
const terminalReleaseEnabled=()=>groupVippsReconcileEnabled()&&process.env.AADLAND_GROUP_TERMINAL_RELEASE_ENABLED==="true";
const value=r=>{if(r.error)throw Error("GROUP_PAYMENT_UNCONFIRMED");return r.data;};
const provider={create:plan=>createVippsPayment({...plan,unit:"rental"}),get:ref=>getVippsPayment("rental",ref)};
async function load(s,groupId,customerId){
 let q=s.from("rental_order_groups").select("*").eq("id",groupId);
 if(customerId)q=q.eq("customer_user_id",customerId);
 const group=value(await q.maybeSingle());if(!group)return null;
 const claim=value(await s.from("rental_group_payment_claims").select("*").eq("group_id",group.id).maybeSingle());
 return {group,claim};
}
export async function groupVippsCustomerAction(customerId,groupId,action){
 if(!groupVippsCheckoutEnabled()||!rentalUnitId(customerId)||!rentalUnitId(groupId))return {status:"disabled"};
 const s=db();if(!s)return {status:"unconfirmed"};
 const latest=await load(s,groupId,customerId);if(!latest)return {status:"review"};
 const store=groupPaymentDraftStore(s,terminalReleaseEnabled());
 if(action==="status"||latest.claim||latest.group.status!=="held"){const r=await groupPaymentStatus({...latest,store,provider});if(r.status==="confirmed")try{await sendGroupConfirmationOnce(groupId);}catch{}return r;}
 if(action!=="start")return {status:"review"};
 const pointer=value(await s.from("aadland_agreement_current").select("*").eq("group_id",groupId).maybeSingle());
 if(!pointer)return {status:"review"};
 const [a,e,auth]=await Promise.all([s.from("aadland_agreements").select("*").eq("id",pointer.agreement_id).eq("group_id",groupId).eq("customer_user_id",customerId).maybeSingle(),s.from("aadland_signing_evidence").select("*").eq("agreement_id",pointer.agreement_id).maybeSingle(),s.auth.admin.getUserById(customerId)]);
 const agreement=value(a),record=value(e),account=auth.data?.user;
 if(auth.error||account?.id!==customerId||!account.email_confirmed_at||typeof account.email!=="string"||agreement?.signing_email!==account.email.trim().toLowerCase()||!record)return {status:"review"};
 return startGroupPayment({group:latest.group,customerId,agreement,pointer,record,key:evidenceKey(record.key_id),now:new Date().toISOString(),store,provider,reload:()=>load(s,groupId,customerId)});
}

 // Only call after authenticated rental webhook. Never use payload payment totals.
 export async function reconcileGroupVippsWebhook(reference){
  if(!groupVippsReconcileEnabled()||!isGroupVippsReference(reference))return {status:"disabled"};
  const s=db();if(!s)return {status:"unconfirmed"};
  const latest=await load(s,reference.slice(4),null);if(!latest||latest.group.payment_reference!==reference)return {status:"review"};
  const r=await groupPaymentStatus({...latest,store:groupPaymentDraftStore(s,terminalReleaseEnabled()),provider});
  if(r.status==="confirmed")try{await sendGroupConfirmationOnce(latest.group.id);}catch{}
  return {status:r.status};
 }

export const ownerGroupPaymentCheckEnabled=()=>groupVippsReconcileEnabled()&&process.env.AADLAND_GROUP_ADMIN_ENABLED==="true"&&process.env.AADLAND_GROUP_FOLLOWUP_ENABLED==="true"&&process.env.AADLAND_GROUP_OWNER_PAYMENT_CHECK_ENABLED==="true";
export async function ownerGroupPaymentAction(groupId,action,expected){
 if(!ownerGroupPaymentCheckEnabled()||!rentalUnitId(groupId))return {status:"disabled"};
 const s=db();if(!s)return {status:"unconfirmed"};
 const latest=await load(s,groupId,null);if(!latest)return {status:"review"};
 return ownerPaymentCheck({...latest,action,expected,terminalEnabled:terminalReleaseEnabled(),store:groupPaymentDraftStore(s,terminalReleaseEnabled()),provider:{get:ref=>getVippsPayment("rental",ref)}});
}
