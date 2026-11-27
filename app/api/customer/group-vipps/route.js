import {NextResponse} from "next/server";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../lib/rateLimit";
import {groupVippsCheckoutEnabled,groupVippsCustomerAction} from "../../../../lib/groupVippsCheckout";
import {rentalUnitId} from "../../../../lib/rentalUnitQr.mjs";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!groupVippsCheckoutEnabled())return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const customerId=await getCustomerUserId();if(!customerId)return reply({status:"login_required"},401);
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>4096)return reply({status:"invalid"},400);
 try{
 const body=await req.json();if(!rentalUnitId(body?.groupId)||!["start","status"].includes(body.action)||body.action==="start"&&body.confirmed!==true)return reply({status:"invalid"},400);
 const limited=await rateLimitValue(customerId,{scope:body.action==="start"?"group-vipps-start":"group-vipps-status",max:body.action==="start"?5:30,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const r=await groupVippsCustomerAction(customerId,body.groupId,body.action);return reply(r,r.status==="unconfirmed"?503:200);
 }catch{return reply({status:"unconfirmed"},503);}
}
