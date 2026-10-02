import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {vippsUnitReadiness} from "../../../../lib/vippsReadiness";
import {getVippsPayment} from "../../../../lib/vippsClient";
import {syncVippsPaymentSnapshot} from "../../../../lib/vippsPaymentSync";
import {rateLimitRequest} from "../../../../lib/rateLimit";

export const runtime="nodejs";

const referencePattern=/^[a-zA-Z0-9-]{8,64}$/;

async function findPaymentTarget(s,unit,reference){
 if(unit==="service"){
  const {data,error}=await s.from("orders")
   .select("id,order_number,payment_provider,payment_reference,payment_status")
   .or("order_number.eq."+reference+",payment_reference.eq."+reference)
   .limit(1)
   .maybeSingle();
  if(error)throw error;
  return data||null;
 }
 const {data,error}=await s.from("rental_bookings")
  .select("id,booking_number,payment_provider,payment_reference,payment_status")
  .or("booking_number.eq."+reference+",payment_reference.eq."+reference)
  .limit(1)
  .maybeSingle();
 if(error)throw error;
 return data||null;
}

function publicState(status){
 const value=String(status||"").toLowerCase();
 if(value==="authorized")return {status:"authorized",terminal:true};
 if(value==="paid")return {status:"paid",terminal:true};
 if(value==="refunded")return {status:"refunded",terminal:true};
 if(value==="cancelled")return {status:"cancelled",terminal:true};
 if(value==="partial")return {status:"partial",terminal:false};
 return {status:"pending",terminal:false};
}

export async function GET(req){
 const rateError=await rateLimitRequest(req,{
  scope:"vipps-public-status",
  max:30,
  windowSeconds:60,
  message:"For mange statusforespørsler. Vent litt og prøv igjen."
 });
 if(rateError)return rateError;
 const url=new URL(req.url);
 const unit=url.searchParams.get("unit")==="rental"?"rental":url.searchParams.get("unit")==="service"?"service":"";
 const reference=String(url.searchParams.get("reference")||"").trim();
 const refresh=url.searchParams.get("refresh")==="1";

 if(!unit||!referencePattern.test(reference)){
  return NextResponse.json({error:"Ugyldig betalingsreferanse."},{status:400});
 }

 const s=db();
 if(!s)return NextResponse.json({error:"Status er midlertidig utilgjengelig."},{status:503});

 try{
  const target=await findPaymentTarget(s,unit,reference);
  if(!target||String(target.payment_provider||"").toLowerCase()!=="vipps"){
   return NextResponse.json({error:"Betalingen ble ikke funnet."},{status:404});
  }

  let state=publicState(target.payment_status);

  if(refresh&&!state.terminal){
   const readiness=await vippsUnitReadiness(s,unit);
   if(readiness.ready){
    try{
     const payment=await getVippsPayment(unit,reference);
     const snapshot=await syncVippsPaymentSnapshot(s,unit,reference,payment);
     state=publicState(snapshot?.db?.status||target.payment_status);
    }catch(error){
     console.error("VIPPS PUBLIC STATUS REFRESH ERROR",{unit,reference,status:error?.status,code:error?.code});
    }
   }
  }

  return NextResponse.json({
   reference,
   unit,
   status:state.status,
   terminal:state.terminal
  });
 }catch(error){
  console.error("VIPPS PUBLIC STATUS ERROR",{unit,reference,message:error?.message});
  return NextResponse.json({error:"Status kunne ikke hentes akkurat nå."},{status:500});
 }
}
