import {createHash} from "node:crypto";
import {damagePhoto,damagePhotoPath,DAMAGE_BUCKET,DAMAGE_MAX_BYTES,digestValid} from "./damageEvidence.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export function canonicalDamageClaim({id,group_id,booking_id,description,amount_ore,photo_digests,cost_proof_digest}={}){
 if(![id,group_id,booking_id].every(rentalUnitId)||typeof description!=="string"||!description.trim()||description!==description.trim()||description.length>2000||!Number.isSafeInteger(amount_ore)||amount_ore<=0||amount_ore>2147483647||!Array.isArray(photo_digests)||photo_digests.length<1||photo_digests.length>12||!photo_digests.every(digestValid)||new Set(photo_digests).size!==photo_digests.length||!digestValid(cost_proof_digest)||photo_digests.includes(cost_proof_digest))return null;
 return createHash("sha256").update(JSON.stringify(["aadland-damage-v1",id,group_id,booking_id,description,amount_ore,photo_digests,cost_proof_digest])).digest("hex");
}
export async function verifiedDamageObject(storage,path,digest){
 const result=await storage.download(path);
 if(result.error||!result.data||result.data.size>DAMAGE_MAX_BYTES)return false;
 const photo=damagePhoto(Buffer.from(await result.data.arrayBuffer()),result.data.type);
 return photo?.digest===digest;
}
export async function storeDamageObject({storage,groupId,bookingId,bytes,type}){
 const photo=damagePhoto(bytes,type),path=photo&&damagePhotoPath(groupId,bookingId,photo.digest);
 if(!path)return null;
 // Never overwrite evidence; only reuse if the stored bytes match.
 await storage.upload(path,bytes,{contentType:type,upsert:false});
 return await verifiedDamageObject(storage,path,photo.digest)?photo:null;
}
export async function damagePublicationPlan({storage,group,booking,returned,claim}){
 if(!group||group.status!=="fulfilled"||!booking||booking.group_id!==group.id||booking.customer_user_id!==group.customer_user_id||!returned||returned.group_id!==group.id||returned.booking_id!==booking.id||!["damage","missing_accessory"].includes(returned.condition)||claim?.group_id!==group.id||claim?.booking_id!==booking.id)return null;
 const digest=canonicalDamageClaim(claim);if(!digest)return null;
 for(const d of [...claim.photo_digests,claim.cost_proof_digest]){
 const path=damagePhotoPath(group.id,booking.id,d);if(!path||!await verifiedDamageObject(storage,path,d))return null;
 }
 return {...claim,claim_digest:digest};
}
export function damageNoticePayload({claim,group,account}){
 if(!claim||!group||claim.group_id!==group.id||canonicalDamageClaim(claim)!==claim.claim_digest||account?.id!==group.customer_user_id||!account.email_confirmed_at||typeof account.email!=="string"||account.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email))return null;
 return {to:account.email,subject:"Ny skadesak – Aadland Utleie",text:"Du har en ny skadesak tilgjengelig på Min side. Logg inn på https://www.aadlandutleie.no/min-side/skadesaker for å se dokumentasjonen og gi tilbakemelding. Ingen automatisk belastning skjer som følge av dette varselet.\n\nAadland Utleie",idempotencyKey:"aadland-damage-notice/"+claim.id};
}
