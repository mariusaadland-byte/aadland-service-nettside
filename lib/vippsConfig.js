import "server-only";

const UNIT_KEYS={
 service:{
  label:"Aadland Service",
  hosts:new Set(["aadland-service.no","www.aadland-service.no"]),
  env:{
   clientId:"VIPPS_SERVICE_CLIENT_ID",
   clientSecret:"VIPPS_SERVICE_CLIENT_SECRET",
   subscriptionKey:"VIPPS_SERVICE_SUBSCRIPTION_KEY",
   msn:"VIPPS_SERVICE_MSN"
  }
 },
 rental:{
  label:"Aadland Utleie",
  hosts:new Set(["aadlandutleie.no","www.aadlandutleie.no"]),
  env:{
   clientId:"VIPPS_RENTAL_CLIENT_ID",
   clientSecret:"VIPPS_RENTAL_CLIENT_SECRET",
   subscriptionKey:"VIPPS_RENTAL_SUBSCRIPTION_KEY",
   msn:"VIPPS_RENTAL_MSN"
  }
 }
};

function hostFromRequest(req){
 let host=String(req?.headers?.get?.("x-forwarded-host")||req?.headers?.get?.("host")||"")
  .split(",")[0].trim().split(":")[0].toLowerCase();
 if(!host){
  try{host=new URL(req.url).hostname.toLowerCase()}catch{}
 }
 return host;
}

export function vippsUnitForRequest(req,{fallback="service"}={}){
 const host=hostFromRequest(req);
 if(UNIT_KEYS.rental.hosts.has(host))return "rental";
 if(UNIT_KEYS.service.hosts.has(host))return "service";
 return fallback;
}

export function vippsUnitConfig(unit){
 const key=unit==="rental"?"rental":"service";
 const def=UNIT_KEYS[key];
 const values={
  clientId:String(process.env[def.env.clientId]||"").trim(),
  clientSecret:String(process.env[def.env.clientSecret]||"").trim(),
  subscriptionKey:String(process.env[def.env.subscriptionKey]||"").trim(),
  msn:String(process.env[def.env.msn]||"").trim()
 };
 const paymentValues={
  clientId:values.clientId,
  clientSecret:values.clientSecret,
  subscriptionKey:values.subscriptionKey,
  msn:values.msn
 };
 const missing=Object.entries(paymentValues).filter(([,value])=>!value).map(([name])=>name);
 const environment=String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
 const baseUrl=environment==="test"?"https://apitest.vipps.no":"https://api.vipps.no";
 return {unit:key,label:def.label,environment,baseUrl,configured:missing.length===0,missing,values};
}

export function vippsPublicStatus(){
 return ["service","rental"].map(unit=>{
  const config=vippsUnitConfig(unit);
  return {
   unit:config.unit,
   label:config.label,
   environment:config.environment,
   configured:config.configured,
   missing:config.missing,
   msnConfigured:Boolean(config.values.msn),
   clientIdConfigured:Boolean(config.values.clientId),
   clientSecretConfigured:Boolean(config.values.clientSecret),
   subscriptionKeyConfigured:Boolean(config.values.subscriptionKey)
  };
 });
}
