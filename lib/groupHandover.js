import "server-only";
import {db} from "./supabase";
import {groupVippsReconcileEnabled,reconcileGroupVippsWebhook} from "./groupVippsCheckout";
import {getVippsPayment,captureVippsPayment} from "./vippsClient";
import {controlledGroupCapture,handoverReport} from "./groupHandover.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {verifiedCurrentRentalAgreement} from "./rentalAgreementGate.mjs";
import {evidenceKey} from "./signingArchiveConfig";
export const groupHandoverEnabled=()=>groupVippsReconcileEnabled()&&process.env.AADLAND_GROUP_HANDOVER_ENABLED==="true";
export async function ownerGroupHandover(actorId,body){
 if(!groupHandoverEnabled()||!rentalUnitId(actorId)||!rentalUnitId(body?.groupId))return {status:"disabled"};
 const s=db();if(!s)return {status:"unconfirmed"};
 const val=r=>{if(r.error)throw Error("HANDOVER_UNCONFIRMED");return r.data;};
 const group=val(await s.from("rental_order_groups").select("*").eq("id",body.groupId).maybeSingle());
 if(!group)return {status:"review"};
 const call=async(name,params)=>val(await s.rpc(name,params));
 if(body.action==="deposit"){
  if(body.confirmed!==true||typeof body.reference!=="string"||typeof body.proofDigest!=="string"||!Number.isSafeInteger(body.amountOre))return {status:"invalid"};
  return {status:await call("draft_group_deposit_with_evidence",{p_group:group.id,p_reference:body.reference,p_amount:body.amountOre,p_proof:body.proofDigest,p_actor:actorId})};
 }
 const claim=val(await s.from("rental_group_payment_claims").select("*").eq("group_id",group.id).maybeSingle());
 if(!claim)return {status:"review"};
 const pointer=val(await s.from("aadland_agreement_current").select("*").eq("group_id",group.id).maybeSingle());
 if(!pointer)return {status:"review"};
 const [a,e]=await Promise.all([s.from("aadland_agreements").select("*").eq("id",pointer.agreement_id).eq("group_id",group.id).single(),s.from("aadland_signing_evidence").select("*").eq("agreement_id",pointer.agreement_id).single()]);
 const agreement=val(a),record=val(e),signature=verifiedCurrentRentalAgreement({group,agreement,pointer,record,key:evidenceKey(record?.key_id),now:new Date().toISOString()});
 if(!signature||claim.agreement_id!==agreement.id||claim.document_digest!==agreement.document_digest||claim.evidence_seal!==record.evidence_seal)return {status:"review"};
 if(body.action==="prepare"){
  const r=handoverReport({...body,actorId});if(!r)return {status:"invalid"};
  return {status:await call("draft_group_prepare_handover",{p_group:r.groupId,p_report:r.reportId,p_actor:actorId,p_note:r.note,p_digest:r.digest,p_units:r.units,p_identity:true,p_condition:true,p_instructions:true})};
 }
 if(body.confirmed!==true||!rentalUnitId(body.reportId))return {status:"invalid"};
 if(body.action==="capture"){
  if(process.env.AADLAND_GROUP_CAPTURE_ENABLED!=="true")return {status:"disabled"};
  const r=await controlledGroupCapture({group,claim,reportId:body.reportId,actorId,provider:{get:ref=>getVippsPayment("rental",ref),capture:(ref,amount,opts)=>captureVippsPayment("rental",ref,amount,opts)},store:{claim:x=>call("draft_group_capture_claim",{p_group:x.groupId,p_report:x.reportId,p_actor:x.actorId,p_psp:x.psp,p_amount:x.amountOre})}});
  if(r.status!=="reconcile")return r;
  return reconcileGroupVippsWebhook(claim.reference);
 }
 if(body.action==="handover"){
  const r=await reconcileGroupVippsWebhook(claim.reference);if(r.status!=="confirmed")return {status:"review"};
  const fresh=val(await s.from("rental_group_payment_claims").select("*").eq("group_id",group.id).single());
  return {status:await call("draft_group_verified_handover",{p_group:group.id,p_report:body.reportId,p_reference:fresh.reference,p_psp:fresh.psp_reference})};
 }
 return {status:"invalid"};
}
