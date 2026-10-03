import "server-only";
import {safeHttpsUrl} from "./safeUrl";
import {serviceEmailFrom,serviceReplyTo} from "./serviceEmailConfig";

function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}

export async function sendOrderStatusNotice({s,order,kind,requestOrigin=""}){
 if(!s||!order)throw new Error("ORDER_STATUS_NOTICE_CONTEXT_MISSING");
 const sent=kind==="dispatched";
 if(!sent&&kind!=="delivered")throw new Error("ORDER_STATUS_NOTICE_KIND_INVALID");
 const email=String(order.customer?.email||"").trim().toLowerCase();
 if(!email)throw new Error("ORDER_STATUS_NOTICE_EMAIL_MISSING");

 if(sent&&!String(order.tracking_number||"").trim()&&!safeHttpsUrl(order.tracking_url)){
  throw new Error("ORDER_STATUS_NOTICE_TRACKING_MISSING");
 }

 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)throw new Error("ORDER_STATUS_NOTICE_EMAIL_NOT_CONFIGURED");

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const from=serviceEmailFrom();
 const replyTo=serviceReplyTo();
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const origin=String(requestOrigin||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?(origin||configuredOrigin):(configuredOrigin||origin);
 const accountUrl=order.customer_user_id&&base?base+"/min-side":"";
 const trackingUrl=sent?safeHttpsUrl(order.tracking_url):"";
 const title=sent?"Bestillingen din er sendt":"Bestillingen din er levert";
 const intro=sent?"Bestillingen er nå sendt fra oss.":"Bestillingen er registrert som levert.";

 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:22px 30px;background:#0d0d0d"><img src="https://www.aadland-service.no/aadland-service-logo.webp" alt="Aadland Service" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0"/><div style="margin-top:8px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">BESTILLING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${esc(title)}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(order.customer?.name||"kunde")}! ${esc(intro)}</p>
${sent&&order.tracking_number?`<div style="padding:14px;background:#101010;border:1px solid #2d2d2d"><div style="color:#8e887f;font-size:11px">SPORINGSNUMMER</div><div style="margin-top:5px;color:#fff;font-weight:800">${esc(order.tracking_number)}</div></div>`:""}
${trackingUrl?`<a href="${esc(trackingUrl)}" style="display:inline-block;margin-top:18px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Spor pakken →</a>`:""}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:18px;${trackingUrl?"margin-left:8px;":""}border:1px solid #d7a74e;color:#d7a74e;text-decoration:none;font-weight:900;padding:12px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Har du spørsmål, kan du svare direkte på denne e-posten eller kontakte oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 const result=await resend.emails.send({
  from,
  to:email,
  replyTo,
  subject:sent?"Bestillingen din er sendt – "+order.order_number:"Bestillingen din er levert – "+order.order_number,
  html
 });
 if(result?.error)throw new Error(result.error.message||"E-postfeil");

 const sentAt=new Date().toISOString();
 const patch=sent?{tracking_sent_at:sentAt,updated_at:sentAt}:{delivery_notice_sent_at:sentAt,updated_at:sentAt};
 const {error:stampError}=await s.from("orders").update(patch).eq("id",order.id);
 if(stampError)throw stampError;
 return {sentTo:email,sentAt};
}
