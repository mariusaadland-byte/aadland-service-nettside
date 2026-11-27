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
 if(d.action!=="confirm_once")return {status:d.action};
 const r=await store.confirm({groupId:group.id,reference:group.payment_reference,psp:d.pspReference,currency:"NOK",authorized:d.authorizedOre,captured:d.capturedOre,cancelled:d.cancelledOre,refunded:d.refundedOre});
 return {status:["confirmed","existing"].includes(r)?"confirmed":"review"};
}
export function groupPaymentDraftStore(s){
 async function call(name,params){const r=await s.rpc(name,params);if(r.error)throw Error("PAYMENT_UNCONFIRMED");return r.data;}
 return {claim:x=>call("draft_group_payment_claim",{p_group:x.groupId,p_customer:x.customerId,p_agreement:x.agreementId,p_document:x.documentDigest,p_seal:x.evidenceSeal,p_amount:x.amountOre}),confirm:x=>call("draft_group_payment_confirm",{p_group:x.groupId,p_reference:x.reference,p_psp:x.psp,p_currency:x.currency,p_authorized:x.authorized,p_captured:x.captured,p_cancelled:x.cancelled,p_refunded:x.refunded})};
}
