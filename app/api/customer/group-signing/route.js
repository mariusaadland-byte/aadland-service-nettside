import {NextResponse} from "next/server";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../lib/rateLimit";
import {checkoutSigningEnabled,checkoutSigningAction} from "../../../../lib/checkoutSigning";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!checkoutSigningEnabled())return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const customerId=await getCustomerUserId();if(!customerId)return reply({status:"login_required"},401);
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>8192)return reply({status:"invalid"},400);
 try{
 const body=await req.json();if(!["issue","verify"].includes(body?.action))return reply({status:"invalid"},400);
 const verify=body.action==="verify";
 const limited=await rateLimitValue(customerId,{scope:verify?"checkout-signing-verify":"checkout-signing-issue",max:verify?20:5,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const result=await checkoutSigningAction(customerId,body,verify);
 return reply(result,["sent","signed"].includes(result.status)?200:result.status==="limited"?429:409);
 }catch{return reply({status:"unconfirmed"},503);}
}
