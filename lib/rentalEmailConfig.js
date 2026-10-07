import "server-only";

const rentalHosts=new Set(["aadlandutleie.no","www.aadlandutleie.no"]);
const serviceHosts=new Set(["aadland-service.no","www.aadland-service.no"]);

export function rentalEmailFrom(){
  const configured=String(process.env.RENTAL_EMAIL_FROM||"").trim();
  return configured||"Aadland Utleie <noreplay@aadlandutleie.no>";
}


export function rentalResendApiKey(){
  if(process.env.VERCEL_ENV==="preview"){
    return String(
      process.env.RENTAL_RESEND_PREVIEW_API_KEY||
      process.env.RENTAL_RESEND_API_KEY||
      process.env.RESEND_PREVIEW_API_KEY||
      process.env.RESEND_API_KEY||
      ""
    ).trim();
  }
  return String(process.env.RENTAL_RESEND_API_KEY||process.env.RESEND_API_KEY||"").trim();
}

export function rentalReplyTo(){
  return String(process.env.RENTAL_REPLY_TO||process.env.ORDER_REPLY_TO||"post@aadland-service.no").trim();
}

export function rentalRequestSiteUrl(req){
  const requestOrigin=(()=>{
    try{return req?new URL(req.url).origin:"";}catch{return "";}
  })();
  if(!requestOrigin)return "";

  let host="";
  try{host=new URL(requestOrigin).hostname.toLowerCase()}catch{return "";}
  if(rentalHosts.has(host)||serviceHosts.has(host))return requestOrigin;

  if(process.env.VERCEL_ENV==="preview"&&host.endsWith(".vercel.app"))return requestOrigin;
  if(process.env.NODE_ENV!=="production"&&(host==="localhost"||host==="127.0.0.1"))return requestOrigin;
  return "";
}

export function rentalSiteUrl(req){
  const requestSite=rentalRequestSiteUrl(req);
  if(process.env.VERCEL_ENV==="preview"&&requestSite)return requestSite;
  if(process.env.NODE_ENV!=="production"&&requestSite)return requestSite;

  const configured=String(process.env.RENTAL_SITE_URL||"").trim().replace(/\/$/,"");
  return configured||"https://www.aadlandutleie.no";
}

export function rentalBookingSiteUrl(booking,req){
  const stored=String(booking?.customer?.siteOrigin||"").trim().replace(/\/$/,"");
  if(stored){
    try{
      const parsed=new URL(stored);
      const host=parsed.hostname.toLowerCase();
      if(parsed.protocol==="https:"&&(rentalHosts.has(host)||serviceHosts.has(host)))return parsed.origin;
      if(process.env.VERCEL_ENV==="preview"&&parsed.protocol==="https:"&&host.endsWith(".vercel.app"))return parsed.origin;
    }catch{}
  }
  return rentalSiteUrl(req);
}


export function isRentalRequest(req){
  let host=String(req?.headers?.get?.("x-forwarded-host")||req?.headers?.get?.("host")||"")
    .split(",")[0].trim().split(":")[0].toLowerCase();
  if(!host){
    try{host=new URL(req.url).hostname.toLowerCase()}catch{}
  }
  return rentalHosts.has(host);
}

export function customerEmailContext(req){
  const rental=isRentalRequest(req);
  const requestOrigin=(()=>{
    try{return new URL(req.url).origin}catch{return ""}
  })();
  const requestSite=rentalRequestSiteUrl(req);
  const configuredService=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
  const siteUrl=rental
    ?(requestSite||rentalSiteUrl(req))
    :(process.env.VERCEL_ENV==="preview"&&requestSite?requestSite:(configuredService||requestOrigin));

  return {
    rental,
    brandName:rental?"Aadland Utleie":"Aadland Service",
    brandUpper:rental?"AADLAND UTLEIE":"AADLAND SERVICE",
    from:rental?rentalEmailFrom():"Aadland Service <noreply@aadland-service.no>",
    replyTo:rental?rentalReplyTo():"post@aadland-service.no",
    siteUrl
  };
}


export function customerResendApiKey(req){
  if(isRentalRequest(req))return rentalResendApiKey();
  if(process.env.VERCEL_ENV==="preview"){
    return String(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY||"").trim();
  }
  return String(process.env.RESEND_API_KEY||"").trim();
}
