import "server-only";
import crypto from "crypto";

const SYSTEM_HEADERS={
 "Vipps-System-Name":"aadlandservice",
 "Vipps-System-Version":"1.0.0",
 "Vipps-System-Plugin-Name":"aadlandweb",
 "Vipps-System-Plugin-Version":"1.0.0"
};

let cachedToken=null;
let cachedTokenExpiresAt=0;

export function vippsConfig(){
 const enabled=String(process.env.VIPPS_ENABLED||"").toLowerCase()==="true";
 const environment=String(process.env.VIPPS_ENVIRONMENT||"test").toLowerCase()==="production"?"production":"test";
 const clientId=String(process.env.VIPPS_CLIENT_ID||"").trim();
 const clientSecret=String(process.env.VIPPS_CLIENT_SECRET||"").trim();
 const subscriptionKey=String(process.env.VIPPS_SUBSCRIPTION_KEY||"").trim();
 const msn=String(process.env.VIPPS_MSN||"").trim();
 const complete=Boolean(clientId&&clientSecret&&subscriptionKey&&/^[0-9]{4,10}$/.test(msn));
 const productionMismatch=process.env.VERCEL_ENV==="production"&&environment!=="production";
 return {
  enabled:enabled&&complete&&!productionMismatch,
  requested:enabled,
  complete,
  productionMismatch,
  environment,
  clientId,
  clientSecret,
  subscriptionKey,
  msn,
  baseUrl:environment==="production"?"https://api.vipps.no":"https://apitest.vipps.no"
 };
}

export function vippsPublicStatus(){
 const c=vippsConfig();
 const missing=[];
 if(!c.clientId)missing.push("VIPPS_CLIENT_ID");
 if(!c.clientSecret)missing.push("VIPPS_CLIENT_SECRET");
 if(!c.subscriptionKey)missing.push("VIPPS_SUBSCRIPTION_KEY");
 if(!/^[0-9]{4,10}$/.test(c.msn))missing.push("VIPPS_MSN");
 return {
  enabled:c.enabled,
  credentialsReady:c.complete&&!c.productionMismatch,
  featureRequested:c.requested,
  environment:c.environment,
  reason:!c.requested?(c.complete&&!c.productionMismatch?"configured_disabled":"disabled"):!c.complete?"missing_configuration":c.productionMismatch?"environment_mismatch":"ready",
  missing
 };
}

function authHeaders(config,token){
 return {
  "Authorization":"Bearer "+token,
  "Ocp-Apim-Subscription-Key":config.subscriptionKey,
  "Merchant-Serial-Number":config.msn,
  ...SYSTEM_HEADERS
 };
}

