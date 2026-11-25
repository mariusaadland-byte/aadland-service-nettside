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
import {sendVippsPaymentReceiptIfNeeded} from "../../../../lib/vippsPaymentReceipt";
import {sendVippsRefundNoticeIfNeeded} from "../../../../lib/vippsRefundNotice";
import {sendPaidRentalConfirmationIfNeeded} from "../../../../lib/rentalConfirmationEmail";

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

function amountValue(obj){
 const value=Number(obj?.value);
 return Number.isInteger(value)&&value>=0?value:0;
}

function ensureNok(obj){
 const currency=String(obj?.currency||"NOK").toUpperCase();
 if(currency!=="NOK"){
  const error=new Error("VIPPS_UNEXPECTED_CURRENCY");
  error.code="VIPPS_UNEXPECTED_CURRENCY";
  throw error;
 }
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const unit=body.unit==="rental"?"rental":body.unit==="service"?"service":"";
 const action=String(body.action||"sync").toLowerCase();
 const reference=String(body.reference||"").trim();
 const amountOre=unit==="service"?Number(body.amountOre??0):Math.round(Number(body.amountOre)||0);

 if(!unit||!reference)return NextResponse.json({error:"Salgssted eller betalingsreferanse mangler."},{status:400});
 if(!vippsPaymentsEnabled(unit))return NextResponse.json({error:"Vipps-betalingsmotoren er AV for dette salgsstedet."},{status:409});
 if(!["sync","capture","cancel","refund"].includes(action))return NextResponse.json({error:"Ugyldig Vipps-handling."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 try{
  const target=await findTarget(s,unit,reference);
  if(!target)return NextResponse.json({error:"Fant ikke tilhørende ordre/booking."},{status:404});

  // A unique order and a Vipps provider reference must be bound to the same
  // Service sale before a money-moving action is allowed.
  if(unit==="service"&&action!=="sync"&&
   String(target.payment_provider||"").toLowerCase()!=="vipps")
   return NextResponse.json({error:"Ordren er ikke registrert som Vipps-betaling."},{status:409});
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

  // S-30: claim is durable across tabs, instances and network retries.
  // Capture/refund/cancel never get a new random key from a repeated click.
  let serviceClaim=null;
  if(unit==="service"&&action!=="sync"){
   const intentId=String(body.intentId||"").trim();
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intentId))
    return NextResponse.json({error:"Betalingsforsøket mangler sikker ID. Oppdater siden og prøv igjen uten å sende to ganger."},{status:400});
   if(action==="capture"&&(!Number.isInteger(amountOre)||amountOre<=0||amountOre>remainingCapture))
    return NextResponse.json({error:"Capture-beløpet må være gyldig og innenfor restreservasjonen."},{status:409});
   if(action==="refund"&&(!Number.isInteger(amountOre)||amountOre<=0||amountOre>remainingRefund))
    return NextResponse.json({error:"Refusjonsbeløpet må være gyldig og innenfor restbeløpet."},{status:409});
   if(action==="cancel"&&remainingCapture<=0)
    return NextResponse.json({error:"Ingen reservert beløp å kansellere."},{status:409});
   const {data:claim,error:claimError}=await s.rpc("claim_vipps_service_action",{
    p_order_id:target.id,p_reference:reference,p_request_id:intentId,
    p_action:action,p_amount_ore:action==="cancel"?0:amountOre
   });
   if(claimError)return NextResponse.json({
    error:"Sikker betalingslås er utilgjengelig. Ingen Vipps-handling er sendt."},{status:503});
   if(claim?.state!=="claimed"||!claim?.attempt_id||!claim?.idempotency_key)
    return NextResponse.json({
     error:claim?.state==="recent_same_action"
      ?"Samme handling og beløp er allerede registrert nylig. Kontroller Vipps-status før en ny handling."
      :claim?.state==="unresolved"||claim?.state==="duplicate_intent"
       ?"Et Vipps-forsøk på denne ordren er allerede i gang eller må kontrolleres. Ikke gjenta betaling/refusjon."
       :"Betalingshandlingen er ikke godkjent. Oppdater ordren og kontroller status.",
     needsReview:claim?.state==="unresolved",state:claim?.state
    },{status:409});
   serviceClaim=claim;
  }
  if(serviceClaim){
   let providerResult;
   try{
    if(action==="capture")
     providerResult=await captureVippsPayment(unit,reference,amountOre,{idempotencyKey:serviceClaim.idempotency_key});
    else if(action==="cancel")
     providerResult=await cancelVippsPayment(unit,reference,{idempotencyKey:serviceClaim.idempotency_key});
    else
     providerResult=await refundVippsPayment(unit,reference,amountOre,{idempotencyKey:serviceClaim.idempotency_key});
    // Provider acceptance is committed BEFORE any status refresh or e-mail.
    const {data:accepted,error:ackError}=await s.rpc("ack_vipps_service_action",{
     p_attempt_id:serviceClaim.attempt_id,
     p_provider_evidence:{
      providerReference:String(providerResult?.pspReference||"").slice(0,120),
      action,amountOre,
      acceptedByApi:true
     }
    });
    if(ackError||!accepted?.accepted)throw Error("provider_accepted_but_database_unconfirmed");
   }catch(err){
    try{
     const {data:held,error:holdErr}=await s.rpc("hold_vipps_service_action",{
      p_attempt_id:serviceClaim.attempt_id,
      p_issue:"provider_status_uncertain"
     });
     if(holdErr||!held?.held)console.error("S30 HOLD UNCONFIRMED",{id:serviceClaim.attempt_id});
    }catch{console.error("S30 HOLD RPC UNAVAILABLE",{id:serviceClaim.attempt_id});}
    return NextResponse.json({
     error:"Vipps-resultatet er uavklart. Ikke trykk igjen. Kontroller hendelsesloggen i Vipps og avklar forsøket i administrasjonen.",
     needsReview:true,attemptId:serviceClaim.attempt_id
    },{status:409});
   }
   try{payment=await getVippsPayment(unit,reference);}
   catch(err){
    console.error("S30 POST ACTION REFRESH FAILED",{action,reference});
    return NextResponse.json({
     ok:true,providerAccepted:true,action,unit,reference,
     warning:"Vipps tok imot handlingen, men statusoppdateringen feilet. Ikke send samme handling på nytt; velg Synk Vipps-status."
    });
   }
  }else if(action==="capture"){
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
  let receipt=null;
  let receiptWarning="";
  let rentalConfirmation=null;
  let rentalConfirmationWarning="";
  let refundNotice=null;
  let refundNoticeWarning="";
  if(String(snapshot?.db?.status||"").toLowerCase()==="paid"){
   try{
    receipt=await sendVippsPaymentReceiptIfNeeded({s,unit,id:target.id,req});
   }catch(error){
    receiptWarning="Betalingen er oppdatert, men kvitteringen kunne ikke sendes med én gang. Systemet prøver automatisk igjen.";
    console.error("VIPPS ADMIN RECEIPT ERROR",{unit,reference,message:error?.message});
   }
   if(unit==="rental"){
    try{
     rentalConfirmation=await sendPaidRentalConfirmationIfNeeded({s,id:target.id,req});
    }catch(error){
     rentalConfirmationWarning="Leiebetalingen er registrert, men den endelige leiebekreftelsen kunne ikke sendes med én gang. Systemet prøver automatisk igjen.";
     console.error("VIPPS ADMIN RENTAL CONFIRMATION ERROR",{reference,message:error?.message});
    }
   }
  }
  if(Number(snapshot?.refundedOre||0)>0){
   try{
    refundNotice=await sendVippsRefundNoticeIfNeeded({s,unit,id:target.id,req});
   }catch(error){
    refundNoticeWarning="Tilbakebetalingen er registrert, men kundebekreftelsen kunne ikke sendes med én gang. Systemet prøver automatisk igjen.";
    console.error("VIPPS ADMIN REFUND NOTICE ERROR",{unit,reference,message:error?.message});
   }
  }
  return NextResponse.json({ok:true,action,unit,reference,snapshot,receipt,receiptWarning,rentalConfirmation,rentalConfirmationWarning,refundNotice,refundNoticeWarning});
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
