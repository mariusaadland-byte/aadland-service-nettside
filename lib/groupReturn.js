import "server-only";
import {db} from "./supabase";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {unitReturnInput,resolutionInput,refundReviewDigest} from "./groupReturn.mjs";
export const groupReturnEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_RETURN_ENABLED==="true";
export async function ownerGroupReturn(actorId,body){
 if(!groupReturnEnabled()||!rentalUnitId(actorId)||!rentalUnitId(body?.groupId))return {status:"disabled"};
 const s=db();if(!s)return {status:"unconfirmed"};
 const call=async(name,args)=>{const r=await s.rpc(name,args);if(r.error)throw Error("RETURN_UNCONFIRMED");return {status:r.data};};
 if(body.action==="receive"){
  const x=unitReturnInput(body,actorId);if(!x)return {status:"invalid"};
  return call("draft_group_unit_receive",{p_group:x.groupId,p_booking:x.bookingId,p_unit:x.unitId,p_receipt:x.receiptId,p_actor:actorId,p_condition:x.condition,p_note:x.note,p_digest:x.digest});
 }
 if(body.action==="resolve"){
  const x=resolutionInput(body,actorId);if(!x)return {status:"invalid"};
  return call("draft_group_unit_release_after_inspection",{p_group:body.groupId,p_booking:body.bookingId,p_unit:x.unitId,p_actor:actorId,p_event:body.maintenanceEventId,p_proof:x.digest});
 }
 if(body.confirmed!==true||!rentalUnitId(body.requestId))return {status:"invalid"};
 if(body.action==="plan")return call("draft_group_clean_refund_plan",{p_group:body.groupId,p_request:body.requestId,p_actor:actorId,p_review:refundReviewDigest(body.groupId,body.requestId,actorId)});
 if(body.action==="record_refund"){
  if(!Number.isSafeInteger(body.amountOre)||body.amountOre<0||body.amountOre>2147483647||body.amountOre>0&&(typeof body.reference!=="string"||!body.reference.trim()||body.reference.length>200||typeof body.proofDigest!=="string"||! /^[a-f0-9]{64}$/.test(body.proofDigest)))return {status:"invalid"};
  return call("draft_group_refund_with_evidence",{p_group:body.groupId,p_request:body.requestId,p_actor:actorId,p_amount:body.amountOre,p_reference:body.amountOre?body.reference.trim():null,p_proof:body.amountOre?body.proofDigest:null});
 }
 return {status:"invalid"};
}
