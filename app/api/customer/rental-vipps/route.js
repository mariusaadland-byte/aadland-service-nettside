import {NextResponse} from "next/server";
import crypto from "crypto";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {db} from "../../../../lib/supabase";
import {createVippsPayment,getVippsPayment} from "../../../../lib/vippsClient";
import {vippsUnitReadiness} from "../../../../lib/vippsReadiness";
import {syncVippsPaymentSnapshot} from "../../../../lib/vippsPaymentSync";
import {rentalBookingSiteUrl} from "../../../../lib/rentalEmailConfig";

export const runtime="nodejs";

function newReference(bookingNumber){
 const suffix=crypto.randomBytes(4).toString("hex").toUpperCase();
 return (String(bookingNumber||"")+"-"+suffix).slice(0,64);
}

function isSettledStatus(status){
 return ["authorized","paid","refunded"].includes(String(status||"").toLowerCase());
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const rateError=await rateLimitRequest(req,{
  scope:"customer-rental-vipps",
  max:8,
  windowSeconds:900,
  message:"For mange betalingsforsøk på kort tid. Vent litt og prøv igjen."
 });
 if(rateError)return rateError;

 const customerUserId=await getCustomerUserId();
 if(!customerUserId)return NextResponse.json({error:"Du må være innlogget for å starte betalingen."},{status:401});

 const body=await req.json().catch(()=>({}));
 const bookingId=String(body.bookingId||"").trim();
 if(!bookingId)return NextResponse.json({error:"Bookingen mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Betaling er midlertidig utilgjengelig."},{status:503});

 const readiness=await vippsUnitReadiness(s,"rental");
 if(!readiness.ready)return NextResponse.json({error:"Vipps er ikke klart for utleiebetaling ennå."},{status:409});

 const {data:booking,error:bookingError}=await s.from("rental_bookings")
  .select("id,booking_number,customer_user_id,customer,status,total_ore,deposit_ore,payment_status,payment_provider,payment_reference,payment_psp_reference,payment_reserved_ore,payment_captured_ore,payment_refunded_ore,vipps_checkout_started_at")
  .eq("id",bookingId)
  .eq("customer_user_id",customerUserId)
  .maybeSingle();

 if(bookingError){
  console.error("CUSTOMER RENTAL VIPPS LOOKUP ERROR",{bookingId,message:bookingError.message});
  return NextResponse.json({error:"Bookingen kunne ikke hentes."},{status:500});
 }
 if(!booking)return NextResponse.json({error:"Bookingen ble ikke funnet."},{status:404});
 if(booking.status!=="confirmed")return NextResponse.json({error:"Vipps-betaling kan startes når utleien er bekreftet."},{status:409});

 const totalOre=Math.max(0,Number(booking.total_ore)||0);
 const capturedOre=Math.max(0,Number(booking.payment_captured_ore)||0);
 const refundedOre=Math.max(0,Number(booking.payment_refunded_ore)||0);
 if(totalOre<=0)return NextResponse.json({error:"Denne bookingen har ikke et leiebeløp som skal betales."},{status:409});
 if(capturedOre>refundedOre||["paid","refunded"].includes(String(booking.payment_status||"").toLowerCase())){
  return NextResponse.json({error:"Leiebetalingen er allerede registrert."},{status:409});
 }
 if(String(booking.payment_status||"").toLowerCase()==="authorized"){
  return NextResponse.json({error:"Vipps-beløpet er allerede reservert. Du trenger ikke starte betalingen på nytt."},{status:409});
 }

 const oldReference=String(booking.payment_reference||"").trim();
 if(String(booking.payment_provider||"").toLowerCase()==="vipps"&&oldReference){
  try{
   const existing=await getVippsPayment("rental",oldReference);
   const snapshot=await syncVippsPaymentSnapshot(s,"rental",oldReference,existing);
   const localStatus=String(snapshot?.db?.status||"").toLowerCase();
   if(isSettledStatus(localStatus)){
    return NextResponse.json({error:localStatus==="authorized"
     ?"Vipps-beløpet er allerede reservert."
     :"Leiebetalingen er allerede registrert."},{status:409});
   }
   const state=String(existing?.state||"").toUpperCase();
   const redirectUrl=String(existing?.redirectUrl||"").trim();
   if(state==="CREATED"&&redirectUrl){
    return NextResponse.json({ok:true,reused:true,reference:oldReference,redirectUrl});
   }
   if(!["ABORTED","EXPIRED","TERMINATED"].includes(state)&&localStatus!=="cancelled"){
    return NextResponse.json({error:"Et Vipps-betalingsforsøk behandles allerede. Vent litt og prøv igjen."},{status:409});
   }
  }catch(error){
   if(Number(error?.status)!==404){
    console.error("CUSTOMER RENTAL VIPPS EXISTING CHECK ERROR",{bookingId,status:error?.status,code:error?.code});
    return NextResponse.json({error:"Kunne ikke kontrollere det forrige Vipps-forsøket. Prøv igjen om litt."},{status:502});
   }
  }
 }

 const reference=newReference(booking.booking_number);
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference)){
  return NextResponse.json({error:"Kunne ikke lage en gyldig betalingsreferanse."},{status:500});
 }

 const startedAt=new Date().toISOString();
 const {error:markError}=await s.from("rental_bookings").update({
  payment_provider:"vipps",
  payment_reference:reference,
  payment_psp_reference:null,
  payment_status:"pending",
  payment_reserved_ore:0,
  payment_authorized_at:null,
  payment_cancelled_at:null,
  payment_capture_guaranteed_until:null,
  vipps_checkout_started_at:startedAt,
  updated_at:startedAt
 }).eq("id",booking.id).eq("customer_user_id",customerUserId);
 if(markError){
  console.error("CUSTOMER RENTAL VIPPS START STAMP ERROR",{bookingId,message:markError.message});
  return NextResponse.json({error:"Betalingen kunne ikke klargjøres."},{status:500});
 }

 const base=rentalBookingSiteUrl(booking,req);
 try{
  const payment=await createVippsPayment({
   unit:"rental",
   reference,
   amountOre:totalOre,
   phone:booking.customer?.phone||"",
   returnUrl:base+"/betaling/vipps?unit=rental&reference="+encodeURIComponent(reference),
   description:"Aadland Utleie "+booking.booking_number
  });

  const redirectUrl=String(payment?.redirectUrl||"").trim();
  if(!redirectUrl)throw new Error("VIPPS_REDIRECT_URL_MISSING");

  if(payment?.pspReference){
   const stampAt=new Date().toISOString();
   const {error:pspError}=await s.from("rental_bookings").update({
    payment_psp_reference:String(payment.pspReference),
    updated_at:stampAt
   }).eq("id",booking.id).eq("customer_user_id",customerUserId);
   if(pspError)console.error("CUSTOMER RENTAL VIPPS PSP STAMP ERROR",{bookingId,message:pspError.message});
  }

  return NextResponse.json({ok:true,reference,redirectUrl});
 }catch(error){
  console.error("CUSTOMER RENTAL VIPPS CREATE ERROR",{bookingId,status:error?.status,code:error?.code});
  const failedAt=new Date().toISOString();
  const {error:cleanupError}=await s.from("rental_bookings").update({
   payment_provider:null,
   payment_reference:null,
   payment_psp_reference:null,
   payment_status:"unpaid",
   payment_reserved_ore:0,
   payment_authorized_at:null,
   payment_cancelled_at:failedAt,
   payment_capture_guaranteed_until:null,
   vipps_checkout_started_at:null,
   updated_at:failedAt
  }).eq("id",booking.id).eq("customer_user_id",customerUserId);
  if(cleanupError)console.error("CUSTOMER RENTAL VIPPS CLEANUP ERROR",{bookingId,message:cleanupError.message});
  return NextResponse.json({error:"Vipps-betalingen kunne ikke startes. Ingen betaling er gjennomført."},{status:502});
 }
}
