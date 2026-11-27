import "server-only";
import {db} from "./supabase";
import {signingArchiveEnabled} from "./signingArchiveConfig";
import {canonicalDamageClaim} from "./damagePublication.mjs";
import {damageClaimProjection} from "./damageEvidence.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const damagePortalEnabled=()=>signingArchiveEnabled()&&process.env.AADLAND_DAMAGE_PORTAL_ENABLED==="true";
export async function customerDamageClaims(customerId,claimId){
 if(!damagePortalEnabled()||!rentalUnitId(customerId)||claimId!==undefined&&!rentalUnitId(claimId))return {ok:false};
 const s=db();if(!s)return {ok:false};
 try{
 const groups=await s.from("rental_order_groups").select("id,customer_user_id,order_number,deposit_ore",{count:"exact"}).eq("customer_user_id",customerId).limit(50);
 if(groups.error||!Array.isArray(groups.data)||groups.count!==groups.data.length)return {ok:false};
 if(!groups.data.length)return {ok:true,rows:[]};
 let q=s.from("rental_group_damage_claims").select("id,group_id,booking_id,description,amount_ore,photo_digests,cost_proof_digest,claim_digest",{count:"exact"}).in("group_id",groups.data.map(g=>g.id)).limit(50);
 if(claimId!==undefined)q=q.eq("id",claimId);
 const claims=await q;
 if(claims.error||!Array.isArray(claims.data)||claims.count!==claims.data.length)return {ok:false};
 if(!claims.data.length)return {ok:true,rows:[]};
 const [bookings,responses]=await Promise.all([
 s.from("rental_bookings").select("id,group_id,customer_user_id").eq("customer_user_id",customerId).in("id",claims.data.map(c=>c.booking_id)),
 s.from("rental_group_damage_responses").select("claim_id,customer_id,claim_digest,response,note").eq("customer_id",customerId).in("claim_id",claims.data.map(c=>c.id))]);
 if(bookings.error||responses.error||!Array.isArray(bookings.data)||!Array.isArray(responses.data))return {ok:false};
 const rows=[];
 for(const claim of claims.data){
 const group=groups.data.find(g=>g.id===claim.group_id),booking=bookings.data.find(b=>b.id===claim.booking_id),response=responses.data.find(r=>r.claim_id===claim.id);
 if(canonicalDamageClaim(claim)!==claim.claim_digest)return {ok:false};
 const projected=damageClaimProjection({actor:{kind:"customer",id:customerId},group,booking,claim,response});if(!projected)return {ok:false};
 rows.push({...projected,costDocument:{digest:claim.cost_proof_digest,url:"/api/customer/damage-photo/"+claim.id+"/"+claim.cost_proof_digest},groupId:group.id,bookingId:booking.id});
 }
 return {ok:true,rows};
 }catch{return {ok:false};}
}
