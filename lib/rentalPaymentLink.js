import "server-only";
import crypto from "crypto";

export const RENTAL_PAYMENT_LINK_MAX_AGE_SECONDS=60*60*24*30;

function secret(){
 const value=process.env.RENTAL_PAYMENT_LINK_SECRET||process.env.SESSION_SECRET;
 if(!value)throw new Error("RENTAL_PAYMENT_LINK_SECRET eller SESSION_SECRET mangler.");
 return value;
}

function signature(booking,expiresAt){
 const message=[
  "rental-payment-link-v1",
  String(booking?.id||""),
  String(booking?.booking_number||booking?.bookingNumber||""),
  String(booking?.customer?.email||"").trim().toLowerCase(),
  String(expiresAt)
 ].join("|");
 return crypto.createHmac("sha256",secret()).update(message).digest("hex");
}

export function createRentalPaymentLinkToken(booking,{now=Date.now(),maxAgeSeconds=RENTAL_PAYMENT_LINK_MAX_AGE_SECONDS}={}){
 const seconds=Math.max(300,Math.min(Number(maxAgeSeconds)||RENTAL_PAYMENT_LINK_MAX_AGE_SECONDS,60*60*24*90));
 const expiresAt=Math.floor(now/1000)+seconds;
 const sig=signature(booking,expiresAt);
 return {
  token:String(expiresAt)+"."+sig,
  expiresAt:new Date(expiresAt*1000).toISOString()
 };
}

export function verifyRentalPaymentLinkToken(booking,token,{now=Date.now()}={}){
 const parts=String(token||"").split(".");
 if(parts.length!==2)return {ok:false,reason:"invalid"};
 const expiresAt=Number(parts[0]);
 const supplied=String(parts[1]||"");
 if(!Number.isInteger(expiresAt)||expiresAt<=Math.floor(now/1000))return {ok:false,reason:"expired"};
 const expected=signature(booking,expiresAt);
 if(supplied.length!==expected.length)return {ok:false,reason:"invalid"};
 const a=Buffer.from(supplied),b=Buffer.from(expected);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return {ok:false,reason:"invalid"};
 return {ok:true,expiresAt:new Date(expiresAt*1000).toISOString()};
}
