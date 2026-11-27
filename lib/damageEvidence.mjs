import {createHash} from "node:crypto";
import {conditionImageValid,CONDITION_TYPES} from "./rentalConditionPhotos.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const DAMAGE_MAX_BYTES=3*1024*1024;
export const DAMAGE_BUCKET="rental-damage-evidence";
export const digestValid=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export function damagePhoto(bytes,type){
 if(!Buffer.isBuffer(bytes)||bytes.length>DAMAGE_MAX_BYTES||!conditionImageValid(type,bytes))return null;
 return {digest:createHash("sha256").update(bytes).digest("hex"),type,extension:CONDITION_TYPES[type],size:bytes.length};
}
export function damagePhotoPath(groupId,bookingId,digest){
 if(!rentalUnitId(groupId)||!rentalUnitId(bookingId)||!digestValid(digest))return null;
 return groupId.toLowerCase()+"/"+bookingId.toLowerCase()+"/"+digest;
}
export function damageClaimProjection({actor,group,booking,claim,response}){
 if(!rentalUnitId(actor?.id)||!rentalUnitId(claim?.id)||!rentalUnitId(group?.id)||!rentalUnitId(booking?.id)||claim.group_id!==group.id||claim.booking_id!==booking.id||booking.group_id!==group.id||booking.customer_user_id!==group.customer_user_id||!(actor.kind==="owner"||actor.kind==="customer"&&actor.id===group.customer_user_id))return null;
 if(!Number.isSafeInteger(claim.amount_ore)||claim.amount_ore<=0||!digestValid(claim.claim_digest)||!digestValid(claim.cost_proof_digest)||!Array.isArray(claim.photo_digests)||claim.photo_digests.length<1||claim.photo_digests.length>12||!claim.photo_digests.every(digestValid)||typeof claim.description!=="string"||!claim.description.trim()||claim.description.length>2000)return null;
 if(response&&(response.claim_id!==claim.id||response.customer_id!==group.customer_user_id||response.claim_digest!==claim.claim_digest||!["accepted","disputed"].includes(response.response)))return null;
 return {id:claim.id,orderNumber:String(group.order_number),description:claim.description,amountOre:claim.amount_ore,depositOre:group.deposit_ore,claimDigest:claim.claim_digest,photos:claim.photo_digests.map(d=>({digest:d,url:"/api/customer/damage-photo/"+claim.id+"/"+d})),response:response?.response??null,note:response?.note??""};
}
export function damageResponseInput(body){
 if(!rentalUnitId(body?.claimId)||!digestValid(body?.claimDigest)||!["accepted","disputed"].includes(body?.response)||typeof body?.note!=="string"||body.note.length>2000)return null;
 return {claimId:body.claimId,claimDigest:body.claimDigest,response:body.response,note:body.note};
}
