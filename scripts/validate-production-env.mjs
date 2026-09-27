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

const vippsEnabled=String(process.env.VIPPS_ENABLED||"").toLowerCase()==="true";
if(vippsEnabled){
 const vippsRequired=[
  "VIPPS_CLIENT_ID",
  "VIPPS_CLIENT_SECRET",
  "VIPPS_SUBSCRIPTION_KEY",
  "VIPPS_MSN",
  "VIPPS_WEBHOOK_SECRET"
 ];
 const vippsMissing=vippsRequired.filter(name=>!String(process.env[name]||"").trim());
 if(vippsMissing.length){
  console.error("VIPPS_ENABLED=true but required Vipps environment variables are missing:",vippsMissing.join(", "));
  process.exit(1);
 }
 if(String(process.env.VIPPS_ENVIRONMENT||"").toLowerCase()!=="production"){
  console.error("VIPPS_ENVIRONMENT must be 'production' when Vipps is enabled in production.");
  process.exit(1);
 }
 if(!/^[0-9]{4,10}$/.test(String(process.env.VIPPS_MSN||"").trim())){
  console.error("VIPPS_MSN must be a 4-10 digit merchant serial number.");
  process.exit(1);
 }
}

console.log("Production environment validation passed.");
