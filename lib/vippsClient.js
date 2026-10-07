import "server-only";
import crypto from "crypto";
import {vippsUnitConfig} from "./vippsConfig";

const SYSTEM_HEADERS={
 "Vipps-System-Name":"aadland-service",
 "Vipps-System-Version":"1.0.0",
 "Vipps-System-Plugin-Name":"aadland-web",
 "Vipps-System-Plugin-Version":"1.0.0"
};

const tokenCache=new Map();

function enabled(){
 return String(process.env.VIPPS_PAYMENTS_ENABLED||"").trim().toLowerCase()==="true";
}

async function parseResponse(response){
 const text=await response.text();
 let body=null;
 try{body=text?JSON.parse(text):null}catch{body=text}
 if(!response.ok){
  const error=new Error("Vipps-kall feilet med HTTP "+response.status+".");
  error.status=response.status;
  error.body=body;
  throw error;
 }
 return body;
}

function requireEnabled(){
 if(!enabled()){
  const error=new Error("VIPPS_PAYMENTS_DISABLED");
  error.code="VIPPS_PAYMENTS_DISABLED";
  throw error;
 }
}

function requireConfig(unit){
 const config=vippsUnitConfig(unit);
 if(!config.configured){
  const error=new Error("VIPPS_CONFIG_INCOMPLETE");
  error.code="VIPPS_CONFIG_INCOMPLETE";
  error.missing=config.missing;
  throw error;
 }
 return config;
}

async function accessToken(unit,{allowDisabled=false}={}){
 if(!allowDisabled)requireEnabled();
 const config=requireConfig(unit);
 const cached=tokenCache.get(config.unit);
 const now=Date.now();
 if(cached&&cached.token&&cached.expiresAt>now+60_000)return {token:cached.token,config};

 const response=await fetch(config.baseUrl+"/accesstoken/get",{
  method:"POST",
  headers:{
   "Content-Type":"application/json",
   "client_id":config.values.clientId,
   "client_secret":config.values.clientSecret,
   "Ocp-Apim-Subscription-Key":config.values.subscriptionKey,
   "Merchant-Serial-Number":config.values.msn,
   ...SYSTEM_HEADERS
  },
  body:""
 });

 let body;
 try{body=await parseResponse(response)}catch(error){
  console.error("VIPPS ACCESS TOKEN ERROR",{unit:config.unit,status:error.status,body:error.body});
  throw error;
 }
 if(!body?.access_token)throw new Error("VIPPS_ACCESS_TOKEN_MISSING");
 const expiresSeconds=Math.max(60,Number(body.expires_in)||3600);
 tokenCache.set(config.unit,{token:body.access_token,expiresAt:now+expiresSeconds*1000});
 return {token:body.access_token,config};
}

async function vippsFetch(unit,path,{method="GET",body=null,idempotencyKey=null,allowDisabled=false}={}){
 const {token,config}=await accessToken(unit,{allowDisabled});
 const headers={
  "Authorization":"Bearer "+token,
  "Ocp-Apim-Subscription-Key":config.values.subscriptionKey,
  "Merchant-Serial-Number":config.values.msn,
  ...SYSTEM_HEADERS
 };
 if(body!==null)headers["Content-Type"]="application/json";
 if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;

 const response=await fetch(config.baseUrl+path,{
  method,
  headers,
  body:body===null?undefined:JSON.stringify(body),
  cache:"no-store"
 });
 try{return await parseResponse(response)}catch(error){
  console.error("VIPPS API ERROR",{
   unit:config.unit,
   method,
   path,
   status:error.status,
   body:error.body
  });
  throw error;
 }
}

function normalizedPhone(phone){
 const digits=String(phone||"").replace(/\D/g,"");
 if(!digits)return "";
 if(digits.startsWith("47")&&digits.length===10)return digits;
 if(digits.length===8)return "47"+digits;
 return digits;
}

export function vippsPaymentsEnabled(){
 return enabled();
}

export function vippsIdempotencyKey(prefix="vipps"){
 return (String(prefix||"vipps").replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,36)+"-"+crypto.randomUUID()).slice(0,64);
}

