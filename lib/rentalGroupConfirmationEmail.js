import "server-only";
import {db} from "./supabase";
import {vippsUnitConfig} from "./vippsConfig";
import {vippsPaymentsEnabled,getVippsPayment} from "./vippsClient";
import {evidenceKey} from "./signingArchiveConfig";
import {rentalResendApiKey,rentalEmailFrom,rentalReplyTo} from "./rentalEmailConfig";
import {Resend} from "./safeResend";
import {paidGroupConfirmation} from "./paidGroupConfirmation.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export async function sendGroupConfirmationOnce(groupId){
 if(process.env.VERCEL_ENV!=="production"||process.env.AADLAND_GROUP_RECONCILE_ENABLED!=="true"||process.env.AADLAND_GROUP_CONFIRMATION_ENABLED!=="true"||!vippsPaymentsEnabled("rental")||!vippsUnitConfig("rental").configured||!rentalUnitId(groupId))return {status:"disabled"};
 const s=db(),apiKey=rentalResendApiKey();if(!s||!apiKey)return {status:"unavailable"};
 const value=r=>{if(r.error)throw Error("CONFIRMATION_UNCONFIRMED");return r.data;};
 const started=await s.rpc("draft_group_confirmation_claim",{p_group:groupId});
 if(started.error)return {status:"unavailable"};if(started.data!==true)return {status:"not_claimed"};
 const finish=async provider=>value(await s.rpc("draft_group_confirmation_finish",{p_group:groupId,p_provider:provider}))===true;
 try{
 const group=value(await s.from("rental_order_groups").select("*").eq("id",groupId).single());
 const claim=value(await s.from("rental_group_payment_claims").select("*").eq("group_id",groupId).single());
 const pointer=value(await s.from("aadland_agreement_current").select("*").eq("group_id",groupId).single());
 const [a,e,auth]=await Promise.all([s.from("aadland_agreements").select("*").eq("id",pointer.agreement_id).eq("group_id",groupId).eq("customer_user_id",group.customer_user_id).single(),s.from("aadland_signing_evidence").select("*").eq("agreement_id",pointer.agreement_id).single(),s.auth.admin.getUserById(group.customer_user_id)]);
 if(auth.error)throw Error("AUTH");
 const agreement=value(a),record=value(e),payment=await getVippsPayment("rental",claim.reference);
 const payload=paidGroupConfirmation({group,claim,agreement,pointer,record,account:auth.data?.user,key:evidenceKey(record.key_id),payment,now:new Date().toISOString()});
 if(!payload)throw Error("PROOF");
 const {idempotencyKey,...message}=payload;
 const r=await new Resend(apiKey).emails.send({from:rentalEmailFrom(),replyTo:rentalReplyTo(),...message},{idempotencyKey});
 if(r.error||!r.data?.id)throw Error("SEND");
 return {status:await finish(r.data.id)?"accepted":"review"};
 }catch{try{await finish(null);}catch{}return {status:"review"};}
}
