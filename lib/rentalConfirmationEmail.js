import "server-only";
import {rentalBookingSiteUrl,rentalEmailFrom,rentalReplyTo,rentalResendApiKey} from "./rentalEmailConfig";

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function kr(ore){
 return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(ore)||0)/100);
}

function date(value){
 if(!value)return "";
 const d=new Date(value+"T12:00:00");
 return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("nb-NO",{day:"2-digit",month:"2-digit",year:"numeric"});
}

export async function sendRentalConfirmation({booking,itemName,req}){
 const email=String(booking?.customer?.email||"").trim().toLowerCase();
 if(!email)throw new Error("Kunden mangler e-postadresse.");

 const resendKey=rentalResendApiKey();
 if(!resendKey)throw new Error("E-post er ikke konfigurert.");

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const from=rentalEmailFrom();
 const replyTo=rentalReplyTo();
 const base=rentalBookingSiteUrl(booking,req);
 const accountUrl=booking?.customer_user_id?base+"/min-side":"";
 const fulfillment=booking?.customer?.fulfillment==="delivery"?"Levering":"Henting";
 const address=String(booking?.customer?.address||"").trim();
 const name=itemName||booking?.rental_items?.name||"utstyret";

 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND UTLEIE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">UTLEIE</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(booking.booking_number||booking.bookingNumber||"")}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Utleien er bekreftet</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(booking?.customer?.name||"kunde")}. Vi har bekreftet bookingen av ${esc(name)}.</p>
<div style="padding:16px;background:#101010;border:1px solid #2d2d2d">
<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#8e887f">Periode</span><b style="color:#fff">${esc(date(booking.start_date||booking.startDate))} – ${esc(date(booking.end_date||booking.endDate))}</b></div>
<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Utlevering</span><b style="color:#fff">${fulfillment}</b></div>
<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Leiepris</span><b style="color:#fff">${esc(kr(booking.total_ore??booking.totalOre))}</b></div>
${Number(booking.deposit_ore??booking.depositOre)>0?`<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Depositum</span><b style="color:#fff">${esc(kr(booking.deposit_ore??booking.depositOre))}</b></div>`:""}
${address?`<div style="margin-top:12px;color:#8e887f;font-size:11px">ADRESSE</div><div style="margin-top:4px;color:#fff;font-weight:700">${esc(address)}</div>`:""}
</div>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Ta kontakt dersom noe rundt henting eller levering må avklares.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Utleie · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 const result=await resend.emails.send({
  from,to:email,replyTo,
  subject:"Utleien er bekreftet – "+(booking.booking_number||booking.bookingNumber||""),
  html
 });
 if(result?.error)throw new Error(result.error.message||"E-posten kunne ikke sendes.");
 return {sentTo:email};
}
