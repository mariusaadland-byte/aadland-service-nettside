import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {db} from "../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../lib/vippsConfig";
import {testVippsApiConnection,VIPPS_PAYMENT_WEBHOOK_EVENTS} from "../../../../lib/vippsClient";

export const runtime="nodejs";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return false;
 return user.role==="owner"||await hasPermission("canUpdateOrders");
}

function environment(){
 return String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
}

function expectedCallbackUrl(){
 const explicit=String(process.env.VIPPS_WEBHOOK_URL||"").trim().replace(/\/$/,"");
 if(explicit)return explicit;
 const base=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
 return base?base+"/api/vipps/webhook":"";
}

function normalizeUrl(value){
 try{
  const u=new URL(String(value||""));
  u.hash="";
  return u.toString().replace(/\/$/,"");
 }catch{return ""}
}

function eventsMatch(actual){
 const wanted=new Set(VIPPS_PAYMENT_WEBHOOK_EVENTS);
 const got=new Set(Array.isArray(actual)?actual:[]);
 return [...wanted].every(event=>got.has(event));
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});

 const body=await req.json().catch(()=>({}));
 const unit=body.unit==="rental"?"rental":body.unit==="service"?"service":"";
 if(!unit)return NextResponse.json({error:"Ugyldig salgssted."},{status:400});

 const config=vippsUnitConfig(unit);
 if(!config.configured){
  return NextResponse.json({
   ok:false,
   unit,
   apiConnection:false,
   readyForEnable:false,
   error:"Vipps-konfigurasjonen mangler: "+config.missing.join(", ")+"."
  },{status:409});
 }

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const env=environment();
 const expectedUrl=normalizeUrl(expectedCallbackUrl());
 if(!expectedUrl){
  return NextResponse.json({error:"Webhook-URL er ikke konfigurert."},{status:409});
 }

 let remote;
 try{
  remote=await testVippsApiConnection(unit);
 }catch(error){
  console.error("VIPPS DIAGNOSTICS API ERROR",{unit,status:error?.status,body:error?.body});
  return NextResponse.json({
   ok:false,
   unit,
   apiConnection:false,
   readyForEnable:false,
   error:"API-nøklene kunne ikke bekreftes mot Vipps."
  },{status:502});
 }

 const {data:stored,error:storedError}=await s.rpc("get_vipps_webhook_status",{target_environment:env});
 if(storedError){
  console.error("VIPPS DIAGNOSTICS DB WEBHOOK ERROR",{unit,message:storedError.message});
  return NextResponse.json({error:"Lokal webhook-status kunne ikke leses."},{status:500});
 }

 const localRegistrations=(Array.isArray(stored)?stored:[]).filter(item=>item?.unit===unit);
 const local=localRegistrations[0]||null;
 const remoteWebhooks=Array.isArray(remote?.webhooks)?remote.webhooks:[];
 const remoteById=local?.webhookId
  ?remoteWebhooks.find(item=>String(item?.id||"")===String(local.webhookId))
  :null;
 const remoteByUrl=remoteWebhooks.filter(item=>normalizeUrl(item?.url)===expectedUrl);
 const activeRemote=remoteById||remoteByUrl[0]||null;

 const callbackUrlMatches=Boolean(activeRemote&&normalizeUrl(activeRemote.url)===expectedUrl);
 const eventsComplete=Boolean(activeRemote&&eventsMatch(activeRemote.events));
 const idMatches=Boolean(local&&activeRemote&&String(local.webhookId)===String(activeRemote.id));
 const msnMatches=Boolean(local&&String(local.msn||"")===String(config.values.msn||""));
 const webhookStored=Boolean(local);
 const webhookFoundAtVipps=Boolean(activeRemote);
 const duplicateCallbackCount=remoteByUrl.length;

 const checks={
  credentials:true,
  apiConnection:true,
  webhookStored,
  webhookFoundAtVipps,
  webhookIdMatches:idMatches,
  callbackUrlMatches,
  eventsComplete,
  msnMatches,
  noDuplicateCallback:duplicateCallbackCount<=1,
  oneLocalActiveWebhook:localRegistrations.length===1
 };
 const readyForEnable=Object.values(checks).every(Boolean);

 return NextResponse.json({
  ok:true,
  unit,
  label:config.label,
  environment:env,
  apiConnection:true,
  readyForEnable,
  checks,
  duplicateCallbackCount,
  localActiveWebhookCount:localRegistrations.length,
  remoteWebhookCount:remoteWebhooks.length,
  expectedCallbackConfigured:Boolean(expectedUrl)
 });
}
