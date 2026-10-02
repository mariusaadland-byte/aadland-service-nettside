import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {db} from "../../../../lib/supabase";
import {
 getVippsPayment,
 captureVippsPayment,
 cancelVippsPayment,
 refundVippsPayment,
 vippsPaymentsEnabled
} from "../../../../lib/vippsClient";
import {syncVippsPaymentSnapshot} from "../../../../lib/vippsPaymentSync";

export const runtime="nodejs";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return false;
 return user.role==="owner"||await hasPermission("canUpdateOrders");
}

async function findTarget(s,unit,reference){
 if(unit==="service"){
  const {data,error}=await s.from("orders")
   .select("id,order_number,order_type,payment_provider,payment_reference,total_ore")
   .or("order_number.eq."+reference+",payment_reference.eq."+reference)
   .limit(1)
   .maybeSingle();
  if(error)throw error;
  if(!data||data.order_type!=="order")return null;
  return data;
 }
 const {data,error}=await s.from("rental_bookings")
  .select("id,booking_number,payment_provider,payment_reference,total_ore")
  .or("booking_number.eq."+reference+",payment_reference.eq."+reference)
  .limit(1)
  .maybeSingle();
 if(error)throw error;
 return data||null;
}

async function syncSnapshot(s,unit,reference,payment){
 const aggregate=payment?.aggregate||{};
 for(const key of ["authorizedAmount","cancelledAmount","capturedAmount","refundedAmount"]){
  if(aggregate[key])ensureNok(aggregate[key]);
 }
 const authorizedOre=amountValue(aggregate.authorizedAmount);
 const cancelledOre=amountValue(aggregate.cancelledAmount);
 const capturedOre=amountValue(aggregate.capturedAmount);
 const refundedOre=amountValue(aggregate.refundedAmount);

 const {data,error}=await s.rpc("sync_vipps_payment_snapshot",{
  target_unit:unit,
  target_reference:reference,
  payment_state_value:String(payment?.state||""),
  psp_reference_value:String(payment?.pspReference||""),
  authorized_ore_value:authorizedOre,
  cancelled_ore_value:cancelledOre,
  captured_ore_value:capturedOre,
  refunded_ore_value:refundedOre,
  capture_guaranteed_until_value:payment?.captureGuaranteedUntil||null
 });
 if(error)throw error;
 return {
  db:data,
  state:String(payment?.state||""),
  authorizedOre,
  cancelledOre,
  capturedOre,
  refundedOre,
  remainingCaptureOre:Math.max(0,authorizedOre-cancelledOre-capturedOre),
  remainingRefundOre:Math.max(0,capturedOre-refundedOre),
  captureGuaranteedUntil:payment?.captureGuaranteedUntil||null
 };
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 if(!vippsPaymentsEnabled())return NextResponse.json({error:"Vipps-betalingsmotoren er AV."},{status:409});

 const body=await req.json().catch(()=>({}));
 const unit=body.unit==="rental"?"rental":body.unit==="service"?"service":"";
 const action=String(body.action||"sync").toLowerCase();
 const reference=String(body.reference||"").trim();
 const amountOre=Math.round(Number(body.amountOre)||0);

 if(!unit||!reference)return NextResponse.json({error:"Salgssted eller betalingsreferanse mangler."},{status:400});
 if(!["sync","capture","cancel","refund"].includes(action))return NextResponse.json({error:"Ugyldig Vipps-handling."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 try{
  const target=await findTarget(s,unit,reference);
  if(!target)return NextResponse.json({error:"Fant ikke tilhørende ordre/booking."},{status:404});

  let payment=await getVippsPayment(unit,reference);
  let aggregate=payment?.aggregate||{};
  for(const key of ["authorizedAmount","cancelledAmount","capturedAmount","refundedAmount"]){
   if(aggregate[key])ensureNok(aggregate[key]);
  }

  const authorized=amountValue(aggregate.authorizedAmount);
  const cancelled=amountValue(aggregate.cancelledAmount);
  const captured=amountValue(aggregate.capturedAmount);
  const refunded=amountValue(aggregate.refundedAmount);
  const remainingCapture=Math.max(0,authorized-cancelled-captured);
  const remainingRefund=Math.max(0,captured-refunded);

  if(action==="capture"){
   if(!Number.isInteger(amountOre)||amountOre<=0)return NextResponse.json({error:"Capture-beløpet må være større enn 0."},{status:400});
   if(amountOre>remainingCapture)return NextResponse.json({error:"Beløpet er større enn gjenværende reservert beløp."},{status:409});
   await captureVippsPayment(unit,reference,amountOre);
   payment=await getVippsPayment(unit,reference);
  }else if(action==="cancel"){
   if(remainingCapture<=0)return NextResponse.json({error:"Det finnes ikke noe gjenværende reservert beløp å kansellere."},{status:409});
   await cancelVippsPayment(unit,reference);
   payment=await getVippsPayment(unit,reference);
  }else if(action==="refund"){
   if(!Number.isInteger(amountOre)||amountOre<=0)return NextResponse.json({error:"Refusjonsbeløpet må være større enn 0."},{status:400});
   if(amountOre>remainingRefund)return NextResponse.json({error:"Beløpet er større enn det som kan refunderes."},{status:409});
   await refundVippsPayment(unit,reference,amountOre);
   payment=await getVippsPayment(unit,reference);
  }

  const snapshot=await syncVippsPaymentSnapshot(s,unit,reference,payment);
  return NextResponse.json({ok:true,action,unit,reference,snapshot});
 }catch(error){
  console.error("VIPPS ADMIN PAYMENT ACTION ERROR",{
   unit,action,reference,status:error?.status,code:error?.code
  });
  if(error?.code==="VIPPS_CONFIG_INCOMPLETE")return NextResponse.json({error:"Vipps-konfigurasjonen er ikke komplett."},{status:409});
  if(error?.code==="VIPPS_PAYMENTS_DISABLED")return NextResponse.json({error:"Vipps-betalingsmotoren er AV."},{status:409});
  if(error?.message==="VIPPS_UNEXPECTED_CURRENCY")return NextResponse.json({error:"Vipps returnerte en annen valuta enn NOK."},{status:409});
  return NextResponse.json({error:"Vipps-handlingen kunne ikke fullføres."},{status:502});
 }
}
