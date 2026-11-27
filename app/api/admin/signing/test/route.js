import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {runSigningTest} from "../../../../../lib/signingTestRunner.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({error:"Ingen tilgang."},403);
 const limited=await rateLimitValue(user.id,{scope:"signing-synthetic-tests",max:30,windowSeconds:60,requireExplicitAllowance:true});if(limited)return limited;
 const body=await req.json().catch(()=>null);
 if(typeof body?.id!=="string"||body.id.length>30)return reply({error:"Ukjent test."},400);
 const result=await runSigningTest(body.id);
 return result?reply(result):reply({error:"Ukjent test."},400);
}
