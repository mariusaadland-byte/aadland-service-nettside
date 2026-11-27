import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {damageWriteEnabled,damageWriteContext,saveDamageImage,publishDamageClaim} from "../../../../../lib/damageStorage";
import {DAMAGE_MAX_BYTES} from "../../../../../lib/damageEvidence.mjs";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!damageWriteEnabled())return reply({error:"Skadesaksregistrering er ikke aktivert."},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({error:"Ingen tilgang."},403);
 const limited=await rateLimitValue(user.id,{scope:"damage-evidence-write",max:24,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const length=Number(req.headers.get("content-length"));if(!Number.isFinite(length)||length<=0||length>DAMAGE_MAX_BYTES+65536)return reply({error:"Forespørselen er for stor."},413);
 try{
 if(req.headers.get("content-type")?.startsWith("multipart/form-data")){
 const form=await req.formData(),file=form.get("file"),context=await damageWriteContext(form.get("groupId"),form.get("bookingId"));
 if(!context||!file||typeof file.arrayBuffer!=="function"||file.size>DAMAGE_MAX_BYTES)return reply({error:"Ugyldig dokument eller skadesak."},400);
 const photo=await saveDamageImage({context,bytes:Buffer.from(await file.arrayBuffer()),type:file.type});
 return photo?reply({ok:true,photo}):reply({error:"Dokumentet kunne ikke verifiseres."},409);
 }
 const input=await req.json(),context=await damageWriteContext(input?.group_id,input?.booking_id);
 if(!context)return reply({error:"Skadesaken kunne ikke kontrolleres."},409);
 const result=await publishDamageClaim({context,actor:user.id,claim:{id:input.id,group_id:input.group_id,booking_id:input.booking_id,description:input.description,amount_ore:input.amount_ore,photo_digests:input.photo_digests,cost_proof_digest:input.cost_proof_digest}});
 return result?reply({ok:true,...result}):reply({error:"Kravet kunne ikke registreres."},409);
 }catch{return reply({error:"Dokumentet eller kravet kunne ikke behandles."},409);}
}
