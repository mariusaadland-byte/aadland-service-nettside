import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {db} from "../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../lib/vippsConfig";
import {
 registerVippsWebhook,
 deleteVippsWebhook,
 VIPPS_PAYMENT_WEBHOOK_EVENTS
} from "../../../../lib/vippsClient";

export const runtime="nodejs";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return false;
 return user.role==="owner"||await hasPermission("canUpdateOrders");
}

function env(){
 return String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
}

function callbackUrl(){
 const explicit=String(process.env.VIPPS_WEBHOOK_URL||"").trim().replace(/\/$/,"");
 if(explicit)return explicit;
 const base=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
 return base?base+"/api/vipps/webhook":"";
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});

 const body=await req.json().catch(()=>({}));
 const unit=body.unit==="rental"?"rental":body.unit==="service"?"service":"";
 if(!unit)return NextResponse.json({error:"Ugyldig salgssted."},{status:400});

 const config=vippsUnitConfig(unit);
 if(!config.configured)return NextResponse.json({error:"Vipps-konfigurasjonen mangler: "+config.missing.join(", ")+"."},{status:409});

 const url=callbackUrl();
 if(!url||!url.startsWith("https://"))return NextResponse.json({error:"VIPPS_WEBHOOK_URL eller NEXT_PUBLIC_SITE_URL må være en gyldig https-adresse."},{status:409});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const {data:existing,error:statusError}=await s.rpc("get_vipps_webhook_status",{target_environment:env()});
 if(statusError)return NextResponse.json({error:"Webhook-status kunne ikke kontrolleres."},{status:500});
 const current=(Array.isArray(existing)?existing:[]).find(item=>item?.unit===unit);
 const replace=body.replace===true;
 if(current&&!replace){
  return NextResponse.json({error:"Dette salgsstedet har allerede en aktiv webhook.",alreadyRegistered:true},{status:409});
 }

 let registration;
 try{
  registration=await registerVippsWebhook(unit,url,VIPPS_PAYMENT_WEBHOOK_EVENTS,{allowDisabled:true});
 }catch(error){
  console.error("VIPPS WEBHOOK REGISTER ERROR",{unit,status:error.status,body:error.body});
  return NextResponse.json({error:"Vipps-webhooken kunne ikke registreres."},{status:502});
 }

 const webhookId=String(registration?.id||"").trim();
 const secret=String(registration?.secret||"").trim();
 if(!webhookId||!secret){
  return NextResponse.json({error:"Vipps svarte uten webhook-id eller secret."},{status:502});
 }

 const {error:saveError}=await s.rpc("upsert_vipps_webhook_registration_v2",{
  target_webhook_id:webhookId,
  target_environment:env(),
  target_secret:secret,
  target_callback_url:url,
  target_events:VIPPS_PAYMENT_WEBHOOK_EVENTS,
  target_unit:unit,
  target_msn:config.values.msn
 });
 if(saveError){
  console.error("VIPPS WEBHOOK SAVE ERROR",{unit,webhookId,error:saveError.message});
  try{await deleteVippsWebhook(unit,webhookId,{allowDisabled:true})}catch{}
  return NextResponse.json({error:"Webhooken ble opprettet hos Vipps, men kunne ikke lagres sikkert. Den nye registreringen er forsøkt slettet."},{status:500});
 }

 let replacementWarning="";
 if(current?.webhookId&&replace){
  try{
   await deleteVippsWebhook(unit,current.webhookId,{allowDisabled:true});
   await s.rpc("deactivate_vipps_webhook_registration",{
    target_webhook_id:current.webhookId,
    target_environment:env()
   });
  }catch(error){
   replacementWarning="Ny webhook er aktiv, men gammel webhook kunne ikke slettes automatisk.";
   console.error("VIPPS OLD WEBHOOK DELETE ERROR",{unit,webhookId:current.webhookId,status:error.status});
  }
 }

 return NextResponse.json({
  ok:true,
  unit,
  webhook:{id:webhookId,url,events:VIPPS_PAYMENT_WEBHOOK_EVENTS},
  warning:replacementWarning
 });
}
