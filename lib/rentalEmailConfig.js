import "server-only";

const rentalHosts=new Set(["aadlandutleie.no","www.aadlandutleie.no"]);

export function rentalEmailFrom(){
  const configured=String(process.env.RENTAL_EMAIL_FROM||"").trim();
  return configured||"Aadland Utleie <noreplay@aadlandutleie.no>";
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
  const configuredService=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
  const siteUrl=rental
    ?(requestOrigin||rentalSiteUrl(req))
    :(process.env.VERCEL_ENV==="preview"&&requestOrigin?requestOrigin:(configuredService||requestOrigin));

  return {
    rental,
    brandName:rental?"Aadland Utleie":"Aadland Service",
    brandUpper:rental?"AADLAND UTLEIE":"AADLAND SERVICE",
    from:rental?rentalEmailFrom():"Aadland Service <noreply@aadland-service.no>",
    replyTo:rental?rentalReplyTo():"post@aadland-service.no",
    siteUrl
  };
}
