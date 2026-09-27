import {NextResponse} from "next/server";
import {rateLimitRequest} from "../../../../../lib/rateLimit";
import {db} from "../../../../../lib/supabase";
import {getVippsPayment,vippsPublicStatus} from "../../../../../lib/vipps";
import {syncVippsOrderFromPayment} from "../../../../../lib/vippsOrder";

export const dynamic="force-dynamic";

export async function GET(req){
 const rateError=await rateLimitRequest(req,{scope:"vipps-status",max:90,windowSeconds:300,message:"For mange statusforespørsler. Prøv igjen om litt."});
 if(rateError)return rateError;
 const reference=String(new URL(req.url).searchParams.get("reference")||"").trim();
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference))return NextResponse.json({error:"Ugyldig betalingsreferanse."},{status:400});
 const availability=vippsPublicStatus();
 if(!availability.enabled)return NextResponse.json({error:"Vipps er ikke aktivert.",code:"vipps_disabled"},{status:503});
 const s=db(); if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:order,error}=await s.from("orders").select("*").eq("payment_provider","vipps").eq("payment_reference",reference).maybeSingle();
 if(error)return NextResponse.json({error:"Betalingen kunne ikke hentes."},{status:500});
 if(!order)return NextResponse.json({error:"Betalingen ble ikke funnet."},{status:404});
 try{
  const payment=await getVippsPayment(reference);
  const synced=await syncVippsOrderFromPayment(s,order,payment);
  return NextResponse.json({
   reference,
   state:synced.state,
   paymentStatus:synced.paymentStatus,
   authorizedOre:synced.authorized,
   capturedOre:synced.captured,
   refundedOre:synced.refunded,
   orderNumber:order.order_number
  },{headers:{"Cache-Control":"private, no-store, max-age=0"}});
 }catch(error){
  console.error("VIPPS STATUS ERROR",error);
  return NextResponse.json({error:"Betalingsstatus kunne ikke bekreftes akkurat nå."},{status:502});
 }
}
