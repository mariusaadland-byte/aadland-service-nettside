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

console.log("Production environment validation passed.");
