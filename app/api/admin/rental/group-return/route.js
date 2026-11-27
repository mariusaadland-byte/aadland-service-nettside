import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {groupReturnEnabled,ownerGroupReturn} from "../../../../../lib/groupReturn";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!groupReturnEnabled())return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const limited=await rateLimitValue(user.id,{scope:"group-return",max:20,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>16384)return reply({status:"invalid"},400);
 try{return reply(await ownerGroupReturn(user.id,await req.json()));}catch{return reply({status:"unconfirmed"},503);}
}
