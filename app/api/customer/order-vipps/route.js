import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {db} from "../../../../lib/supabase";
import {getVippsPayment} from "../../../../lib/vippsClient";
import {vippsUnitReadiness} from "../../../../lib/vippsReadiness";
import {syncVippsPaymentSnapshot} from "../../../../lib/vippsPaymentSync";

export const runtime="nodejs";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const rateError=await rateLimitRequest(req,{
  scope:"customer-order-vipps",
  max:8,
  windowSeconds:900,
  message:"For mange betalingsforsøk på kort tid. Vent litt og prøv igjen."
 });
 if(rateError)return rateError;

 const customerUserId=await getCustomerUserId();
 if(!customerUserId)return NextResponse.json({error:"Du må være innlogget for å åpne betalingen."},{status:401});

 const body=await req.json().catch(()=>({}));
 const orderId=String(body.orderId||"").trim();
 if(!orderId)return NextResponse.json({error:"Bestillingen mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Betaling er midlertidig utilgjengelig."},{status:503});

 const readiness=await vippsUnitReadiness(s,"service");
 if(!readiness.ready)return NextResponse.json({error:"Vipps er ikke tilgjengelig akkurat nå."},{status:409});

 const {data:order,error:orderError}=await s.from("orders")
  .select("id,order_number,order_type,status,customer_user_id,payment_provider,payment_reference,payment_status,payment_captured_ore,payment_refunded_ore")
  .eq("id",orderId)
  .eq("customer_user_id",customerUserId)
  .maybeSingle();

 if(orderError){
  console.error("CUSTOMER ORDER VIPPS LOOKUP ERROR",{orderId,message:orderError.message});
  return NextResponse.json({error:"Bestillingen kunne ikke hentes."},{status:500});
 }
 if(!order||order.order_type!=="order")return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
 if(String(order.payment_provider||"").toLowerCase()!=="vipps"||!order.payment_reference){
  return NextResponse.json({error:"Denne bestillingen har ingen aktiv Vipps-betaling."},{status:409});
 }
 if(order.status==="cancelled")return NextResponse.json({error:"Bestillingen er kansellert. Opprett en ny bestilling dersom du fortsatt ønsker varen."},{status:409});

 try{
  const payment=await getVippsPayment("service",order.payment_reference);
  const snapshot=await syncVippsPaymentSnapshot(s,"service",order.payment_reference,payment);
  const status=String(snapshot?.db?.status||order.payment_status||"").toLowerCase();

  if(status==="authorized")return NextResponse.json({error:"Vipps-beløpet er allerede reservert. Du trenger ikke betale på nytt."},{status:409});
  if(["paid","refunded"].includes(status))return NextResponse.json({error:"Betalingen er allerede registrert."},{status:409});
  if(status==="cancelled"||["ABORTED","EXPIRED","TERMINATED"].includes(String(payment?.state||"").toUpperCase())){
   return NextResponse.json({error:"Vipps-betalingen er avsluttet og bestillingen er kansellert. Opprett en ny bestilling hvis du fortsatt ønsker varen."},{status:409});
  }

  const redirectUrl=String(payment?.redirectUrl||"").trim();
  if(String(payment?.state||"").toUpperCase()==="CREATED"&&redirectUrl){
   return NextResponse.json({ok:true,reference:order.payment_reference,redirectUrl});
  }
  return NextResponse.json({error:"Vipps-betalingen behandles allerede. Vent litt og oppdater Min side."},{status:409});
 }catch(error){
  console.error("CUSTOMER ORDER VIPPS RESUME ERROR",{orderId,status:error?.status,code:error?.code});
  return NextResponse.json({error:"Kunne ikke hente Vipps-betalingen akkurat nå. Prøv igjen om litt."},{status:502});
 }
}
