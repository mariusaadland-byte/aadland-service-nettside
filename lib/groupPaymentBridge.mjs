import {groupVippsCreatePlan,groupVippsReconcile} from "./rentalGroupVipps.mjs";
// Private bridge, deliberately does not call Vipps. Claim binds payment before
// any future external creation. Provider status must originate from authenticated GET.
export async function prepareGroupPayment({group,customerId,agreement,pointer,record,key,now,store}){
 let signedEmail;try{signedEmail=JSON.parse(record?.evidence_text||"{}").email;}catch{return {status:"review"};}
 if(!agreement?.signing_email||agreement.signing_email!==signedEmail)return {status:"review"};
 const plan=groupVippsCreatePlan({group,customerId,agreement,pointer,record,key,now});
 if(!plan)return {status:"review"};
 if(plan.action==="reconcile_existing")return {status:"reconcile",reference:plan.reference};
 const result=await store.claim({groupId:group.id,customerId,agreementId:plan.signature.agreementId,documentDigest:plan.signature.documentDigest,evidenceSeal:record.evidence_seal,amountOre:plan.amountOre});
 if(result==="existing")return {status:"reconcile",reference:plan.reference};
 if(result!=="claimed")return {status:"review"};
 return {status:"claimed",plan};
}
export async function reconcileGroupPayment({group,payment,store}){
 const d=groupVippsReconcile({group,payment,unit:"rental"});
 if((d.action==="release_candidate"||group.status==="released"&&d.action==="no_change")&&["ABORTED","EXPIRED","TERMINATED"].includes(d.state)&&d.openOre===0&&d.capturedOre===0&&d.refundedOre===0&&typeof store.release==="function"){
  const r=await store.release({groupId:group.id,reference:group.payment_reference,psp:d.pspReference,state:d.state,currency:"NOK",authorized:d.authorizedOre,cancelled:d.cancelledOre,captured:d.capturedOre,refunded:d.refundedOre,checkedAt:new Date().toISOString()});
  return {status:["released","existing"].includes(r)?"released":"review"};
 }
 if(d.action!=="confirm_once")return {status:d.action};
 const r=await store.confirm({groupId:group.id,reference:group.payment_reference,psp:d.pspReference,currency:"NOK",authorized:d.authorizedOre,captured:d.capturedOre,cancelled:d.cancelledOre,refunded:d.refundedOre});
 return {status:["confirmed","existing"].includes(r)?"confirmed":"review"};
}
export function groupPaymentDraftStore(s,terminalReleaseEnabled=false){
 async function call(name,params){const r=await s.rpc(name,params);if(r.error)throw Error("PAYMENT_UNCONFIRMED");return r.data;}
 return {...(terminalReleaseEnabled?{release:x=>call("draft_group_release_terminal",{p_group:x.groupId,p_reference:x.reference,p_psp:x.psp,p_state:x.state,p_currency:x.currency,p_authorized:x.authorized,p_cancelled:x.cancelled,p_captured:x.captured,p_refunded:x.refunded,p_checked:x.checkedAt})}:{}),claim:x=>call("draft_group_payment_claim",{p_group:x.groupId,p_customer:x.customerId,p_agreement:x.agreementId,p_document:x.documentDigest,p_seal:x.evidenceSeal,p_amount:x.amountOre}),confirm:x=>call("draft_group_payment_confirm",{p_group:x.groupId,p_reference:x.reference,p_psp:x.psp,p_currency:x.currency,p_authorized:x.authorized,p_captured:x.captured,p_cancelled:x.cancelled,p_refunded:x.refunded})};
}
