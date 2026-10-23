// The email must contain a short URL rather than Vipps' signed multi-part
// deeplink token. Do not alter the Vipps URL or automatically HTTP-redirect
// to it: Vipps requires user-initiated opening on the customer's device.
export function invoiceVippsShortUrl(reference){
 const ref=String(reference||"");
 if(!/^INV-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ref))
  throw Error("Ugyldig Vipps-referanse.");
 return "https://www.aadland-service.no/betaling/faktura/start?reference="+encodeURIComponent(ref);
}

// The expiry inside the signed deeplink is for user-facing expiry guidance,
// not payment authorization. All amounts/statuses still come from the server.
// Never rewrite or re-encode the actual link Vipps returns.
export function vippsCustomerOpenLink(source,nowMs=Date.now()){
 const raw=String(source||"");
 let url;
 try{url=new URL(raw);}catch{return {available:false,reason:"invalid"};}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||!(/(^|\.)(vipps\.no|vippsmobilepay\.com)$/.test(host))||url.username||url.password)
  return {available:false,reason:"invalid"};
 const jwt=url.searchParams.get("token");
 if(jwt){
  try{
   const parts=jwt.split(".");
   if(parts.length!==3)throw Error("Malformed JWT");
   const payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
   const expiration=Number(payload?.exp);
   if(!Number.isSafeInteger(expiration)||expiration<=0)throw Error("Invalid expiration");
   if(nowMs>=expiration*1000-15000)return {available:false,reason:"expired"};
  }catch{return {available:false,reason:"invalid"};}
 }
 return {available:true,href:raw};
}
