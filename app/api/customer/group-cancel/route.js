import {NextResponse} from "next/server";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../lib/rateLimit";
import {groupCheckoutEnabled} from "../../../../lib/rentalCheckoutAgreement";
import {rentalUnitId} from "../../../../lib/rentalUnitQr.mjs";
import {db} from "../../../../lib/supabase";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!groupCheckoutEnabled()||process.env.AADLAND_CHECKOUT_CANCEL_ENABLED!=="true")return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const customerId=await getCustomerUserId();if(!customerId)return reply({status:"login_required"},401);
 const limited=await rateLimitValue(customerId,{scope:"group-checkout-cancel",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const body=await req.json().catch(()=>null);if(body?.confirmed!==true||!rentalUnitId(body.requestId))return reply({status:"invalid"},400);
 const s=db();if(!s)return reply({status:"unconfirmed"},503);
 try{const r=await s.rpc("draft_group_cancel_request",{p_customer:customerId,p_request:body.requestId});
 if(r.error)return reply({status:"unconfirmed"},503);
 return reply({status:r.data==="cancelled"?"cancelled":r.data==="payment_review"?"payment_review":"unconfirmed"},r.data==="cancelled"?200:409);
 }catch{return reply({status:"unconfirmed"},503);}
}
