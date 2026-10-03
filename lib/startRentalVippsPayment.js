import "server-only";
import crypto from "crypto";
import {createVippsPayment,getVippsPayment} from "./vippsClient";
import {vippsUnitReadiness} from "./vippsReadiness";
import {syncVippsPaymentSnapshot} from "./vippsPaymentSync";
import {rentalBookingSiteUrl} from "./rentalEmailConfig";

function newReference(bookingNumber){
 const suffix=crypto.randomBytes(4).toString("hex").toUpperCase();
 return (String(bookingNumber||"")+"-"+suffix).slice(0,64);
}

function settledStatus(status){
 return ["authorized","paid","refunded"].includes(String(status||"").toLowerCase());
}

export async function startRentalVippsPayment({s,booking,req,logContext="rental"}){
 if(!s)return {status:503,body:{error:"Betaling er midlertidig utilgjengelig."}};
 if(!booking)return {status:404,body:{error:"Bookingen ble ikke funnet."}};
 if(booking.status!=="confirmed")return {status:409,body:{error:"Vipps-betaling kan startes når utleien er bekreftet."}};

 const readiness=await vippsUnitReadiness(s,"rental");
 if(!readiness.ready)return {status:409,body:{error:"Vipps er ikke klart for utleiebetaling ennå."}};

 const totalOre=Math.max(0,Number(booking.total_ore)||0);
 const capturedOre=Math.max(0,Number(booking.payment_captured_ore)||0);
 const refundedOre=Math.max(0,Number(booking.payment_refunded_ore)||0);
 const paymentStatus=String(booking.payment_status||"").toLowerCase();

 if(totalOre<=0)return {status:409,body:{error:"Denne bookingen har ikke et leiebeløp som skal betales."}};
 if(capturedOre>refundedOre||["paid","refunded"].includes(paymentStatus)){
  return {status:409,body:{error:"Leiebetalingen er allerede registrert."}};
 }
 if(paymentStatus==="authorized"){
  return {status:409,body:{error:"Vipps-beløpet er allerede reservert. Du trenger ikke starte betalingen på nytt."}};
 }

 const oldReference=String(booking.payment_reference||"").trim();
 if(String(booking.payment_provider||"").toLowerCase()==="vipps"&&oldReference){
  try{
   const existing=await getVippsPayment("rental",oldReference);
   const snapshot=await syncVippsPaymentSnapshot(s,"rental",oldReference,existing);
   const localStatus=String(snapshot?.db?.status||"").toLowerCase();
   if(settledStatus(localStatus)){
    return {
     status:409,
     body:{error:localStatus==="authorized"?"Vipps-beløpet er allerede reservert.":"Leiebetalingen er allerede registrert."}
    };
   }
   const state=String(existing?.state||"").toUpperCase();
   const redirectUrl=String(existing?.redirectUrl||"").trim();
   if(state==="CREATED"&&redirectUrl){
    return {status:200,body:{ok:true,reused:true,reference:oldReference,redirectUrl}};
   }
   if(!["ABORTED","EXPIRED","TERMINATED"].includes(state)&&localStatus!=="cancelled"){
    return {status:409,body:{error:"Et Vipps-betalingsforsøk behandles allerede. Vent litt og prøv igjen."}};
   }
  }catch(error){
   if(Number(error?.status)!==404){
    console.error("RENTAL VIPPS EXISTING CHECK ERROR",{context:logContext,bookingId:booking.id,status:error?.status,code:error?.code});
    return {status:502,body:{error:"Kunne ikke kontrollere det forrige Vipps-forsøket. Prøv igjen om litt."}};
   }
  }
 }

 const reference=newReference(booking.booking_number);
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference)){
  return {status:500,body:{error:"Kunne ikke lage en gyldig betalingsreferanse."}};
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
 }).eq("id",booking.id);
 if(markError){
  console.error("RENTAL VIPPS START STAMP ERROR",{context:logContext,bookingId:booking.id,message:markError.message});
  return {status:500,body:{error:"Betalingen kunne ikke klargjøres."}};
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
   }).eq("id",booking.id);
   if(pspError)console.error("RENTAL VIPPS PSP STAMP ERROR",{context:logContext,bookingId:booking.id,message:pspError.message});
  }

  return {status:200,body:{ok:true,reference,redirectUrl}};
 }catch(error){
  console.error("RENTAL VIPPS CREATE ERROR",{context:logContext,bookingId:booking.id,status:error?.status,code:error?.code});
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
  }).eq("id",booking.id);
  if(cleanupError)console.error("RENTAL VIPPS CLEANUP ERROR",{context:logContext,bookingId:booking.id,message:cleanupError.message});
  return {status:502,body:{error:"Vipps-betalingen kunne ikke startes. Ingen betaling er gjennomført."}};
 }
}
