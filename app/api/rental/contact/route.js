import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {rentalEmailFrom,rentalAdminEmailTo,rentalResendApiKey} from "../../../../lib/rentalEmailConfig";
import {validateRentalContact,rentalContactText} from "../../../../lib/rentalContact.mjs";
export const runtime="nodejs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 if(process.env.VERCEL_ENV!=="production"||process.env.RENTAL_CONTACT_ENABLED!=="true")return json({error:"Kontaktskjemaet er ikke aktivert. Bruk telefon eller e-post.",disabled:true},503);
 const limited=await rateLimitRequest(req,{scope:"rental-contact",max:5,windowSeconds:900,message:"For mange henvendelser. Prøv igjen senere."});if(limited)return limited;
 const body=await req.json().catch(()=>null);
 if(!body||body.website||typeof body.requestId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.requestId))return json({error:"Ugyldig henvendelse."},400);
 const v=validateRentalContact(body);if(!v)return json({error:"Kontroller navn, e-post og melding."},400);
 const key=rentalResendApiKey();if(!key)return json({error:"E-post er ikke konfigurert. Bruk telefon eller e-post."},503);
 const digest=crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
 try{
  const {Resend}=await import("../../../../lib/safeResend");
  const resend=new Resend(key);
  const result=await resend.emails.send({from:rentalEmailFrom(),to:rentalAdminEmailTo(),replyTo:v.email,subject:"Henvendelse – Aadland Utleie",text:rentalContactText(v)},{idempotencyKey:"rental-contact/"+body.requestId+"/"+digest});
  if(result?.error||!result?.data?.id)return json({error:"Utsending kunne ikke bekreftes. Kontakt oss direkte hvis det haster.",uncertain:true},502);
  return json({ok:true});
 }catch{return json({error:"Utsending kunne ikke bekreftes. Kontakt oss direkte hvis det haster.",uncertain:true},502);}
}