export async function createVippsPayment({
 unit,
 reference,
 amountOre,
 phone,
 returnUrl,
 description,
 idempotencyKey
}){
 if(!reference)throw new Error("VIPPS_REFERENCE_REQUIRED");
 if(!Number.isInteger(amountOre)||amountOre<=0)throw new Error("VIPPS_AMOUNT_INVALID");
 if(!returnUrl)throw new Error("VIPPS_RETURN_URL_REQUIRED");
 const body={
  amount:{currency:"NOK",value:amountOre},
  paymentMethod:{type:"WALLET"},
  reference:String(reference).slice(0,64),
  returnUrl:String(returnUrl),
  userFlow:"WEB_REDIRECT",
  paymentDescription:String(description||"Betaling til Aadland Service").slice(0,100)
 };
 const phoneNumber=normalizedPhone(phone);
 if(phoneNumber)body.customer={phoneNumber};
 return vippsFetch(unit,"/epayment/v1/payments",{
  method:"POST",
  body,
  idempotencyKey:idempotencyKey||vippsIdempotencyKey("create-"+reference)
 });
}

export async function getVippsPayment(unit,reference){
 return vippsFetch(unit,"/epayment/v1/payments/"+encodeURIComponent(reference));
}

export async function getVippsPaymentEvents(unit,reference){
 return vippsFetch(unit,"/epayment/v1/payments/"+encodeURIComponent(reference)+"/events");
}

export async function captureVippsPayment(unit,reference,amountOre,{idempotencyKey}={}){
 if(!Number.isInteger(amountOre)||amountOre<=0)throw new Error("VIPPS_AMOUNT_INVALID");
 return vippsFetch(unit,"/epayment/v1/payments/"+encodeURIComponent(reference)+"/capture",{
  method:"POST",
  body:{modificationAmount:{currency:"NOK",value:amountOre}},
  idempotencyKey:idempotencyKey||vippsIdempotencyKey("capture-"+reference)
 });
}

export async function cancelVippsPayment(unit,reference,{idempotencyKey}={}){
 return vippsFetch(unit,"/epayment/v1/payments/"+encodeURIComponent(reference)+"/cancel",{
  method:"POST",
  body:{},
  idempotencyKey:idempotencyKey||vippsIdempotencyKey("cancel-"+reference)
 });
}

export async function refundVippsPayment(unit,reference,amountOre,{idempotencyKey}={}){
 if(!Number.isInteger(amountOre)||amountOre<=0)throw new Error("VIPPS_AMOUNT_INVALID");
 return vippsFetch(unit,"/epayment/v1/payments/"+encodeURIComponent(reference)+"/refund",{
  method:"POST",
  body:{modificationAmount:{currency:"NOK",value:amountOre}},
  idempotencyKey:idempotencyKey||vippsIdempotencyKey("refund-"+reference)
 });
}

export const VIPPS_PAYMENT_WEBHOOK_EVENTS=[
 "epayments.payment.authorized.v1",
 "epayments.payment.captured.v1",
 "epayments.payment.cancelled.v1",
 "epayments.payment.refunded.v1",
 "epayments.payment.aborted.v1",
 "epayments.payment.expired.v1",
 "epayments.payment.terminated.v1"
];

export async function registerVippsWebhook(unit,url,events=VIPPS_PAYMENT_WEBHOOK_EVENTS,{allowDisabled=false}={}){
 if(!url)throw new Error("VIPPS_WEBHOOK_URL_REQUIRED");
 if(!Array.isArray(events)||!events.length)throw new Error("VIPPS_WEBHOOK_EVENTS_REQUIRED");
 return vippsFetch(unit,"/webhooks/v1/webhooks",{
  method:"POST",
  body:{url:String(url),events},
  allowDisabled
 });
}

export async function listVippsWebhooks(unit,{allowDisabled=false}={}){
 return vippsFetch(unit,"/webhooks/v1/webhooks",{allowDisabled});
}

export async function deleteVippsWebhook(unit,webhookId,{allowDisabled=false}={}){
 if(!webhookId)throw new Error("VIPPS_WEBHOOK_ID_REQUIRED");
 return vippsFetch(unit,"/webhooks/v1/webhooks/"+encodeURIComponent(webhookId),{method:"DELETE",allowDisabled});
}

export async function testVippsApiConnection(unit){
 const response=await listVippsWebhooks(unit,{allowDisabled:true});
 const webhooks=Array.isArray(response?.webhooks)?response.webhooks:[];
 return {ok:true,webhooks};
}
