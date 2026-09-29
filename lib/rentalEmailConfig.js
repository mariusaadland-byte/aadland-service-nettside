import "server-only";

export function rentalEmailFrom(){
  const configured=String(process.env.RENTAL_EMAIL_FROM||"").trim();
  if(configured)return configured;

  // Keep preview usable until the separate rental domain is verified in Resend.
  if(process.env.VERCEL_ENV==="preview"){
    return String(process.env.ORDER_EMAIL_FROM||"").trim()||"Aadland Service <noreply@aadland-service.no>";
  }

  return "Aadland Utleie <noreplay@aadlandutleie.no>";
}

export function rentalReplyTo(){
  return String(process.env.RENTAL_REPLY_TO||process.env.ORDER_REPLY_TO||"post@aadland-service.no").trim();
}

export function rentalSiteUrl(req){
  const requestOrigin=(()=>{
    try{return req?new URL(req.url).origin:"";}catch{return "";}
  })();

  if(process.env.VERCEL_ENV==="preview"&&requestOrigin)return requestOrigin;
  if(process.env.NODE_ENV!=="production"&&requestOrigin)return requestOrigin;

  const configured=String(process.env.RENTAL_SITE_URL||"").trim().replace(/\/$/,"");
  return configured||"https://www.aadlandutleie.no";
}
