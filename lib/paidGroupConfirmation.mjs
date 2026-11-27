import {verifiedCurrentRentalAgreement} from "./rentalAgreementGate.mjs";
import {signingConfirmationPayload} from "./signingConfirmation.mjs";
import {groupVippsReconcile} from "./rentalGroupVipps.mjs";
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export function paidGroupConfirmation({group,claim,agreement,pointer,record,account,key,payment,now}){
 if(!["confirmed","fulfilled"].includes(group?.status)||claim?.group_id!==group.id||claim.agreement_id!==agreement?.id||claim.document_digest!==agreement.document_digest||claim.evidence_seal!==record?.evidence_seal||claim.amount_ore!==group.payable_ore||claim.reference!==group.payment_reference||!claim.captured_at||!claim.psp_reference)return null;
 const d=groupVippsReconcile({group:{...group,payment_psp_reference:claim.psp_reference},payment,unit:"rental"});
 if(d.action!=="no_change"||d.capturedOre!==group.payable_ore||d.refundedOre!==0||d.pspReference!==claim.psp_reference)return null;
 if(!verifiedCurrentRentalAgreement({group,agreement,pointer,record,key,now})||agreement.signing_email!==account?.email?.trim().toLowerCase())return null;
 const mail=signingConfirmationPayload({agreement,group,record,account,key});if(!mail)return null;
 return {...mail,subject:"Bestillingsbekreftelse – Aadland Utleie",text:"Bestilling "+String(group.order_number)+" er bekreftet. Vi har registrert leiebetalingen på "+kr(group.payable_ore)+".\nDepositum (separat): "+kr(group.deposit_ore)+".\n\nVedlagt ligger original leieavtale og signeringsbevis. Utlevering og retur avtales separat. Logg inn på https://www.aadlandutleie.no/min-side/signering for avtalen din.\n\nDette er en bestillingsbekreftelse, ikke en faktura eller bekreftelse på betalt depositum.\n\nAadland Utleie",idempotencyKey:"aadland-group-confirmation/"+group.id};
}
