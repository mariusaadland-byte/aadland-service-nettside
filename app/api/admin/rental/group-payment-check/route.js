import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
import {ownerGroupPaymentCheckEnabled,ownerGroupPaymentAction} from "../../../../../lib/groupVippsCheckout";
export const runtime="nodejs";
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!ownerGroupPaymentCheckEnabled())return json({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return json({status:"forbidden"},403);
 const limit=await rateLimitValue(user.id,{scope:"rental-owner-payment-check",max:20,windowSeconds:300,requireExplicitAllowance:true});if(limit)return limit;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<1||len>4096)return json({status:"invalid"},400);
 try{
  const b=await req.json();
  if(!rentalUnitId(b?.groupId)||!["check","apply"].includes(b.action)||b.action==="apply"&&(b.confirmed!==true||typeof b.expected!=="string"||!/^[a-f0-9]{64}$/.test(b.expected)))return json({status:"invalid"},400);
  const r=await ownerGroupPaymentAction(b.groupId,b.action,b.expected);
  return json(r,r.status==="unconfirmed"?503:200);
 }catch{return json({status:"unconfirmed"},503);}
}
