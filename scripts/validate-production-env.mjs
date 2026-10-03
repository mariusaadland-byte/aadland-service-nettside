const production=process.env.VERCEL_ENV==="production";

if(!production){
 console.log("Production env validation skipped outside Vercel production.");
 process.exit(0);
}

const required=[
 "NEXT_PUBLIC_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY",
 "SESSION_SECRET",
 "RESEND_API_KEY",
 "CRON_SECRET",
 "NEXT_PUBLIC_SITE_URL"
];

const missing=required.filter(name=>!String(process.env[name]||"").trim());

if(missing.length){
 console.error("Missing required production environment variables:",missing.join(", "));
 process.exit(1);
}

let siteUrl;
try{
 siteUrl=new URL(process.env.NEXT_PUBLIC_SITE_URL);
}catch{
 console.error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
 process.exit(1);
}

if(siteUrl.protocol!=="https:"){
 console.error("NEXT_PUBLIC_SITE_URL must use https in production.");
 process.exit(1);
}

const vippsEnabled=String(process.env.VIPPS_PAYMENTS_ENABLED||"").trim().toLowerCase()==="true";
if(vippsEnabled){
 const vippsRequired=[
  "VIPPS_WEBHOOK_URL",
  "VIPPS_SERVICE_CLIENT_ID",
  "VIPPS_SERVICE_CLIENT_SECRET",
  "VIPPS_SERVICE_SUBSCRIPTION_KEY",
  "VIPPS_SERVICE_MSN",
  "VIPPS_RENTAL_CLIENT_ID",
  "VIPPS_RENTAL_CLIENT_SECRET",
  "VIPPS_RENTAL_SUBSCRIPTION_KEY",
  "VIPPS_RENTAL_MSN"
 ];
 const vippsMissing=vippsRequired.filter(name=>!String(process.env[name]||"").trim());
 if(vippsMissing.length){
  console.error("Vipps is enabled, but required production variables are missing:",vippsMissing.join(", "));
  process.exit(1);
 }

 if(String(process.env.VIPPS_ENV||"").trim().toLowerCase()!=="production"){
  console.error("VIPPS_ENV must be production when Vipps payments are enabled in Vercel production.");
  process.exit(1);
 }

 let webhookUrl;
 try{
  webhookUrl=new URL(process.env.VIPPS_WEBHOOK_URL);
 }catch{
  console.error("VIPPS_WEBHOOK_URL must be a valid absolute URL when Vipps is enabled.");
  process.exit(1);
 }
 const allowedVippsHosts=new Set([
  "aadland-service.no",
  "www.aadland-service.no",
  "aadlandutleie.no",
  "www.aadlandutleie.no"
 ]);
 if(
  webhookUrl.protocol!=="https:"||
  webhookUrl.pathname!=="/api/vipps/webhook"||
  webhookUrl.search||
  webhookUrl.hash||
  webhookUrl.username||
  webhookUrl.password||
  !allowedVippsHosts.has(webhookUrl.hostname.toLowerCase())
 ){
  console.error("VIPPS_WEBHOOK_URL must be a clean https URL on an Aadland production domain and point exactly to /api/vipps/webhook.");
  process.exit(1);
 }
}

console.log("Production environment validation passed.");
