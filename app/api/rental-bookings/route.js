import {rateLimitRequest} from "../../../lib/rateLimit";
import {sameOriginGuard} from "../../../lib/requestGuard";
import {NextResponse} from "next/server";
import crypto from "crypto";
import {getCustomerUserId} from "../../../lib/customer-auth";
import {db,fromDbRentalItem} from "../../../lib/supabase";
import {rentalEmailFrom,rentalReplyTo,rentalRequestSiteUrl,rentalSiteUrl,rentalResendApiKey} from "../../../lib/rentalEmailConfig";
import {sendRentalConfirmation} from "../../../lib/rentalConfirmationEmail";
import {rentalBillingDecision} from "../../../lib/rentalBilling";

const RENTAL_TERMS_VERSION="2026-09";

function valid(a,b){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a||"")||!/^\d{4}-\d{2}-\d{2}$/.test(b||"")||b<a)return false;
 const A=new Date(a+"T12:00:00Z"),B=new Date(b+"T12:00:00Z");
 return !Number.isNaN(A.valueOf())&&!Number.isNaN(B.valueOf())&&A.toISOString().slice(0,10)===a&&B.toISOString().slice(0,10)===b;
}

function todayOslo(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${v.year}-${v.month}-${v.day}`;
}

function num(){
 return "AS-U-"+Date.now().toString().slice(-6)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();
}

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function days(a,b){
 return Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)+1;
}

function calculate(i,a,b){
 const d=days(a,b);
 let total=d*i.dailyPriceOre,basis="daily";
 if(i.weeklyPriceOre!=null&&d>=7){
  total=Math.floor(d/7)*i.weeklyPriceOre+(d%7)*i.dailyPriceOre;
  basis="weekly";
 }
 if(i.weekendPriceOre!=null&&d<=3){
  const x=new Date(a+"T12:00:00Z").getUTCDay(),y=new Date(b+"T12:00:00Z").getUTCDay();
  if([x,y].some(v=>v===0||v===5||v===6)&&i.weekendPriceOre<total){
   total=i.weekendPriceOre;
   basis="weekend";
  }
 }
 if(i.longTermDays&&d>=i.longTermDays&&i.longTermDiscountPercent>0){
  total=Math.round(total*(1-i.longTermDiscountPercent/100));
  basis+="+longterm";
 }
 return {days:d,totalOre:Math.max(0,total),depositOre:i.depositOre,basis};
}

function money(ore){
 return (Number(ore||0)/100).toLocaleString("nb-NO",{minimumFractionDigits:0,maximumFractionDigits:2})+" kr";
}

function acknowledgementHtml({bookingNumber,name,item,startDate,endDate,totalOre,depositOre,minSideUrl,accountUrl,billing}){
 const creditText=billing?.reason==="credit-limit"&&billing?.creditLimitOre
  ?`<p style="margin:12px 0 0;color:#d9b365;font-size:12px;line-height:1.55">Bookingen er reservert, men tilgjengelig kreditt må avklares før endelig leiebekreftelse sendes.</p>`
  :"";
 return `<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND UTLEIE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">BOOKING REGISTRERT</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(bookingNumber)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Leieperioden er reservert</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(name)}! Bookingen av ${esc(item.name)} er registrert automatisk fordi perioden er ledig.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px">Periode</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right">${esc(startDate)} – ${esc(endDate)}</td></tr>
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Leiepris</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(money(totalOre))}</td></tr>
${depositOre?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Depositum</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(money(depositOre))}</td></tr>`:""}
</table>
<p style="color:#c9c3b8;line-height:1.65;margin:20px 0 0">Endelig leiebekreftelse sendes automatisk når betalingen er registrert, eller med en gang dersom kunden er godkjent for faktura/kreditt.</p>
${creditText}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:`<a href="${esc(minSideUrl)}" style="display:inline-block;margin-top:20px;border:1px solid #d7a74e;color:#d7a74e;text-decoration:none;font-weight:900;padding:12px 18px">Opprett Min side →</a><p style="margin:10px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Opprett konto med samme e-postadresse, så kobles utleien automatisk til kontoen din.</p>`}
<p style="margin:22px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Finner du ikke e-posten, sjekk søppelpost/spam.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Utleie · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(req){
 const originError=sameOriginGuard(req);
 if(originError)return originError;

 const rateError=await rateLimitRequest(req,{
  scope:"rental-bookings",
  max:10,
  windowSeconds:900,
  message:"For mange bookinger på kort tid. Prøv igjen senere."
 });
 if(rateError)return rateError;

 try{
  const b=await req.json();
  const name=String(b.customer?.name||"").trim();
  const email=String(b.customer?.email||"").trim().toLowerCase();
  const phone=String(b.customer?.phone||"").trim();

  if(name.length>120||email.length>254||phone.length>40){
   return NextResponse.json({error:"Kontaktinformasjonen er for lang."},{status:400});
  }
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
   return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
  }
  if(!b.itemId||!valid(b.startDate,b.endDate)||b.startDate<todayOslo()||!name||!email||!phone||b.acceptedTerms!==true){
   return NextResponse.json({error:"Fyll inn kontaktinformasjon, gyldige datoer og godta vilkårene."},{status:400});
  }

  const s=db();
  if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

  const {data:raw,error}=await s.from("rental_items").select("*").eq("id",b.itemId).single();
  if(error||!raw||raw.active===false||raw.status!=="available"){
   return NextResponse.json({error:"Utstyret er ikke tilgjengelig."},{status:409});
  }

  const item=fromDbRentalItem(raw);
  const fulfillment=b.fulfillment==="delivery"?"delivery":"pickup";
  if((fulfillment==="delivery"&&!item.deliveryAvailable)||(fulfillment==="pickup"&&!item.pickupAvailable)){
   return NextResponse.json({error:"Valgt utleveringsmåte er ikke tilgjengelig."},{status:400});
  }

  const address=String(b.customer?.address||"").trim().slice(0,300);
  if(fulfillment==="delivery"&&!address){
   return NextResponse.json({error:"Fyll inn leveringsadresse."},{status:400});
  }

  const buffer=item.bufferDays||0;
  const bs=new Date(b.startDate+"T12:00:00Z"),be=new Date(b.endDate+"T12:00:00Z");
  bs.setUTCDate(bs.getUTCDate()-buffer);
  be.setUTCDate(be.getUTCDate()+buffer);
  const from=bs.toISOString().slice(0,10),to=be.toISOString().slice(0,10);

  const [{data:blocks,error:blockError},{data:bookings,error:bookingError}]=await Promise.all([
   s.from("rental_blocks").select("id").eq("rental_item_id",item.id).lte("start_date",to).gte("end_date",from),
   s.from("rental_bookings").select("id").eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).gte("end_date",from)
  ]);
  if(blockError||bookingError)throw blockError||bookingError;
  if((blocks?.length||0)>0||(bookings?.length||0)>=Math.max(1,Number(item.quantity)||1)){
   return NextResponse.json({error:"Utstyret er allerede opptatt i denne perioden."},{status:409});
  }

  const p=calculate(item,b.startDate,b.endDate);
  if(p.days>365)return NextResponse.json({error:"Utleieperioden kan ikke være lengre enn 365 dager."},{status:400});

  const billing=await rentalBillingDecision(s,email,p.totalOre);
  const customerUserId=await getCustomerUserId();
  const siteOrigin=rentalRequestSiteUrl(req)||rentalSiteUrl(req);
  const bookingNumber=num();
  const snapshot={
   dailyPriceOre:item.dailyPriceOre,
   weekendPriceOre:item.weekendPriceOre,
   weeklyPriceOre:item.weeklyPriceOre,
   longTermDays:item.longTermDays,
   longTermDiscountPercent:item.longTermDiscountPercent,
   basis:p.basis,
   days:p.days
  };
  const bookingRecord={
   customer_user_id:customerUserId,
   booking_number:bookingNumber,
   rental_item_id:item.id,
   customer:{name,email,phone,address,fulfillment,siteOrigin},
   start_date:b.startDate,
   end_date:b.endDate,
   price_snapshot:snapshot,
   total_ore:p.totalOre,
   deposit_ore:p.depositOre,
   terms_version:RENTAL_TERMS_VERSION
  };

  const {data:newBookingId,error:insertError}=await s.rpc("create_rental_booking_if_available",{
   booking_record:bookingRecord,
   buffered_start:from,
   buffered_end:to
  });
  if(insertError){
   console.error("ATOMIC RENTAL BOOKING ERROR",insertError);
   if(String(insertError.message||"").includes("RENTAL_UNAVAILABLE")){
    return NextResponse.json({error:"Utstyret ble nettopp opptatt i denne perioden. Velg andre datoer og prøv igjen."},{status:409});
   }
   throw insertError;
  }

  const resendKey=rentalResendApiKey();
  let confirmationSent=false;
  let acknowledgementSent=false;

  if(resendKey){
   const {Resend}=await import("resend");
   const resend=new Resend(resendKey);
   const sender=rentalEmailFrom();
   const replyTo=rentalReplyTo();
   const minSideUrl=siteOrigin+"/min-side";
   const accountUrl=customerUserId?minSideUrl:"";

   if(billing.eligible){
    try{
     await sendRentalConfirmation({
      booking:{...bookingRecord,id:newBookingId,status:"confirmed"},
      itemName:item.name,
      req
     });
     confirmationSent=true;
     await s.from("rental_bookings").update({
      confirmation_sent_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
     }).eq("id",newBookingId);
    }catch(e){
     console.error("AUTO RENTAL CONFIRMATION",e);
    }
   }

   if(!confirmationSent){
    try{
     const customerHtml=acknowledgementHtml({
      bookingNumber,name,item,startDate:b.startDate,endDate:b.endDate,
      totalOre:p.totalOre,depositOre:p.depositOre,minSideUrl,accountUrl,billing
     });
     const result=await resend.emails.send({
      from:sender,
      to:email,
      replyTo,
      subject:"Bookingen er registrert – "+bookingNumber,
      html:customerHtml
     });
     if(result?.error)throw new Error(result.error.message||"E-postfeil");
     acknowledgementSent=true;
    }catch(e){
     console.error("UTLEIE KUNDE-E-POSTFEIL",e);
    }
   }

   try{
    const adminTo=String(process.env.RENTAL_ORDER_EMAIL_TO||process.env.ORDER_EMAIL_TO||"post@aadland-service.no").trim();
    const result=await resend.emails.send({
     from:sender,
     to:adminTo,
     replyTo:email,
     subject:"Ny utleiebooking "+bookingNumber+" – "+item.name,
     text:[
      "Ny utleiebooking",
      "",
      "Booking: "+bookingNumber,
      "Kunde: "+name,
      "Telefon: "+phone,
      "E-post: "+email,
      "Utstyr: "+item.name,
      "Periode: "+b.startDate+" – "+b.endDate,
      "Leiepris: "+money(p.totalOre),
      p.depositOre?"Depositum: "+money(p.depositOre):"",
      "Utlevering: "+(fulfillment==="delivery"?"Levering":"Henting"),
      address?"Adresse: "+address:"",
      "",
      confirmationSent
       ?"Endelig leiebekreftelse er sendt automatisk (faktura/kreditt godkjent)."
       :"Perioden er reservert automatisk. Endelig leiebekreftelse venter på betaling eller godkjent faktura/kreditt."
     ].filter(Boolean).join("\n")
    });
    if(result?.error)throw new Error(result.error.message||"E-postfeil");
   }catch(e){
    console.error("UTLEIE ADMIN-E-POSTFEIL",e);
   }
  }

  return NextResponse.json({
   bookingNumber,
   totalOre:p.totalOre,
   depositOre:p.depositOre,
   autoConfirmed:true,
   confirmationSent,
   acknowledgementSent,
   billingReason:billing.reason,
   message:confirmationSent
    ?"Bookingen er bekreftet. Sjekk innboks og søppelpost for leiebekreftelsen."
    :"Bookingen er registrert og perioden er reservert. Sjekk innboks og søppelpost for e-post fra Aadland Utleie."
  });
 }catch(e){
  console.error(e);
  return NextResponse.json({error:"Bookingen kunne ikke lagres."},{status:500});
 }
}
