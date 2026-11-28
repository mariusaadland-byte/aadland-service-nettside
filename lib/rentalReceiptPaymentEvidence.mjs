import {groupVippsReconcile} from "./rentalGroupVipps.mjs";
import {rentalReceiptDraft} from "./rentalReceiptDraft.mjs";
// Server-side adapter only. Inputs must originate from authenticated merchant GET
// and persisted database claim, never a browser, redirect or webhook payload.
export function capturedRentalReceiptEvidence({group,claim,payment}={}){
 if(!group||!claim||!["confirmed","fulfilled"].includes(group.status)||claim.group_id!==group.id||claim.amount_ore!==group.payable_ore||claim.reference!==group.payment_reference||!claim.psp_reference||!claim.captured_at)return null;
 const facts=groupVippsReconcile({group:{...group,payment_psp_reference:claim.psp_reference},payment,unit:"rental"});
 if(facts.action!=="no_change"||facts.capturedOre!==group.payable_ore||facts.refundedOre!==0||facts.openOre!==0||facts.pspReference!==claim.psp_reference)return null;
 const event={groupId:group.id,kind:"payment",currency:"NOK",status:"confirmed",amountOre:facts.capturedOre,reference:claim.reference,eventId:claim.reference,confirmedAt:claim.captured_at,method:"Vipps"};
 const receipt=rentalReceiptDraft({group,event});
 return receipt?{event,receipt}:null;
}