async function vippsRequest(path,{method="GET",body=null,idempotencyKey=null,allowDisabled=false}={}){
 const config=vippsConfig();
 const usable=allowDisabled?(config.complete&&!config.productionMismatch):config.enabled;
 if(!usable)throw new Error("VIPPS_NOT_CONFIGURED");
 const token=await getVippsAccessToken(config);
 const headers={
  "Content-Type":"application/json",
  ...authHeaders(config,token)
 };
 if(idempotencyKey)headers["Idempotency-Key"]=String(idempotencyKey).slice(0,50);
 const response=await fetch(config.baseUrl+path,{
  method,
  headers,
  body:body==null?undefined:JSON.stringify(body),
  cache:"no-store"
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const error=new Error(data?.detail||data?.title||data?.message||"Vipps-kallet feilet.");
  error.status=response.status;
  error.data=data;
  throw error;
 }
 return data;
}

export async function getVippsAccessToken(existingConfig=null){
 const config=existingConfig||vippsConfig();
 if(!config.complete||config.productionMismatch)throw new Error("VIPPS_NOT_CONFIGURED");
 const now=Date.now();
 if(cachedToken&&cachedTokenExpiresAt-now>60000)return cachedToken;
 const response=await fetch(config.baseUrl+"/accesstoken/get",{
  method:"POST",
  headers:{
   "Content-Type":"application/json",
   "client_id":config.clientId,
   "client_secret":config.clientSecret,
   "Ocp-Apim-Subscription-Key":config.subscriptionKey,
   "Merchant-Serial-Number":config.msn,
   ...SYSTEM_HEADERS
  },
  body:"",
  cache:"no-store"
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw new Error(data?.error_description||data?.message||"Kunne ikke autentisere mot Vipps.");
 const expiresIn=Math.max(60,Number(data.expires_in)||3600);
 cachedToken=data.access_token;
 cachedTokenExpiresAt=now+expiresIn*1000;
 return cachedToken;
}

export function createVippsReference(orderNumber){
 const clean=String(orderNumber||"").replace(/[^a-zA-Z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
 const suffix=crypto.randomBytes(4).toString("hex");
 return ("AS-"+clean+"-"+suffix).slice(0,64);
}

function vippsIdempotencyKey(action,reference,value=""){
 const digest=crypto.createHash("sha256").update(String(action)+"|"+String(reference)+"|"+String(value)).digest("hex").slice(0,32);
 return (String(action).replace(/[^a-z0-9-]/gi,"-").slice(0,12)+"-"+digest).slice(0,50);
}

export async function createVippsPayment({reference,amountOre,returnUrl,description}){
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference))throw new Error("VIPPS_INVALID_REFERENCE");
 const value=Math.round(Number(amountOre)||0);
 if(value<=0)throw new Error("VIPPS_INVALID_AMOUNT");
 return vippsRequest("/epayment/v1/payments",{
  method:"POST",
  idempotencyKey:vippsIdempotencyKey("create",reference,value),
  body:{
   amount:{currency:"NOK",value},
   paymentMethod:{type:"WALLET"},
   reference,
   returnUrl,
   userFlow:"WEB_REDIRECT",
   paymentDescription:String(description||"Aadland Service").slice(0,100)
  }
 });
}

export async function getVippsPayment(reference,{allowDisabled=false}={}){
 return vippsRequest("/epayment/v1/payments/"+encodeURIComponent(reference),{allowDisabled});
}

export async function captureVippsPayment(reference,amountOre){
 const value=Math.round(Number(amountOre)||0);
 if(value<=0)throw new Error("VIPPS_INVALID_AMOUNT");
 return vippsRequest("/epayment/v1/payments/"+encodeURIComponent(reference)+"/capture",{
  method:"POST",
  idempotencyKey:vippsIdempotencyKey("capture",reference,value),
  body:{modificationAmount:{currency:"NOK",value}}
 });
}

export async function cancelVippsPayment(reference,{cancelTransactionOnly=false}={}){
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference))throw new Error("VIPPS_INVALID_REFERENCE");
 return vippsRequest("/epayment/v1/payments/"+encodeURIComponent(reference)+"/cancel",{
  method:"POST",
  body:cancelTransactionOnly?{cancelTransactionOnly:true}:{}
 });
}

export async function registerVippsWebhook({url,events,allowDisabled=false}){
 const callbackUrl=String(url||"").trim();
 if(!/^https:\/\//i.test(callbackUrl))throw new Error("VIPPS_WEBHOOK_URL_INVALID");
 const list=Array.isArray(events)?events.map(value=>String(value||"").trim()).filter(Boolean):[];
 if(!list.length)throw new Error("VIPPS_WEBHOOK_EVENTS_REQUIRED");
 return vippsRequest("/webhooks/v1/webhooks",{
  method:"POST",
  body:{url:callbackUrl,events:list},
  allowDisabled
 });
}

export async function listVippsWebhooks({allowDisabled=false}={}){
 const data=await vippsRequest("/webhooks/v1/webhooks",{allowDisabled});
 return Array.isArray(data?.webhooks)?data.webhooks:[];
}

export async function deleteVippsWebhook(id,{allowDisabled=false}={}){
 const webhookId=String(id||"").trim();
 if(!webhookId)throw new Error("VIPPS_WEBHOOK_ID_REQUIRED");
 return vippsRequest("/webhooks/v1/webhooks/"+encodeURIComponent(webhookId),{method:"DELETE",allowDisabled});
}

export function verifyVippsWebhook({rawBody,method,pathAndQuery,host,dateHeader,contentHashHeader,authorization,secret}){
 if(!secret)return false;
 const raw=String(rawBody??"");
 const contentHash=crypto.createHash("sha256").update(raw,"utf8").digest("base64");
 if(!contentHashHeader||!timingSafeText(contentHash,contentHashHeader))return false;
 const date=Date.parse(String(dateHeader||""));
 if(!Number.isFinite(date)||Math.abs(Date.now()-date)>10*60*1000)return false;
 const signed=String(method||"POST").toUpperCase()+"\n"+String(pathAndQuery||"")+"\n"+String(dateHeader||"")+";"+String(host||"")+";"+contentHash;
 const signature=crypto.createHmac("sha256",secret).update(signed,"utf8").digest("base64");
 const expected="HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature="+signature;
 return Boolean(authorization)&&timingSafeText(expected,authorization);
}

function timingSafeText(a,b){
 const aa=Buffer.from(String(a));
 const bb=Buffer.from(String(b));
 return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
