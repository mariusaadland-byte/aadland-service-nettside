import {sameOriginGuard} from "../../../lib/requestGuard";
import {NextResponse} from "next/server";
import crypto from "crypto";
import {getCustomerUserId} from "../../../lib/customer-auth";
import {db,fromDbRentalItem} from "../../../lib/supabase";
const RENTAL_TERMS_VERSION="2026-09";
function valid(a,b){if(!/^\d{4}-\d{2}-\d{2}$/.test(a||"")||!/^\d{4}-\d{2}-\d{2}$/.test(b||"")||b<a)return false;const A=new Date(a+"T12:00:00Z"),B=new Date(b+"T12:00:00Z");return !Number.isNaN(A.valueOf())&&!Number.isNaN(B.valueOf())&&A.toISOString().slice(0,10)===a&&B.toISOString().slice(0,10)===b}
function todayOslo(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${v.year}-${v.month}-${v.day}`}
function num(){return "AS-U-"+Date.now().toString().slice(-6)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase()}
function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function days(a,b){return Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)+1}
function calculate(i,a,b){const d=days(a,b);let total=d*i.dailyPriceOre,basis="daily";if(i.weeklyPriceOre!=null&&d>=7){total=Math.floor(d/7)*i.weeklyPriceOre+(d%7)*i.dailyPriceOre;basis="weekly"}if(i.weekendPriceOre!=null&&d<=3){const x=new Date(a+"T12:00:00Z").getUTCDay(),y=new Date(b+"T12:00:00Z").getUTCDay();if([x,y].some(v=>v===0||v===5||v===6)&&i.weekendPriceOre<total){total=i.weekendPriceOre;basis="weekend"}}if(i.longTermDays&&d>=i.longTermDays&&i.longTermDiscountPercent>0){total=Math.round(total*(1-i.longTermDiscountPercent/100));basis+="+longterm"}return {days:d,totalOre:Math.max(0,total),depositOre:i.depositOre,basis}}
export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;try{const b=await req.json();const name=String(b.customer?.name||"").trim(),email=String(b.customer?.email||"").trim().toLowerCase(),phone=String(b.customer?.phone||"").trim();if(name.length>120||email.length>254||phone.length>40)return NextResponse.json({error:"Kontaktinformasjonen er for lang."},{status:400});if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});if(!b.itemId||!valid(b.startDate,b.endDate)||b.startDate<todayOslo()||!name||!email||!phone||b.acceptedTerms!==true)return NextResponse.json({error:"Fyll inn kontaktinformasjon, gyldige datoer og godta vilkårene."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const {data:raw,error}=await s.from("rental_items").select("*").eq("id",b.itemId).single();if(error||!raw||raw.active===false||raw.status!=="available")return NextResponse.json({error:"Utstyret er ikke tilgjengelig."},{status:409});const item=fromDbRentalItem(raw);const fulfillment=b.fulfillment==="delivery"?"delivery":"pickup";if((fulfillment==="delivery"&&!item.deliveryAvailable)||(fulfillment==="pickup"&&!item.pickupAvailable))return NextResponse.json({error:"Valgt utleveringsmåte er ikke tilgjengelig."},{status:400});const address=String(b.customer?.address||"").trim().slice(0,300);if(fulfillment==="delivery"&&!address)return NextResponse.json({error:"Fyll inn leveringsadresse."},{status:400});const buffer=item.bufferDays||0,bs=new Date(b.startDate+"T12:00:00Z"),be=new Date(b.endDate+"T12:00:00Z");bs.setUTCDate(bs.getUTCDate()-buffer);be.setUTCDate(be.getUTCDate()+buffer);const from=bs.toISOString().slice(0,10),to=be.toISOString().slice(0,10);const [{data:blocks,error:blockError},{data:bookings,error:bookingError}]=await Promise.all([s.from("rental_blocks").select("id").eq("rental_item_id",item.id).lte("start_date",to).gte("end_date",from),s.from("rental_bookings").select("id").eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).gte("end_date",from)]);if(blockError||bookingError)throw blockError||bookingError;if((blocks?.length||0)+(bookings?.length||0)>=Math.max(1,Number(item.quantity)||1))return NextResponse.json({error:"Utstyret er allerede opptatt i denne perioden."},{status:409});const p=calculate(item,b.startDate,b.endDate);if(p.days>365)return NextResponse.json({error:"Utleieperioden kan ikke være lengre enn 365 dager."},{status:400});const customerUserId=await getCustomerUserId();const bookingNumber=num(),snapshot={dailyPriceOre:item.dailyPriceOre,weekendPriceOre:item.weekendPriceOre,weeklyPriceOre:item.weeklyPriceOre,longTermDays:item.longTermDays,longTermDiscountPercent:item.longTermDiscountPercent,basis:p.basis,days:p.days};const bookingRecord={customer_user_id:customerUserId,booking_number:bookingNumber,rental_item_id:item.id,customer:{name,email,phone,address,fulfillment},start_date:b.startDate,end_date:b.endDate,price_snapshot:snapshot,total_ore:p.totalOre,deposit_ore:p.depositOre,terms_version:RENTAL_TERMS_VERSION};const {error:insertError}=await s.rpc("create_rental_booking_if_available",{booking_record:bookingRecord,buffered_start:from,buffered_end:to});if(insertError){console.error("ATOMIC RENTAL BOOKING ERROR",insertError);if(String(insertError.message||"").includes("RENTAL_UNAVAILABLE"))return NextResponse.json({error:"Utstyret ble nettopp opptatt i denne perioden. Velg andre datoer og prøv igjen."},{status:409});throw insertError;}const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY):process.env.RESEND_API_KEY;
if(resendKey){
 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const sender=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
  const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
  const requestOrigin=new URL(req.url).origin;
  const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
  const minSideUrl=(configuredOrigin||requestOrigin)+"/min-side";
  const accountUrl=customerUserId?minSideUrl:"";
  const totalText=(p.totalOre/100).toLocaleString("nb-NO",{minimumFractionDigits:0,maximumFractionDigits:2})+" kr";
  const depositText=p.depositOre?(p.depositOre/100).toLocaleString("nb-NO",{minimumFractionDigits:0,maximumFractionDigits:2})+" kr":"";
  const customerHtml=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">UTLEIE</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(bookingNumber)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Utleieforespørselen er mottatt</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(name)}! Vi har mottatt forespørselen om ${esc(item.name)}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px">Periode</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right">${esc(b.startDate)} – ${esc(b.endDate)}</td></tr>
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Leiepris</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(totalText)}</td></tr>
${p.depositOre?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Depositum</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(depositText)}</td></tr>`:""}
</table>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:`<a href="${esc(minSideUrl)}" style="display:inline-block;margin-top:20px;border:1px solid #d7a74e;color:#d7a74e;text-decoration:none;font-weight:900;padding:12px 18px">Opprett Min side →</a><p style="margin:10px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Opprett konto med samme e-postadresse, så kobles utleien automatisk til kontoen din.</p>`}
<p style="margin:22px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Vi tar kontakt når bookingen er behandlet.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
  await resend.emails.send({
   from:sender,to:email,replyTo,
   subject:"Vi har mottatt utleieforespørselen "+bookingNumber,
   html:customerHtml
  });
  if(process.env.ORDER_EMAIL_TO){
   await resend.emails.send({
    from:sender,to:process.env.ORDER_EMAIL_TO,replyTo:email,
    subject:"Ny utleieforespørsel "+bookingNumber,
    text:`${item.name}\n${b.startDate} – ${b.endDate}\n${name}\n${phone}\n${email}`
   });
  }
 }catch(e){console.error("UTLEIE E-POSTFEIL",e)}
}return NextResponse.json({bookingNumber,totalOre:p.totalOre,depositOre:p.depositOre,message:"Forespørselen er mottatt."})}catch(e){console.error(e);return NextResponse.json({error:"Bookingen kunne ikke lagres."},{status:500})}}
