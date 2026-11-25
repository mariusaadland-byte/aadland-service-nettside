import "server-only";
import {createCustomerVerificationToken} from "./customerVerification";
import {customerEmailContext,customerResendApiKey} from "./rentalEmailConfig";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>
 ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));

export const customerVerificationGenericMessage=
 "Hvis e-postadressen tilhører en kundekonto som ikke er bekreftet, sender vi en ny bekreftelsesmail når det er trygt.";

export async function sendCustomerVerificationEmail({req,s,userId,email,name,reason="registration"}){
 if(process.env.VERCEL_ENV!=="production")
  return {status:"disabled",message:"Bekreftelsesmail sendes bare fra produksjonsmiljøet."};
 const key=customerResendApiKey(req);
 if(!key)return {status:"unavailable",message:"E-posttjenesten er ikke tilgjengelig nå."};
 const address=String(email||"").trim().toLowerCase();
 const {data:claim,error:claimError}=await s.rpc("claim_customer_verification_delivery",{
  p_user_id:userId,p_email:address
 });
 if(claimError){
  console.error("S29 CUSTOMER VERIFICATION CLAIM",claimError.code||"unknown");
  return {status:"unavailable",message:"Sendekontrollen er ikke tilgjengelig. Kundekontoen beholdes."};
 }
 if(claim?.state!=="claimed"||!claim.id)
  return {status:claim?.state==="recent"?"recent":
   claim?.state==="unresolved"?"unresolved":"not_eligible"};
 const attemptId=claim.id;
 try{
  const mailContext=customerEmailContext(req);
 const token=createCustomerVerificationToken({id:userId,email:address});
 const verifyUrl=new URL("/min-side/bekreft-epost",mailContext.siteUrl);
 verifyUrl.hash="token="+encodeURIComponent(token);
 const renewal=reason==="resend";
 const bodyName=String(name||"").trim().slice(0,120);
 const title=renewal?"Ny bekreftelseslenke":"Bekreft e-post";
 const html=[
  '<!doctype html><html><body style="background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">',
  '<table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="640">',
  '<tr><td style="padding:28px;background:#11100e;color:#fff">',mailContext.logoHtml||'', '<b>',escapeHtml(mailContext.brandUpper),'</b></td></tr>',
  '<tr><td style="padding:28px"><h1>',title,'</h1><p>',
  renewal?'Bruk denne lenken for å bekrefte kontoen din.':'Velkommen'+(bodyName?', '+escapeHtml(bodyName):'')+'. Bekreft e-postadressen din for å aktivere kontoen.',
  '</p><a href="',escapeHtml(verifyUrl.toString()),
  '" style="background:#cfa153;padding:14px 22px;display:inline-block;color:#111">Gå til bekreftelse</a>',
  '<p style="font-size:12px">På siden må du trykke «Bekreft e-post». Lenken er gyldig i 24 timer. Hvis du ikke ba om dette, kan du se bort fra e-posten.</p>',
  '<p style="font-size:11px;color:#777">',escapeHtml(mailContext.contactEmail||"post@aadland-service.no"),'</p>',
  '</td></tr></table></td></tr></table></body></html>'
 ].join("");
  const {Resend}=await import("./safeResend");
  const sent=await new Resend(key).emails.send({
   from:mailContext.from,to:address,replyTo:mailContext.replyTo,
   subject:(renewal?"Ny bekreftelseslenke":"Bekreft e-postadressen din")+" – "+mailContext.brandName,
   html
  },{idempotencyKey:"customer-verification/"+attemptId});
  if(sent?.error||!sent?.data?.id)throw Error("provider_delivery_uncertain");
  const {data:ack,error:ackError}=await s.rpc("accept_customer_verification_delivery",{
   p_attempt_id:attemptId,p_provider_id:String(sent.data.id)
  });
  if(ackError||!ack?.accepted)throw Error("provider_accepted_but_journal_unknown");
  return {status:"accepted"};
 }catch(error){
  // Do not delete the auth user or retry unknown delivery automatically.
  console.error("S29 CUSTOMER VERIFICATION DELIVERY",error?.message||"unknown");
  try{
   const {data:hold,error:holdError}=await s.rpc("hold_customer_verification_delivery",{
    p_attempt_id:attemptId,p_reason:"provider_status_uncertain"
   });
   if(holdError||!hold?.held)console.error("S29 CUSTOMER VERIFICATION HOLD UNCONFIRMED",holdError?.code||"unknown");
  }catch{console.error("S29 CUSTOMER VERIFICATION HOLD UNAVAILABLE");}
  return {status:"uncertain",message:"Kontoen er beholdt. E-poststatus må kontrolleres; sjekk innboksen og søppelpost."};
 }
}
