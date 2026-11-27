import {NextResponse} from "next/server";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../lib/rateLimit";
import {damageResponseInput} from "../../../../lib/damageEvidence.mjs";
import {customerDamageClaims,damagePortalEnabled} from "../../../../lib/customerDamageClaims";
import {db} from "../../../../lib/supabase";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 // Separate write flag; requires explicit reviewed DB grants and claim evidence pipeline.
 if(!damagePortalEnabled()||process.env.AADLAND_DAMAGE_RESPONSE_ENABLED!=="true")return reply({error:"Svarfunksjonen er ikke aktivert."},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const customerId=await getCustomerUserId();if(!customerId)return reply({error:"Ingen tilgang."},403);
 const limited=await rateLimitValue(customerId,{scope:"damage-response",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const input=damageResponseInput(await req.json().catch(()=>null));if(!input)return reply({error:"Ugyldig svar."},400);
 const r=await customerDamageClaims(customerId,input.claimId);if(!r.ok)return reply({error:"Kravet kunne ikke kontrolleres."},503);
 const claim=r.rows[0];if(!claim||claim.claimDigest!==input.claimDigest)return reply({error:"Kravet er ikke tilgjengelig i denne versjonen."},409);
 const s=db();if(!s)return reply({error:"Svar kunne ikke registreres."},503);
 const {data,error}=await s.rpc("draft_group_damage_response",{p_group:claim.groupId,p_claim:claim.id,p_customer:customerId,p_digest:claim.claimDigest,p_response:input.response,p_note:input.note});
 if(error||!["recorded","existing"].includes(data))return reply({error:"Svar kunne ikke registreres. Oppdater oversikten."},409);
 return reply({ok:true});
}
