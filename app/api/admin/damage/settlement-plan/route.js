import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {damageWriteEnabled} from "../../../../../lib/damageStorage";
import {adminDamageReview} from "../../../../../lib/adminDamageReview";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
import {db} from "../../../../../lib/supabase";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!damageWriteEnabled()||process.env.AADLAND_DAMAGE_SETTLEMENT_ENABLED!=="true")return reply({error:"Sluttoppgjør er ikke aktivert."},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({error:"Ingen tilgang."},403);
 const limited=await rateLimitValue(user.id,{scope:"damage-settlement-plan",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const body=await req.json().catch(()=>null);if(body?.approved!==true||!rentalUnitId(body.groupId)||!rentalUnitId(body.requestId))return reply({error:"Ugyldig godkjenning."},400);
 const r=await adminDamageReview(body.groupId),row=r.rows?.[0];
 if(!r.ok||!row||row.reason||row.reviewDigest!==body.reviewDigest)return reply({error:"Oppgjørsgrunnlaget er endret eller krever manuell behandling."},409);
 const s=db();if(!s)return reply({error:"Utilgjengelig."},503);
 const result=await s.rpc("draft_group_agreed_damage_plan",{p_group:row.groupId,p_request:body.requestId,p_actor:user.id,p_refund:row.refundOre,p_retained:row.acceptedOre,p_review:row.reviewDigest});
 if(result.error||!["planned","existing"].includes(result.data))return reply({error:"Planen kunne ikke bekreftes. Oppdater oversikten."},409);
 return reply({ok:true,status:result.data});
}
