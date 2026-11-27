import "server-only";
import sharp from "sharp";
import {db} from "./supabase";
import {damagePortalEnabled} from "./customerDamageClaims";
import {DAMAGE_BUCKET,DAMAGE_MAX_BYTES,damagePhoto} from "./damageEvidence.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {storeDamageObject,damagePublicationPlan} from "./damagePublication.mjs";
export const damageWriteEnabled=()=>damagePortalEnabled()&&process.env.AADLAND_DAMAGE_WRITE_ENABLED==="true";
export async function damageWriteContext(groupId,bookingId){
 if(!damageWriteEnabled()||!rentalUnitId(groupId)||!rentalUnitId(bookingId))return null;
 const s=db();if(!s)return null;
 const [g,b,r,bucket]=await Promise.all([
 s.from("rental_order_groups").select("id,customer_user_id,status").eq("id",groupId).maybeSingle(),
 s.from("rental_bookings").select("id,group_id,customer_user_id").eq("id",bookingId).eq("group_id",groupId).maybeSingle(),
 s.from("rental_group_returns").select("group_id,booking_id,condition").eq("group_id",groupId).eq("booking_id",bookingId).maybeSingle(),
 s.storage.getBucket(DAMAGE_BUCKET)]);
 if([g,b,r,bucket].some(x=>x.error)||bucket.data?.public!==false||g.data?.status!=="fulfilled"||!b.data||b.data.customer_user_id!==g.data.customer_user_id||!["damage","missing_accessory"].includes(r.data?.condition))return null;
 return {s,group:g.data,booking:b.data,returned:r.data,storage:s.storage.from(DAMAGE_BUCKET)};
}
export async function saveDamageImage({context,bytes,type}){
 if(!damageWriteEnabled()||!context||!damagePhoto(bytes,type))return null;
 // Decode pixels and re-encode: strips EXIF and rejects broken/oversized images.
 // Store only the sanitized copy; never original metadata.
 const img=sharp(bytes,{limitInputPixels:20000000,failOn:"warning",animated:false});
 const metadata=await img.metadata();
 if(!["jpeg","png","webp"].includes(metadata.format)||metadata.pages>1)return null;
 const clean=await img.rotate().resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
 if(clean.length>DAMAGE_MAX_BYTES)return null;
 return storeDamageObject({storage:context.storage,groupId:context.group.id,bookingId:context.booking.id,bytes:clean,type:"image/jpeg"});
}
export async function publishDamageClaim({context,actor,claim}){
 if(!damageWriteEnabled()||!context||!rentalUnitId(actor))return null;
 const plan=await damagePublicationPlan({...context,claim});
 if(!plan)return null;
 const {data,error}=await context.s.rpc("draft_group_damage_publish",{p_group:plan.group_id,p_booking:plan.booking_id,p_claim:plan.id,p_actor:actor,p_description:plan.description,p_amount:plan.amount_ore,p_photos:plan.photo_digests,p_cost:plan.cost_proof_digest,p_digest:plan.claim_digest});
 return !error&&["recorded","existing"].includes(data)?{id:plan.id,status:data}:null;
}
