import "server-only";
import {damagePortalEnabled} from "./customerDamageClaims";
import {damageNoticePayload} from "./damagePublication.mjs";
import {rentalResendApiKey,rentalEmailFrom,rentalReplyTo} from "./rentalEmailConfig";
import {Resend} from "./safeResend";
import {db} from "./supabase";
// Private worker entry only; no cron/public route. A claimed job is never auto retried.
export async function sendDamageNoticeOnce(id){
 if(!damagePortalEnabled()||process.env.AADLAND_DAMAGE_NOTICE_ENABLED!=="true")return {status:"disabled"};
 const s=db(),apiKey=rentalResendApiKey();if(!s||!apiKey)return {status:"unavailable"};
 const claim=await s.rpc("draft_damage_notice_claim",{p_claim:id});if(claim.error||claim.data!==true)return {status:"not_claimed"};
 async function finish(provider){const r=await s.rpc("draft_damage_notice_finish",{p_claim:id,p_provider:provider});return !r.error&&r.data===true;}
 try{
 const c=await s.from("rental_group_damage_claims").select("*").eq("id",id).single();if(c.error)throw Error("claim");
 const g=await s.from("rental_order_groups").select("id,customer_user_id").eq("id",c.data.group_id).single();if(g.error)throw Error("group");
 const account=await s.auth.admin.getUserById(g.data.customer_user_id);if(account.error)throw Error("account");
 const payload=damageNoticePayload({claim:c.data,group:g.data,account:account.data?.user});if(!payload)throw Error("payload");
 const {idempotencyKey,...message}=payload;
 const result=await new Resend(apiKey).emails.send({from:rentalEmailFrom(),replyTo:rentalReplyTo(),...message},{idempotencyKey});
 if(result.error||!result.data?.id)throw Error("provider");
 return {status:await finish(result.data.id)?"accepted":"review"};
 }catch{try{await finish(null);}catch{}return {status:"review"};}
}
