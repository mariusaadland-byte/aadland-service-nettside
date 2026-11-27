import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {damagePhoto,DAMAGE_MAX_BYTES} from "../../../../../lib/damageEvidence.mjs";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({error:"Ingen tilgang."},403);
 const limited=await rateLimitValue(user.id,{scope:"damage-photo-test",max:24,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const length=Number(req.headers.get("content-length"));if(!Number.isFinite(length)||length<=0||length>DAMAGE_MAX_BYTES+65536)return reply({error:"Maks 3 MB per bilde."},413);
 try{
 const form=await req.formData(),file=form.get("file");if(!file||typeof file.arrayBuffer!=="function"||file.size>DAMAGE_MAX_BYTES)return reply({error:"Velg ett bilde på maks 3 MB."},400);
 const photo=damagePhoto(Buffer.from(await file.arrayBuffer()),file.type);
 return photo?reply({ok:true,mode:"validation_only",photo}):reply({error:"Ugyldig JPG, PNG eller WebP."},400);
 }catch{return reply({error:"Bildet kunne ikke behandles."},400);}
}
