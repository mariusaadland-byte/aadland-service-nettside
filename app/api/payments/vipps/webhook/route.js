import {NextResponse} from "next/server";
import {db} from "../../../../../lib/supabase";
import {getVippsPayment,verifyVippsWebhook,vippsConfig} from "../../../../../lib/vipps";
import {syncVippsOrderFromPayment} from "../../../../../lib/vippsOrder";

export const dynamic="force-dynamic";

export async function POST(req){
 const config=vippsConfig();
 if(!config.complete||config.productionMismatch)return NextResponse.json({error:"Vipps er ikke konfigurert."},{status:404});
 const webhookId=String(req.headers.get("webhook-id")||"").trim();
 if(!webhookId)return NextResponse.json({error:"Webhook-Id mangler."},{status:401});
 const s=db(); if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:webhookAuth,error:secretError}=await s.rpc("get_vipps_webhook_auth",{
  target_webhook_id:webhookId,
  target_environment:config.environment
 });
 if(secretError){
  console.error("VIPPS WEBHOOK SECRET LOOKUP ERROR",secretError);
  return NextResponse.json({error:"Webhook kunne ikke autentiseres."},{status:500});
 }
 const webhookSecret=String(webhookAuth?.secret||"");
 const registeredUrl=String(webhookAuth?.callback_url||"");
 if(!webhookSecret||!registeredUrl)return NextResponse.json({error:"Ukjent webhook."},{status:401});
 let signingUrl;
 try{signingUrl=new URL(registeredUrl)}catch{return NextResponse.json({error:"Webhook-oppsettet er ugyldig."},{status:500})}
 const rawBody=await req.text();
 const dateHeader=req.headers.get("x-ms-date")||"";
 const contentHashHeader=req.headers.get("x-ms-content-sha256")||"";
 const authorization=req.headers.get("authorization")||req.headers.get("x-vipps-authorization")||"";
 const valid=verifyVippsWebhook({
  rawBody,
  method:"POST",
  pathAndQuery:signingUrl.pathname+signingUrl.search,
  host:signingUrl.host,
  dateHeader,
  contentHashHeader,
  authorization,
  secret:webhookSecret
 });
 if(!valid)return NextResponse.json({error:"Ugyldig webhook-signatur."},{status:401});

 let payload;
 try{payload=JSON.parse(rawBody)}catch{return NextResponse.json({error:"Ugyldig payload."},{status:400})}
 if(String(payload?.msn||"")!==config.msn)return NextResponse.json({error:"Feil salgssted."},{status:403});
 const reference=String(payload?.reference||"").trim();
 const pspReference=String(payload?.pspReference||"").trim();
 const eventName=String(payload?.name||"").trim().toUpperCase();
 const amountOre=Math.max(0,Math.round(Number(payload?.amount?.value)||0));
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference)||!pspReference||!eventName)return NextResponse.json({error:"Webhook mangler påkrevde felt."},{status:400});

 const {data:recorded,error:recordError}=await s.rpc("record_vipps_payment_event_once",{
  event_psp_reference:pspReference,
  event_payment_reference:reference,
  event_name:eventName,
  event_amount_ore:amountOre,
  event_payload:payload
 });
 if(recordError){
  console.error("VIPPS WEBHOOK EVENT RECORD ERROR",recordError);
  return NextResponse.json({error:"Webhook kunne ikke registreres."},{status:500});
 }
 if(recorded!==true)return NextResponse.json({ok:true,duplicate:true});

 const {data:order,error:orderError}=await s.from("orders").select("*").eq("payment_provider","vipps").eq("payment_reference",reference).maybeSingle();
 if(orderError){
  console.error("VIPPS WEBHOOK ORDER LOOKUP ERROR",orderError);
  return NextResponse.json({error:"Ordren kunne ikke hentes."},{status:500});
 }
 if(!order)return NextResponse.json({ok:true,ignored:true});

 try{
  const payment=await getVippsPayment(reference,{allowDisabled:true});
  await syncVippsOrderFromPayment(s,order,payment);
  return NextResponse.json({ok:true});
 }catch(error){
  console.error("VIPPS WEBHOOK SYNC ERROR",error);
  return NextResponse.json({error:"Vipps-status kunne ikke synkroniseres."},{status:500});
 }
}
