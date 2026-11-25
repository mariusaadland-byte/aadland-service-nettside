import "server-only";
import {Resend as OfficialResend} from "resend";

// S-31: all application mail passes through this fail-closed gateway.
// It protects preview, local development and testing even when production
// Resend credentials accidentally exist in a non-production environment.
// Real customer mail is only allowed from the explicit Vercel production env.
export function assertLiveEmailEnvironment(){
 if(process.env.VERCEL_ENV!=="production"){
  const error=new Error("S31_EMAIL_BLOCKED_OUTSIDE_PRODUCTION");
  error.code="S31_EMAIL_BLOCKED_OUTSIDE_PRODUCTION";
  throw error;
 }
}
export class Resend {
 constructor(apiKey){
  assertLiveEmailEnvironment();
  if(typeof apiKey!=="string"||!apiKey.trim()){
   const error=new Error("S31_RESEND_API_KEY_MISSING");
   error.code="S31_RESEND_API_KEY_MISSING";
   throw error;
  }
  return new OfficialResend(apiKey);
 }
}
