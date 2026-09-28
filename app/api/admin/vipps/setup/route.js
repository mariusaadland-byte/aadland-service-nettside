import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {
 vippsConfig,
 vippsPublicStatus,
 listVippsWebhooks,
 registerVippsWebhook,
 deleteVippsWebhook
} from "../../../../../lib/vipps";

export const dynamic="force-dynamic";

const EVENTS=[
 "epayments.payment.created.v1",
 "epayments.payment.authorized.v1",
 "epayments.payment.aborted.v1",
 "epayments.payment.expired.v1",
 "epayments.payment.cancelled.v1",
 "epayments.payment.captured.v1",
 "epayments.payment.refunded.v1",
 "epayments.payment.terminated.v1"
];

async function requireAdmin(){
 const user=await getAdminUser();
 if(!user)return {error:NextResponse.json({error:"Ikke innlogget."},{status:401})};
 if(!(await hasPermission("canUpdateOrders")))return {error:NextResponse.json({error:"Du har ikke tilgang til Vipps-oppsettet."},{status:403})};
 return {user};
}

function callbackBase(req){
 const requestUrl=new URL(req.url);
 const raw=process.env.VERCEL_ENV==="preview"
  ?(process.env.VERCEL_BRANCH_URL||process.env.VERCEL_URL||requestUrl.host)
  :(process.env.NEXT_PUBLIC_SITE_URL||requestUrl.origin);
 const base=/^https?:\/\//i.test(raw)?raw:"https://"+raw;
 return base.replace(/\/$/,"");
}

function summarizeWebhook(webhook){
 let displayUrl="";
 try{
  const url=new URL(String(webhook?.url||""));
  displayUrl=url.origin+url.pathname;
 }catch{
  displayUrl=String(webhook?.url||"").split("?")[0];
 }
 return {
  id:String(webhook?.id||""),
  url:displayUrl,
  events:Array.isArray(webhook?.events)?webhook.events:[]
 };
}

export async function GET(req){
 const access=await requireAdmin();
 if(access.error)return access.error;
 const status=vippsPublicStatus();
 const bypassConfigured=Boolean(String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET||"").trim());
 if(!status.credentialsReady){
  return NextResponse.json({
   status,
   bypassConfigured,
   vercelEnvironment:process.env.VERCEL_ENV||"development",
   webhooks:[]
  },{headers:{"Cache-Control":"private, no-store, max-age=0"}});
 }
 try{
  const webhooks=await listVippsWebhooks({allowDisabled:true});
  return NextResponse.json({
   status,
   bypassConfigured,
   vercelEnvironment:process.env.VERCEL_ENV||"development",
   webhooks:webhooks.map(summarizeWebhook)
  },{headers:{"Cache-Control":"private, no-store, max-age=0"}});
 }catch(error){
  console.error("VIPPS SETUP GET ERROR",error);
  return NextResponse.json({
   status,
   bypassConfigured,
   vercelEnvironment:process.env.VERCEL_ENV||"development",
   webhooks:[],
   connectionError:"Kunne ikke koble til Vipps med gjeldende nøkler."
  },{headers:{"Cache-Control":"private, no-store, max-age=0"}});
 }
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const access=await requireAdmin();
 if(access.error)return access.error;
 const config=vippsConfig();
 if(!config.complete||config.productionMismatch)return NextResponse.json({error:"Vipps mangler gyldige API-nøkler eller har feil miljø."},{status:409});
 const body=await req.json().catch(()=>({}));
 const action=String(body.action||"");
 const s=db(); if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 if(action==="test-connection"){
  try{
   const webhooks=await listVippsWebhooks({allowDisabled:true});
   return NextResponse.json({ok:true,count:webhooks.length});
  }catch(error){
   console.error("VIPPS CONNECTION TEST ERROR",error);
   return NextResponse.json({error:"Vipps-forbindelsen feilet. Kontroller testnøklene og MSN."},{status:502});
  }
 }

 if(action==="register-webhook"){
  const base=callbackBase(req);
  let callbackUrl=base+"/api/payments/vipps/webhook";
  if(process.env.VERCEL_ENV==="preview"){
   const bypass=String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET||"").trim();
   if(!bypass){
    return NextResponse.json({
     error:"Preview er Vercel-beskyttet. Aktiver Protection Bypass for Automation i Vercel før webhooken registreres.",
     code:"vercel_bypass_missing"
    },{status:409});
   }
   callbackUrl+="?x-vercel-protection-bypass="+encodeURIComponent(bypass);
  }

  try{
   const registered=await registerVippsWebhook({url:callbackUrl,events:EVENTS,allowDisabled:true});
   const webhookId=String(registered?.id||"").trim();
   const secret=String(registered?.secret||"").trim();
   if(!webhookId||!secret)throw new Error("VIPPS_WEBHOOK_RESPONSE_INCOMPLETE");
   const {error:storeError}=await s.rpc("upsert_vipps_webhook_registration",{
    target_webhook_id:webhookId,
    target_environment:config.environment,
    target_secret:secret,
    target_callback_url:callbackUrl,
    target_events:EVENTS
   });
   if(storeError){
    console.error("VIPPS WEBHOOK SECRET STORE ERROR",storeError);
    try{await deleteVippsWebhook(webhookId,{allowDisabled:true})}catch(cleanupError){console.error("VIPPS WEBHOOK CLEANUP ERROR",cleanupError)}
    return NextResponse.json({error:"Webhooken ble opprettet hos Vipps, men hemmeligheten kunne ikke lagres sikkert. Registreringen er forsøkt slettet."},{status:500});
   }
   return NextResponse.json({
    ok:true,
    webhook:{
     id:webhookId,
     url:base+"/api/payments/vipps/webhook",
     events:EVENTS
    }
   });
  }catch(error){
   console.error("VIPPS WEBHOOK REGISTER ERROR",error);
   return NextResponse.json({error:"Webhooken kunne ikke registreres hos Vipps."},{status:502});
  }
 }

 if(action==="delete-webhook"){
  const webhookId=String(body.webhookId||"").trim();
  if(!webhookId)return NextResponse.json({error:"Webhook-ID mangler."},{status:400});
  try{
   await deleteVippsWebhook(webhookId,{allowDisabled:true});
   const {error:deactivateError}=await s.rpc("deactivate_vipps_webhook_registration",{
    target_webhook_id:webhookId,
    target_environment:config.environment
   });
   if(deactivateError)console.error("VIPPS WEBHOOK DEACTIVATE ERROR",deactivateError);
   return NextResponse.json({ok:true});
  }catch(error){
   console.error("VIPPS WEBHOOK DELETE ERROR",error);
   return NextResponse.json({error:"Webhooken kunne ikke slettes hos Vipps."},{status:502});
  }
 }

 return NextResponse.json({error:"Ugyldig handling."},{status:400});
}
