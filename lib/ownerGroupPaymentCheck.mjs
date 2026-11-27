import {createHash} from "node:crypto";
import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
import {groupVippsReference,groupVippsReconcile} from "./rentalGroupVipps.mjs";
import {reconcileGroupPayment} from "./groupPaymentBridge.mjs";
export async function ownerPaymentCheck({group,claim,action,expected,provider,store,terminalEnabled=false}){
 const ref=groupVippsReference(group?.id);
 if(!ref||!checkFrozenGroupQuote(group)||group.payment_reference!==ref||claim?.group_id!==group.id||claim.reference!==ref||claim.amount_ore!==group.payable_ore)return {status:"review"};
 if(!["check","apply"].includes(action))return {status:"invalid"};
 let payment;try{payment=await provider.get(ref);}catch{return {status:"unconfirmed"};}
 const current={...group,payment_psp_reference:claim.psp_reference},d=groupVippsReconcile({group:current,payment,unit:"rental"});
 if(!Number.isSafeInteger(d.authorizedOre))return {status:"review"};
 const facts={reference:ref,state:d.state,authorizedOre:d.authorizedOre,cancelledOre:d.cancelledOre,capturedOre:d.capturedOre,refundedOre:d.refundedOre,openOre:d.openOre};
 const decision=d.action==="confirm_once"?"confirm":d.action==="release_candidate"&&terminalEnabled?"release":null;
 const digest=createHash("sha256").update(JSON.stringify([group.id,group.status,group.quote_digest,claim.psp_reference??null,claim.captured_at??null,d.pspReference,d.action,facts,decision])).digest("hex");
 const response={status:"checked",facts,decision,digest,providerDecision:d.action,checkedAt:new Date().toISOString()};
 if(action==="check")return response;
 if(!decision||typeof expected!=="string"||expected!==digest)return {...response,status:"changed"};
 if(decision==="release"&&typeof store.release!=="function")return {status:"review"};
 try{
  const result=await reconcileGroupPayment({group:current,payment,store});
  if(!["confirmed","released"].includes(result.status))return {...response,status:"review",decision:null};
  return {...response,status:result.status,decision:null};
 }catch{return {status:"unconfirmed"};}
}
