import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {vippsPaymentsEnabled} from "../../../../lib/vippsClient";
import {verifyVippsWebhookRequest} from "../../../../lib/vippsWebhook";
import {sendVippsPaymentReceiptIfNeeded} from "../../../../lib/vippsPaymentReceipt";
import {sendVippsRefundNoticeIfNeeded} from "../../../../lib/vippsRefundNotice";
import {sendPaidRentalConfirmationIfNeeded} from "../../../../lib/rentalConfirmationEmail";

export const runtime="nodejs";

function environment(){
 return String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
}

export async function POST(req){
 if(!vippsPaymentsEnabled()){
  return NextResponse.json({error:"Vipps payment handling is disabled."},{status:503});
 }

 const webhookId=String(req.headers.get("webhook-id")||"").trim();
 if(!webhookId)return NextResponse.json({error:"Missing webhook id."},{status:401});

 const s=db();
 if(!s)return NextResponse.json({error:"Database unavailable."},{status:503});

 const {data:auth,error:authError}=await s.rpc("get_vipps_webhook_auth",{
  target_webhook_id:webhookId,
  target_environment:environment()
 });
 if(authError){
  console.error("VIPPS WEBHOOK AUTH LOOKUP ERROR",{webhookId,error:authError.message});
  return NextResponse.json({error:"Webhook authentication unavailable."},{status:503});
 }
 if(!auth?.secret||!auth?.unit){
  return NextResponse.json({error:"Unknown webhook."},{status:401});
 }

 const rawBody=await req.text();
 const verified=verifyVippsWebhookRequest(req,rawBody,auth.secret);
 if(!verified.ok){
  console.warn("VIPPS WEBHOOK REJECTED",{webhookId,reason:verified.error});
  return NextResponse.json({error:"Invalid webhook signature."},{status:401});
 }

 let payload;
 try{payload=JSON.parse(rawBody)}catch{
  return NextResponse.json({error:"Invalid JSON."},{status:400});
 }

 const unit=String(auth.unit||"").toLowerCase();
 if(!["service","rental"].includes(unit)){
  return NextResponse.json({error:"Invalid webhook unit."},{status:409});
 }

 const payloadMsn=String(payload?.msn||"").trim();
 const registeredMsn=String(auth.msn||"").trim();
 if(registeredMsn&&payloadMsn&&!safeMsnMatch(registeredMsn,payloadMsn)){
  console.warn("VIPPS WEBHOOK MSN MISMATCH",{webhookId,unit});
  return NextResponse.json({error:"Webhook sales unit mismatch."},{status:401});
 }

 const reference=String(payload?.reference||"").trim();
 const pspReference=String(payload?.pspReference||"").trim();
 const eventName=String(payload?.name||"").trim().toUpperCase();
 const rawIdempotencyKey=String(payload?.idempotencyKey||"").trim();
 const idempotencyKey=rawIdempotencyKey||("psp-"+eventName+"-"+pspReference);
 const amountOre=Number(payload?.amount?.value);
 const timestamp=String(payload?.timestamp||"").trim()||null;
 const captureGuaranteedUntil=String(payload?.captureGuaranteedUntil||"").trim()||null;

 if(!reference||!pspReference||!eventName){
  return NextResponse.json({error:"Incomplete webhook payload."},{status:400});
 }
 if(!Number.isInteger(amountOre)||amountOre<0){
  return NextResponse.json({error:"Invalid webhook amount."},{status:400});
 }

 if(payload?.success===false){
  console.warn("VIPPS WEBHOOK UNSUCCESSFUL EVENT",{webhookId,unit,reference,eventName,pspReference});
  return NextResponse.json({ok:true,ignored:true});
 }

 const {data:processed,error:processError}=await s.rpc("process_vipps_payment_event_once",{
  event_unit:unit,
  event_idempotency_key:idempotencyKey,
  event_psp_reference:pspReference,
  event_payment_reference:reference,
  event_name:eventName,
  event_amount_ore:amountOre,
  event_timestamp_value:timestamp,
  capture_guaranteed_until_value:captureGuaranteedUntil,
  event_payload:payload
 });

 if(processError){
  console.error("VIPPS WEBHOOK PROCESS ERROR",{
   webhookId,unit,reference,eventName,error:processError.message
  });
  return NextResponse.json({error:"Webhook processing failed."},{status:500});
 }

 if(eventName==="CAPTURED"||eventName==="REFUNDED"){
  try{
   let targetId=processed?.applied?.id||null;
   if(!targetId){
    const table=unit==="rental"?"rental_bookings":"orders";
    const numberColumn=unit==="rental"?"booking_number":"order_number";
    const {data:target}=await s.from(table)
     .select("id")
     .or(numberColumn+".eq."+reference+",payment_reference.eq."+reference)
     .limit(1)
     .maybeSingle();
    targetId=target?.id||null;
   }
   if(targetId&&eventName==="CAPTURED"){
    try{
     const receipt=await sendVippsPaymentReceiptIfNeeded({s,unit,id:targetId,req});
     if(receipt?.sent)console.log("VIPPS RECEIPT SENT",{unit,reference});
    }catch(error){
     console.error("VIPPS RECEIPT BEST EFFORT ERROR",{unit,reference,message:error?.message});
    }
    if(unit==="rental"){
     try{
      const confirmation=await sendPaidRentalConfirmationIfNeeded({s,id:targetId,req});
      if(confirmation?.sent)console.log("VIPPS RENTAL CONFIRMATION SENT",{reference});
     }catch(error){
      console.error("VIPPS RENTAL CONFIRMATION BEST EFFORT ERROR",{reference,message:error?.message});
     }
    }
   }
   if(targetId&&eventName==="REFUNDED"){
    try{
     const notice=await sendVippsRefundNoticeIfNeeded({s,unit,id:targetId,req});
     if(notice?.sent)console.log("VIPPS REFUND NOTICE SENT",{unit,reference});
    }catch(error){
     console.error("VIPPS REFUND NOTICE BEST EFFORT ERROR",{unit,reference,message:error?.message});
    }
   }
  }catch(error){
   console.error("VIPPS PAYMENT NOTICE BEST EFFORT ERROR",{unit,reference,eventName,message:error?.message});
  }
 }

 return NextResponse.json({ok:true,duplicate:processed?.duplicate===true});
}

function safeMsnMatch(a,b){
 return String(a).trim()===String(b).trim();
}
