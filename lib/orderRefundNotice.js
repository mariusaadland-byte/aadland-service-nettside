import "server-only";

function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function money(ore){return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100)}

export async function sendManualOrderRefundNotice({s,order,requestOrigin=""}){
 if(!s||!order)throw new Error("ORDER_REFUND_NOTICE_CONTEXT_MISSING");
 const email=String(order.customer?.email||"").trim().toLowerCase();
 if(!email)throw new Error("ORDER_REFUND_NOTICE_EMAIL_MISSING");

 const refundOre=Math.max(0,Number(order.refund_last_ore)||0);
 const refundedTotalOre=Math.max(0,Number(order.payment_refunded_ore)||0);
 const capturedOre=Math.max(0,Number(order.payment_captured_ore)||0);
 if(refundOre<=0||refundedTotalOre<=0)throw new Error("ORDER_REFUND_NOTICE_REFUND_MISSING");

 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)throw new Error("ORDER_REFUND_NOTICE_EMAIL_NOT_CONFIGURED");

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
 const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const origin=String(requestOrigin||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?(origin||configuredOrigin):(configuredOrigin||origin);
 const accountUrl=order.customer_user_id&&base?base+"/min-side":"";
 const remainingOre=Math.max(0,capturedOre-refundedTotalOre);
 const fullRefund=capturedOre>0&&remainingOre===0;

 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:22px 30px;background:#0d0d0d"><img src="https://www.aadland-service.no/aadland-service-logo.webp" alt="Aadland Service" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0"/><div style="margin-top:8px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">TILBAKEBETALING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${fullRefund?"Betalingen er registrert tilbakebetalt":"Delvis tilbakebetaling er registrert"}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(order.customer?.name||"kunde")}. Aadland Service har registrert en tilbakebetaling på bestillingen din.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px">Tilbakebetalt nå</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right">${esc(money(refundOre))}</td></tr>
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Totalt tilbakebetalt</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(money(refundedTotalOre))}</td></tr>
${remainingOre>0?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Gjenstående registrert betaling</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(money(remainingOre))}</td></tr>`:""}
${order.refund_reference?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Referanse</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(order.refund_reference)}</td></tr>`:""}
</table>
${order.refund_note?`<div style="margin-top:18px;padding:16px;background:#101010;border:1px solid #2d2d2d"><div style="color:#8e887f;font-size:11px">MERKNAD</div><div style="margin-top:6px;color:#fff;line-height:1.6">${esc(order.refund_note)}</div></div>`:""}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Dette bekrefter hva Aadland Service har registrert som tilbakebetalt. Har du spørsmål, kan du svare på denne e-posten eller kontakte oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 const sent=await resend.emails.send({
  from,
  to:email,
  replyTo,
  subject:(fullRefund?"Tilbakebetaling registrert – ":"Delvis tilbakebetaling registrert – ")+order.order_number,
  html
 });
 if(sent?.error)throw new Error(sent.error.message||"E-postfeil");

 const sentAt=new Date().toISOString();
 const {error:stampError}=await s.from("orders").update({refund_notice_sent_at:sentAt,updated_at:sentAt}).eq("id",order.id);
 if(stampError)throw stampError;
 return {sentTo:email,sentAt,refundOre,refundedTotalOre,remainingOre};
}
