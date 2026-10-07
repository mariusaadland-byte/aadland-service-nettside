import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../lib/requestGuard";
import {rateLimitRequest} from "../../../lib/rateLimit";
import {db} from "../../../lib/supabase";
import {verifyRentalPaymentLinkToken} from "../../../lib/rentalPaymentLink";
import {vippsUnitReadiness} from "../../../lib/vippsReadiness";
import {startRentalVippsPayment} from "../../../lib/startRentalVippsPayment";

export const runtime="nodejs";

function publicStatus(booking,ready){
 const paymentStatus=String(booking.payment_status||"unpaid").toLowerCase();
 const captured=Math.max(0,Number(booking.payment_captured_ore)||0);
 const refunded=Math.max(0,Number(booking.payment_refunded_ore)||0);
 const settled=captured>refunded||["authorized","paid","refunded"].includes(paymentStatus);
 return {
  bookingNumber:booking.booking_number,
  itemName:booking.rental_items?.name||"Utleie",
  startDate:booking.start_date,
  endDate:booking.end_date,
  bookingStatus:booking.status,
  totalOre:Math.max(0,Number(booking.total_ore)||0),
  depositOre:Math.max(0,Number(booking.deposit_ore)||0),
  paymentStatus,
  vippsAvailable:ready===true,
  canPay:ready===true&&booking.status==="confirmed"&&!settled
 };
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const body=await req.json().catch(()=>({}));
 const action=body.action==="start"?"start":"status";

 const rateError=await rateLimitRequest(req,{
  scope:action==="start"?"rental-guest-vipps-start":"rental-guest-vipps-status",
  max:action==="start"?8:30,
  windowSeconds:action==="start"?900:300,
  message:"For mange forespørsler på kort tid. Vent litt og prøv igjen."
 });
 if(rateError)return rateError;

 const bookingId=String(body.bookingId||"").trim();
 const token=String(body.token||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(bookingId)||token.length<20||token.length>160){
  return NextResponse.json({error:"Betalingslenken er ugyldig."},{status:400});
 }

 const s=db();
 if(!s)return NextResponse.json({error:"Betaling er midlertidig utilgjengelig."},{status:503});

 const {data:booking,error}=await s.from("rental_bookings")
  .select("id,booking_number,customer_user_id,customer,start_date,end_date,status,total_ore,deposit_ore,payment_status,payment_provider,payment_reference,payment_psp_reference,payment_reserved_ore,payment_captured_ore,payment_refunded_ore,vipps_checkout_started_at,rental_items(name)")
  .eq("id",bookingId)
  .maybeSingle();

 if(error){
  console.error("RENTAL GUEST PAYMENT LOOKUP ERROR",{bookingId,message:error.message});
  return NextResponse.json({error:"Betalingslenken kunne ikke kontrolleres."},{status:500});
 }
 if(!booking)return NextResponse.json({error:"Betalingslenken er ugyldig."},{status:404});

 let verification;
 try{verification=verifyRentalPaymentLinkToken(booking,token);}
 catch(error){
  console.error("RENTAL GUEST PAYMENT TOKEN ERROR",{bookingId,message:error?.message});
  return NextResponse.json({error:"Betalingslenken kunne ikke kontrolleres."},{status:500});
 }
 if(!verification.ok){
  return NextResponse.json({
   error:verification.reason==="expired"
    ?"Betalingslenken er utløpt. Be om en ny bekreftelse for å få en ny lenke."
    :"Betalingslenken er ugyldig."
  },{status:verification.reason==="expired"?410:403});
 }

 if(action==="status"){
  const readiness=await vippsUnitReadiness(s,"rental");
  return NextResponse.json({
   ok:true,
   expiresAt:verification.expiresAt,
   booking:publicStatus(booking,readiness.ready)
  });
 }

 const result=await startRentalVippsPayment({s,booking,req,logContext:"guest-link"});
 return NextResponse.json(result.body,{status:result.status});
}
