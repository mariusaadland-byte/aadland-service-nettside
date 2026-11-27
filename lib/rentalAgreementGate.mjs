// Server-side only. Inputs must be fresh committed archive/group rows, not request JSON.
import {archiveAccess,archiveDocument,checkedEvidence} from "./signingArchiveDownload.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
export function verifiedCurrentRentalAgreement({group,agreement,pointer,record,key,now}){
 if(!checkFrozenGroupQuote(group)||!rentalUnitId(group?.customer_user_id)||!archiveAccess({actor:{kind:"customer",id:group.customer_user_id},agreement,group}))return null;
 if(pointer?.group_id!==group.id||pointer?.agreement_id!==agreement.id||agreement.quote_digest!==group.quote_digest||agreement.terms_version!==group.terms_version)return null;
 if(!Number.isSafeInteger(agreement.revision)||agreement.revision<1||!archiveDocument(agreement))return null;
 const e=checkedEvidence({agreement,record,key});
 if(!e)return null;
 const clock=Date.parse(now),signed=Date.parse(e.signedAt),created=Date.parse(agreement.created_at);
 if(!Number.isFinite(clock)||!Number.isFinite(signed)||!Number.isFinite(created)||signed<created||signed>clock)return null;
 return {agreementId:agreement.id,revision:agreement.revision,documentDigest:agreement.document_digest,quoteDigest:agreement.quote_digest,termsVersion:agreement.terms_version,signedAt:e.signedAt,challengeId:e.challengeId};
}
// Decision model only: future grouped pickup transaction must verify all facts
// under group lock. Never prevent accepting physical return due to paperwork.
export function rentalGroupOperationDecision({operation,group,agreement,pointer,record,key,now,payment,deposit,controlReportVerified,identityChecked,identityCheckRequired}){
 if(operation==="accept_physical_return")return {action:"accept_return",review:controlReportVerified!==true};
 if(operation==="return_settlement")return {action:"manual_review",reason:"Separate condition report, evidence and financial review required"};
 if(operation!=="handover")return {action:"blocked",reason:"unknown_operation"};
 if(!group||group.status!=="confirmed")return {action:"blocked",reason:"group_not_confirmed"};
 const signature=verifiedCurrentRentalAgreement({group,agreement,pointer,record,key,now});
 if(!signature)return {action:"blocked",reason:"current_signature_missing"};
 if(!Number.isSafeInteger(group.payable_ore)||group.payable_ore<100||payment?.reference!==group.payment_reference||!group.payment_reference||payment.currency!=="NOK"||payment.capturedOre!==group.payable_ore||payment.refundedOre!==0)return {action:"blocked",reason:"payment_not_verified"};
 if(!Number.isSafeInteger(group.deposit_ore)||group.deposit_ore<0||group.deposit_ore>0&&(deposit?.verified!==true||deposit.heldOre!==group.deposit_ore))return {action:"blocked",reason:"deposit_not_verified"};
 if(controlReportVerified!==true)return {action:"blocked",reason:"handover_report_missing"};
 if(typeof identityCheckRequired!=="boolean"||identityCheckRequired&&identityChecked!==true)return {action:"blocked",reason:"identity_check_required"};
 return {action:"handover_candidate",signature};
}
