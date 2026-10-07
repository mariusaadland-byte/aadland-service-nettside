import "server-only";
import crypto from "crypto";

function safeEqual(a,b){
 const left=Buffer.from(String(a||""),"utf8");
 const right=Buffer.from(String(b||""),"utf8");
 return left.length===right.length&&crypto.timingSafeEqual(left,right);
}

export function verifyVippsWebhookRequest(req,rawBody,secret){
 const date=String(req.headers.get("x-ms-date")||"");
 const contentHash=String(req.headers.get("x-ms-content-sha256")||"");
 const authorization=String(req.headers.get("authorization")||"");
 const vippsAuthorization=String(req.headers.get("x-vipps-authorization")||"");
 const host=String(req.headers.get("host")||"");
 if(!date||!contentHash||!authorization||!host||!secret){
  return {ok:false,error:"VIPPS_WEBHOOK_AUTH_HEADERS_MISSING"};
 }
 if(vippsAuthorization&&!safeEqual(vippsAuthorization,authorization)){
  return {ok:false,error:"VIPPS_WEBHOOK_AUTH_HEADERS_MISMATCH"};
 }

 const expectedHash=crypto.createHash("sha256").update(rawBody,"utf8").digest("base64");
 if(!safeEqual(expectedHash,contentHash)){
  return {ok:false,error:"VIPPS_WEBHOOK_CONTENT_HASH_INVALID"};
 }

 const match=authorization.match(/^HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=(.+)$/);
 if(!match?.[1])return {ok:false,error:"VIPPS_WEBHOOK_AUTH_FORMAT_INVALID"};

 let pathAndQuery;
 try{
  const url=new URL(req.url);
  pathAndQuery=url.pathname+url.search;
 }catch{
  return {ok:false,error:"VIPPS_WEBHOOK_URL_INVALID"};
 }

 const signedString="POST\n"+pathAndQuery+"\n"+date+";"+host+";"+contentHash;
 const signature=crypto.createHmac("sha256",secret).update(signedString,"utf8").digest("base64");
 if(!safeEqual(signature,match[1])){
  return {ok:false,error:"VIPPS_WEBHOOK_SIGNATURE_INVALID"};
 }
 return {ok:true};
}
