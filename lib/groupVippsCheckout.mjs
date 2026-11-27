import {prepareGroupPayment,reconcileGroupPayment} from "./groupPaymentBridge.mjs";
import {groupVippsReference,groupVippsReconcile} from "./rentalGroupVipps.mjs";
import {groupVippsRedirect} from "./groupVippsRedirect.mjs";
import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
// Provider and store are injected trusted server dependencies only.
export async function groupPaymentStatus({group,claim,store,provider}){
 const ref=groupVippsReference(group?.id);
 if(!ref||!checkFrozenGroupQuote(group)||group.payment_reference!==ref||claim?.group_id!==group.id||claim.reference!==ref||claim.amount_ore!==group.payable_ore)return {status:"review"};
 let payment;try{payment=await provider.get(ref);}catch{return {status:"unconfirmed"};}
 const current={...group,payment_psp_reference:claim.psp_reference};
 const decision=groupVippsReconcile({group:current,payment,unit:"rental"});
 if(decision.action==="await_customer"){
  const redirectUrl=groupVippsRedirect(payment.redirectUrl);
  return redirectUrl?{status:"await_customer",redirectUrl}:{status:"await_customer"};
 }
 if(decision.action==="no_change"&&["confirmed","fulfilled"].includes(group.status)&&claim.psp_reference===decision.pspReference&&claim.captured_at&&decision.capturedOre===group.payable_ore&&decision.refundedOre===0)return {status:"confirmed"};
 return reconcileGroupPayment({group:current,payment,store});
}
export async function startGroupPayment({group,customerId,agreement,pointer,record,key,now,store,provider,reload}){
 const r=await prepareGroupPayment({group,customerId,agreement,pointer,record,key,now,store});
 if(r.status==="reconcile"){const latest=await reload();return latest?groupPaymentStatus({...latest,store,provider}):{status:"unconfirmed"};}
 if(r.status!=="claimed")return {status:"review"};
 // Only first successful atomic claim may CREATE. Unknown outcome is GET-only
 // recovery, never an automatic second create after the idempotency window.
 try{
  const plan=r.plan;
  const p=await provider.create({...plan,returnUrl:"https://www.aadlandutleie.no/utleie/betaling?gruppe="+group.id});
  if(p?.reference!==plan.reference)return {status:"unconfirmed"};
  const redirectUrl=groupVippsRedirect(p.redirectUrl);
  return redirectUrl?{status:"await_customer",redirectUrl}:{status:"unconfirmed"};
 }catch{return {status:"unconfirmed"};}
}
