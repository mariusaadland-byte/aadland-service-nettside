import "server-only";
import {Resend} from "./safeResend";
import {rentalEmailFrom,rentalResendApiKey,rentalReplyTo} from "./rentalEmailConfig";
// No public endpoint. Call only after atomic challenge reservation.
export async function sendRentalSigningCode(message){
 if(process.env.VERCEL_ENV!=="production"||process.env.AADLAND_SIGNING_ENABLED!=="true")return false;
 const key=rentalResendApiKey();
 if(!key||!message||typeof message.to!=="string"||typeof message.text!=="string"||message.subject!=="Din engangskode – Aadland Signering")return false;
 try{
  const client=new Resend(key);
  const {data,error}=await client.emails.send({from:rentalEmailFrom(),to:[message.to],replyTo:rentalReplyTo(),subject:message.subject,text:message.text});
  return !error&&typeof data?.id==="string"&&data.id.length>0;
 }catch{return false;}
}
