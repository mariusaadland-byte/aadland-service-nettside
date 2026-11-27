import {createHash} from "node:crypto";
import {rentalUnitId} from "./rentalUnitQr.mjs";
const amount=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
export function groupVippsReference(id){return rentalUnitId(id)?"AUG-"+id.toLowerCase():null;}
export const isGroupVippsReference=ref=>typeof ref==="string"&&ref.startsWith("AUG-")&&rentalUnitId(ref.slice(4))&&ref===ref.toLowerCase().replace(/^aug-/,"AUG-");
export function groupVippsCreatePlan({group,customerId,signatureVerified,now}){
 if(!group||!rentalUnitId(customerId)||group.customer_user_id!==customerId||signatureVerified!==true||!amount(group.payable_ore)||group.payable_ore<100)return null;
 const ref=groupVippsReference(group.id);
 if(!ref)return null;
 const time=Date.parse(now),expiry=Date.parse(group.expires_at);
 if(!Number.isFinite(time)||!Number.isFinite(expiry))return null;
 if(group.status==="payment_pending"&&group.payment_reference===ref)return {action:"reconcile_existing",unit:"rental",reference:ref};
 if(group.status!=="held"||group.payment_reference!==null||time>=expiry)return null;
 return {action:"claim_then_create",unit:"rental",reference:ref,amountOre:group.payable_ore,idempotencyKey:createHash("sha256").update("rental-group-create:"+ref).digest("hex"),userFlow:"WEB_REDIRECT",description:"Aadland Utleie "+ref,returnUrl:"https://www.aadlandutleie.no/betaling/vipps?unit=rental&reference="+encodeURIComponent(ref)};
}
// Only consume a fresh authenticated GET from the rental merchant, not a webhook or redirect.
// A missing/partial aggregate is not proof that no funds are reserved or captured.
export function groupVippsReconcile({group,payment,unit}){
 const review={action:"review",release:false};
 if(unit!=="rental"||!group||!payment||!amount(group.payable_ore)||group.payable_ore<100)return review;
 const ref=groupVippsReference(group.id);
 if(!ref||group.payment_reference!==ref||payment.reference!==ref||payment.amount?.currency!=="NOK"||payment.amount?.value!==group.payable_ore)return review;
 if(typeof payment.pspReference!=="string"||!payment.pspReference.trim()||(group.payment_psp_reference&&group.payment_psp_reference!==payment.pspReference))return review;
 const a=payment.aggregate;
 const keys=["authorizedAmount","cancelledAmount","capturedAmount","refundedAmount"];
 if(!a||keys.some(k=>a[k]?.currency!=="NOK"||!amount(a[k]?.value)))return review;
 const [auth,cancel,capture,refund]=keys.map(k=>a[k].value);
 const expected=group.payable_ore;
 if(auth>expected||cancel+capture>auth||refund>capture)return review;
 const open=auth-cancel-capture;
 const state=payment.state;
 if(!["CREATED","AUTHORIZED","ABORTED","EXPIRED","TERMINATED"].includes(state))return review;
 const facts={authorizedOre:auth,cancelledOre:cancel,capturedOre:capture,refundedOre:refund,openOre:open,pspReference:payment.pspReference,state};
 const result=(action,release=false)=>({action,release,...facts});
 if(group.status==="released")return result(open>0||capture>0?"review_late_payment":"no_change");
 if(!["payment_pending","confirmed","fulfilled"].includes(group.status))return review;
 if(refund>0)return result("review_refund");
 if(capture===expected&&open===0&&state==="AUTHORIZED")return result(group.status==="payment_pending"?"confirm_once":"no_change");
 if(group.status!=="payment_pending")return result("review");
 if(capture>0)return result("review_partial_capture");
 if(["ABORTED","EXPIRED","TERMINATED"].includes(state)&&open===0)return result("release_candidate",true);
 if(state==="AUTHORIZED"&&open===expected)return result("authorized_not_captured");
 if(state==="CREATED"&&auth===0)return result("await_customer");
 return result("review");
}
