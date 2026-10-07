import "server-only";
import {rentalBookingSiteUrl,rentalEmailFrom,rentalReplyTo,rentalResendApiKey} from "./rentalEmailConfig";

function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function money(ore){return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100)}

export async function sendManualRentalRefundNotice({
 s,
 booking,
 req,
 refundOreOverride=null,
 refundedTotalOreOverride=null,
 refundReferenceOverride=undefined,
 refundNoteOverride=undefined,
 idempotencyKey="",
 stampNotice=true
}){
 if(!s||!booking)throw new Error("RENTAL_REFUND_NOTICE_CONTEXT_MISSING");
 const email=String(booking.customer?.email||"").trim().toLowerCase();
 if(!email)throw new Error("RENTAL_REFUND_NOTICE_EMAIL_MISSING");

 const refundOre=refundOreOverride==null?Math.max(0,Number(booking.refund_last_ore)||0):Math.max(0,Number(refundOreOverride)||0);
 const refundedTotalOre=refundedTotalOreOverride==null?Math.max(0,Number(booking.payment_refunded_ore)||0):Math.max(0,Number(refundedTotalOreOverride)||0);
 const capturedOre=Math.max(0,Number(booking.payment_captured_ore)||0);
 const refundReference=refundReferenceOverride===undefined?booking.refund_reference:String(refundReferenceOverride||"");
 const refundNote=refundNoteOverride===undefined?booking.refund_note:String(refundNoteOverride||"");
 if(refundOre<=0||refundedTotalOre<=0)throw new Error("RENTAL_REFUND_NOTICE_REFUND_MISSING");

 const resendKey=rentalResendApiKey();
 if(!resendKey)throw new Error("RENTAL_REFUND_NOTICE_EMAIL_NOT_CONFIGURED");

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const from=rentalEmailFrom();
 const replyTo=rentalReplyTo();
 const base=rentalBookingSiteUrl(booking,req);
 const accountUrl=booking.customer_user_id?base+"/min-side":"";
 const remainingOre=Math.max(0,capturedOre-refundedTotalOre);
 const fullRefund=capturedOre>0&&remainingOre===0;

 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND UTLEIE</div><div style="margin-top:5px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">TILBAKEBETALING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(booking.booking_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${fullRefund?"Leiebetalingen er tilbakebetalt":"Delvis tilbakebetaling er registrert"}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(booking.customer?.name||"kunde")}. Aadland Utleie har registrert en tilbakebetaling på utleiebookingen din.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px">Tilbakebetalt nå</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right">${esc(money(refundOre))}</td></tr>
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Totalt tilbakebetalt</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(money(refundedTotalOre))}</td></tr>
${remainingOre>0?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Gjenstående registrert betaling</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(money(remainingOre))}</td></tr>`:""}
${refundReference?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Referanse</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(refundReference)}</td></tr>`:""}
</table>
${refundNote?`<div style="margin-top:18px;padding:16px;background:#101010;border:1px solid #2d2d2d"><div style="color:#8e887f;font-size:11px">MERKNAD</div><div style="margin-top:6px;color:#fff;line-height:1.6">${esc(refundNote)}</div></div>`:""}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Dette bekrefter hva Aadland Utleie har registrert som tilbakebetalt. Har du spørsmål, kan du svare på denne e-posten eller kontakte oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Utleie · Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 const emailPayload={
  from,to:email,replyTo,
  subject:(fullRefund?"Tilbakebetaling registrert – ":"Delvis tilbakebetaling registrert – ")+booking.booking_number,
  html
 };
 const sent=idempotencyKey
  ?await resend.emails.send(emailPayload,{idempotencyKey})
  :await resend.emails.send(emailPayload);
 if(sent?.error)throw new Error(sent.error.message||"E-postfeil");

 const sentAt=new Date().toISOString();
 if(stampNotice){
  const {error:stampError}=await s.from("rental_bookings").update({refund_notice_sent_at:sentAt,updated_at:sentAt}).eq("id",booking.id);
  if(stampError)throw stampError;
 }
 return {sentTo:email,sentAt,refundOre,refundedTotalOre,remainingOre};
}
