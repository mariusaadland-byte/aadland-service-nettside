import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function currency(ore){
 return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100);
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Testkvittering er bare tilgjengelig i preview."},{status:404});
 const currentUser=await getAdminUser();
 if(!currentUser)return NextResponse.json({error:"Ikke innlogget."},{status:401});
 if(!(await hasPermission("canUpdateOrders")))return NextResponse.json({error:"Du har ikke tilgang til å sende testkvittering."},{status:403});

 const body=await req.json().catch(()=>({}));
 const email=String(body.email||"").trim().toLowerCase();
 const customerName=String(body.customerName||"Testkunde").trim().slice(0,120)||"Testkunde";
 const reference=String(body.reference||"TEST-VIPPS-12345").trim().slice(0,120)||"TEST-VIPPS-12345";
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});

 const resendKey=process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"Preview-e-post er ikke konfigurert."},{status:503});

 const orderNumber="TEST-1001";
 const items=[
  {quantity:1,name:"Eksempelprodukt",unitPriceOre:800000}
 ];
 const shippingOre=50000;
 const totalOre=850000;
 const itemRows=items.map(item=>{
  const qty=Math.max(1,Number(item.quantity)||1),line=(Number(item.unitPriceOre)||0)*qty;
  return `<tr><td style="padding:10px 12px;border-top:1px solid #2d2d2d;color:#fff">${esc(qty+" × "+item.name)}</td><td style="padding:10px 12px;border-top:1px solid #2d2d2d;color:#fff;text-align:right">${esc(currency(line))}</td></tr>`;
 }).join("");

 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">BETALINGSBEKREFTELSE</div></td></tr>
<tr><td style="padding:30px">
<div style="padding:12px 14px;margin-bottom:18px;background:#33280f;border:1px solid #d7a74e;color:#f6d893;font-weight:800">TEST – ingen betaling er utført eller registrert</div>
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${orderNumber}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Betalingen er registrert</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(customerName)}. Dette er bekreftelse på at vi har registrert full betaling for bestillingen.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:10px 12px;color:#8e887f">Referanse</td><td style="padding:10px 12px;color:#fff;text-align:right;font-weight:700">${esc(reference)}</td></tr>
${itemRows}
<tr><td style="padding:10px 12px;border-top:1px solid #2d2d2d;color:#fff">Frakt / levering</td><td style="padding:10px 12px;border-top:1px solid #2d2d2d;color:#fff;text-align:right">${esc(currency(shippingOre))}</td></tr>
<tr><td style="padding:13px 12px;border-top:1px solid #4b4438;color:#d9b365;font-weight:900">BETALT</td><td style="padding:13px 12px;border-top:1px solid #4b4438;color:#fff;text-align:right;font-size:18px;font-weight:900">${esc(currency(totalOre))}</td></tr>
</table>
<p style="margin:16px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Dette er en betalingsbekreftelse fra Aadland Service. Ta kontakt dersom noe ikke stemmer.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
  const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
  const result=await resend.emails.send({
   from,to:email,replyTo,
   subject:"[TEST] Betalingsbekreftelse – "+orderNumber,
   html
  });
  if(result?.error)throw new Error(result.error.message||"E-postfeil");
  return NextResponse.json({ok:true,sentTo:email});
 }catch(error){
  console.error("TEST RECEIPT EMAIL ERROR",error);
  return NextResponse.json({error:"Testkvitteringen kunne ikke sendes."},{status:500});
 }
}
