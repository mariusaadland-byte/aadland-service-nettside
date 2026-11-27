import {NextResponse} from "next/server";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../lib/rateLimit";
import {groupCheckoutEnabled,reserveCheckoutAgreement} from "../../../../lib/rentalCheckoutAgreement";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!groupCheckoutEnabled())return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const customerId=await getCustomerUserId();if(!customerId)return reply({status:"login_required"},401);
 const limited=await rateLimitValue(customerId,{scope:"group-checkout-reserve",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 try{
 const body=await req.json();
 const result=await reserveCheckoutAgreement(customerId,body);
 return reply(result,result.status==="agreement_ready"?200:409);
 }catch{return reply({status:"unconfirmed",message:"Bestilling ikke bekreftet. Behold samme forespørsels-ID ved nytt forsøk."},503);}
}
