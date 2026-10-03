import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {getCustomerUserId} from "../../../../lib/customer-auth";
import {db} from "../../../../lib/supabase";
import {startRentalVippsPayment} from "../../../../lib/startRentalVippsPayment";

export const runtime="nodejs";

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

 const result=await startRentalVippsPayment({s,booking,req,logContext:"customer"});
 return NextResponse.json(result.body,{status:result.status});
}
