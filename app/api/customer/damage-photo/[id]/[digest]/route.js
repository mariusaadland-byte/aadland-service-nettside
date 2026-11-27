import {NextResponse} from "next/server";
import {getCustomerUserId} from "../../../../../../lib/customer-auth";
import {customerDamageClaims,damagePortalEnabled} from "../../../../../../lib/customerDamageClaims";
import {db} from "../../../../../../lib/supabase";
import {damagePhoto,damagePhotoPath,DAMAGE_BUCKET,DAMAGE_MAX_BYTES,digestValid} from "../../../../../../lib/damageEvidence.mjs";
import {rateLimitValue} from "../../../../../../lib/rateLimit";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Referrer-Policy":"no-referrer"};
const fail=(status=404)=>NextResponse.json({error:"Dokumentet er utilgjengelig."},{status,headers});
export async function GET(req,{params}){
 if(!damagePortalEnabled())return fail();
 const customerId=await getCustomerUserId();if(!customerId)return fail();
 const {id,digest}=await params;if(!digestValid(digest))return fail();
 const limited=await rateLimitValue(customerId,{scope:"damage-photo-read",max:60,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const r=await customerDamageClaims(customerId,id);if(!r.ok)return fail(503);
 const claim=r.rows[0];if(!claim||!(claim.photos.some(x=>x.digest===digest)||claim.costDocument?.digest===digest))return fail();
 const path=damagePhotoPath(claim.groupId,claim.bookingId,digest),s=db();if(!path||!s)return fail(503);
 const bucket=await s.storage.getBucket(DAMAGE_BUCKET);if(bucket.error||bucket.data?.public!==false)return fail(503);
 const result=await s.storage.from(DAMAGE_BUCKET).download(path);
 if(result.error||!result.data||result.data.size>DAMAGE_MAX_BYTES)return fail(503);
 const bytes=Buffer.from(await result.data.arrayBuffer()),photo=damagePhoto(bytes,result.data.type);
 if(!photo||photo.digest!==digest)return fail(503);
 return new NextResponse(bytes,{headers:{...headers,"Content-Type":photo.type,"Content-Disposition":"attachment; filename=skade-"+digest.slice(0,12)+"."+photo.extension}});
}
