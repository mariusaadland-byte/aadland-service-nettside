import "server-only";
import {sendManualOrderRefundNotice} from "./orderRefundNotice";
import {sendManualRentalRefundNotice} from "./rentalRefundNotice";

async function releaseClaim(s,unit,id,claimedTotalOre){
 const {error}=await s.rpc("release_vipps_refund_notice_claim",{
  target_unit:unit,
  target_id:id,
  claimed_total_ore:claimedTotalOre
 });
 if(error)console.error("VIPPS REFUND NOTICE CLAIM RELEASE ERROR",{unit,id,message:error.message});
}

export async function sendVippsRefundNoticeIfNeeded({s,unit,id,req}){
 const key=unit==="rental"?"rental":"service";
 const {data:claim,error:claimError}=await s.rpc("claim_vipps_refund_notice",{
  target_unit:key,
  target_id:id
 });
 if(claimError)throw claimError;
 if(!claim?.claimed)return {sent:false,reason:"not-claimed"};

 const claimedTotalOre=Math.max(0,Number(claim.totalOre)||0);
 const refundOre=Math.max(0,Number(claim.refundOre)||0);
 if(claimedTotalOre<=0||refundOre<=0){
  await releaseClaim(s,key,id,claimedTotalOre);
  return {sent:false,reason:"amount-invalid"};
 }

 try{
  const table=key==="rental"?"rental_bookings":"orders";
  const select=key==="rental"?"*,rental_items(name)":"*";
  const {data:row,error}=await s.from(table).select(select).eq("id",id).maybeSingle();
  if(error)throw error;
  if(!row){
   await releaseClaim(s,key,id,claimedTotalOre);
   return {sent:false,reason:"missing"};
  }

  const reference=String(row.payment_psp_reference||row.payment_reference||"Vipps").trim();
  const note="Tilbakebetalt via Vipps";
  const idempotencyKey="payment-refund/"+key+"/"+id+"/"+claimedTotalOre;

  const result=key==="rental"
   ?await sendManualRentalRefundNotice({
      s,
      booking:row,
      req,
      refundOreOverride:refundOre,
      refundedTotalOreOverride:claimedTotalOre,
      refundReferenceOverride:reference,
      refundNoteOverride:note,
      idempotencyKey,
      stampNotice:false
    })
   :await sendManualOrderRefundNotice({
      s,
      order:row,
      requestOrigin:(()=>{try{return req?new URL(req.url).origin:"";}catch{return "";}})(),
      refundOreOverride:refundOre,
      refundedTotalOreOverride:claimedTotalOre,
      refundReferenceOverride:reference,
      refundNoteOverride:note,
      idempotencyKey,
      stampNotice:false
    });

  const {data:completed,error:completeError}=await s.rpc("complete_vipps_refund_notice",{
   target_unit:key,
   target_id:id,
   claimed_total_ore:claimedTotalOre
  });
  if(completeError)throw completeError;
  if(completed!==true)throw new Error("VIPPS_REFUND_NOTICE_COMPLETE_FAILED");

  return {
   sent:true,
   sentTo:result.sentTo,
   sentAt:result.sentAt,
   refundOre,
   refundedTotalOre:claimedTotalOre,
   remainingOre:result.remainingOre
  };
 }catch(error){
  await releaseClaim(s,key,id,claimedTotalOre);
  throw error;
 }
}
