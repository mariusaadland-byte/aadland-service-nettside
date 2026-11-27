import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {readRentalReports,syncRentalReports,rentalReportsEnabled} from "../../../../../lib/rentalVippsReports";
export const runtime="nodejs";
export const maxDuration=60;
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!rentalReportsEnabled())return reply({status:"disabled"},503);
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const limited=await rateLimitValue(user.id,{scope:"rental-vipps-report-cache",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>4096)return reply({status:"invalid"},400);
 try{const b=await req.json();if(!["read","sync"].includes(b.action))return reply({status:"invalid"},400);return reply(await (b.action==="read"?readRentalReports:syncRentalReports)(b.from,b.to));}catch{return reply({status:"unconfirmed"},503);}
}
