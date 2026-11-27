import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {vippsUnitReadiness} from "../../../../lib/vippsReadiness";
import {getVippsPayment} from "../../../../lib/vippsClient";
import {syncVippsPaymentSnapshot} from "../../../../lib/vippsPaymentSync";
import {rateLimitRequest,rateLimitValue} from "../../../../lib/rateLimit";
import {sendVippsPaymentReceiptIfNeeded} from "../../../../lib/vippsPaymentReceipt";
import {sendVippsRefundNoticeIfNeeded} from "../../../../lib/vippsRefundNotice";

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

  // Service status polling must not dispatch customer mail. Bound provider refreshes
  // across all callers by the actual order ID, not a caller-controlled alias.
  const service=unit==="service";
  const providerReference=service?String(target.payment_reference||"").trim():reference;
  const canRefresh=refresh&&!state.terminal&&process.env.VERCEL_ENV==="production"&&referencePattern.test(providerReference);
  const refreshBlocked=canRefresh&&service?await rateLimitValue(target.id,{scope:"vipps-service-public-refresh",max:1,windowSeconds:10,requireExplicitAllowance:true}):null;

  if(canRefresh&&!refreshBlocked){
   const readiness=await vippsUnitReadiness(s,unit);
   if(readiness.ready){
    try{
     const payment=await getVippsPayment(unit,providerReference);
     const snapshot=await syncVippsPaymentSnapshot(s,unit,providerReference,payment);
     state=publicState(snapshot?.db?.status||target.payment_status);
    }catch(error){
     console.error("VIPPS PUBLIC STATUS REFRESH ERROR",{unit,reference,status:error?.status,code:error?.code});
    }
   }
  }

  // Leave rental behavior unchanged; Service delivery belongs to the verified
  // webhook, authenticated admin and scheduled receipt recovery.
  if(!service&&process.env.VERCEL_ENV==="production"&&state.status==="paid"){
   try{
    await sendVippsPaymentReceiptIfNeeded({s,unit,id:target.id,req});
   }catch(error){
    console.error("VIPPS PUBLIC RECEIPT ERROR",{unit,reference,message:error?.message});
   }
  }
  if(!service&&process.env.VERCEL_ENV==="production")try{
   await sendVippsRefundNoticeIfNeeded({s,unit,id:target.id,req});
  }catch(error){
   console.error("VIPPS PUBLIC REFUND NOTICE ERROR",{unit,reference,message:error?.message});
  }

  return NextResponse.json({
   reference,
   unit,
   status:state.status,
   terminal:state.terminal
  },service?{headers:{"Cache-Control":"private, no-store"}}:undefined);
 }catch(error){
  console.error("VIPPS PUBLIC STATUS ERROR",{unit,reference,message:error?.message});
  return NextResponse.json({error:"Status kunne ikke hentes akkurat nå."},{status:500});
 }
}
