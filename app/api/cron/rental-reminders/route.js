import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";

const MAX_PER_RUN=50;

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function authorized(req){
 const secret=String(process.env.CRON_SECRET||"").trim();
 const authorization=String(req.headers.get("authorization")||"");
 if(secret)return authorization===("Bearer "+secret);
 const ua=String(req.headers.get("user-agent")||"").toLowerCase();
 return ua.startsWith("vercel-cron/");
}

function osloDate(offsetDays=0){
 const now=new Date(Date.now()+offsetDays*86400000);
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return value.year+"-"+value.month+"-"+value.day;
}

function displayDate(value){
 const d=new Date(value+"T12:00:00Z");
 return d.toLocaleDateString("nb-NO",{timeZone:"Europe/Oslo",day:"2-digit",month:"2-digit",year:"numeric"});
}

function baseUrl(req){
 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 return configured||new URL(req.url).origin||"https://www.aadland-service.no";
}

export async function GET(req){
 if(!authorized(req))return NextResponse.json({error:"Ingen tilgang."},{status:401});

 const resendKey=process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({ok:false,error:"RESEND_API_KEY mangler."},{status:503});

 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 const targetDate=osloDate(1);
 const {data,error}=await s.from("rental_bookings")
  .select("id,booking_number,status,customer,customer_user_id,start_date,end_date,total_ore,deposit_ore,confirmation_sent_at,reminder_sent_at,rental_items(name)")
  .eq("status","confirmed")
  .eq("start_date",targetDate)
  .not("confirmation_sent_at","is",null)
  .is("reminder_sent_at",null)
  .order("created_at",{ascending:true})
  .limit(MAX_PER_RUN);

 if(error){
  if(["42703","42P01"].includes(String(error.code||""))){
   return NextResponse.json({ok:true,setupRequired:true,sent:0,message:"rental_reminders.sql er ikke kjørt ennå."});
  }
  console.error("RENTAL REMINDER QUERY",error);
  return NextResponse.json({ok:false,error:"Utleiebookingene kunne ikke hentes."},{status:500});
 }

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const base=baseUrl(req);
 let sentCount=0;
 const failures=[];

 for(const booking of data||[]){
  const email=String(booking.customer?.email||"").trim().toLowerCase();
  if(!email)continue;

  const claimedAt=new Date().toISOString();
  const {data:claimed,error:claimError}=await s.from("rental_bookings")
   .update({reminder_sent_at:claimedAt,updated_at:claimedAt})
   .eq("id",booking.id)
   .eq("status","confirmed")
   .is("reminder_sent_at",null)
   .select("id")
   .maybeSingle();

  if(claimError||!claimed){
   if(claimError)console.error("RENTAL REMINDER CLAIM",booking.id,claimError);
   continue;
  }

  try{
   const name=esc(booking.customer?.name||"kunde");
   const itemName=esc(booking.rental_items?.name||"utstyret");
   const fulfillment=booking.customer?.fulfillment==="delivery"?"Levering":"Henting";
   const address=String(booking.customer?.address||"").trim();
   const accountUrl=booking.customer_user_id?base+"/min-side":"";
   const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">PÅMINNELSE OM UTLEIE</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(booking.booking_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Utleien starter i morgen</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${name}. Dette er en kort påminnelse om bookingen av ${itemName}.</p>
<div style="padding:16px;background:#101010;border:1px solid #2d2d2d">
<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#8e887f">Start</span><b style="color:#fff">${esc(displayDate(booking.start_date))}</b></div>
<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Slutt</span><b style="color:#fff">${esc(displayDate(booking.end_date))}</b></div>
<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Utlevering</span><b style="color:#fff">${fulfillment}</b></div>
${address?`<div style="margin-top:12px;color:#8e887f;font-size:11px">ADRESSE</div><div style="margin-top:4px;color:#fff;font-weight:700">${esc(address)}</div>`:""}
</div>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Hvis noe har endret seg, svar på denne e-posten eller ring 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

   const result=await resend.emails.send({
    from:"Aadland Service <noreply@aadland-service.no>",
    to:email,
    replyTo:"post@aadland-service.no",
    subject:"Påminnelse om utleie i morgen – Aadland Service",
    html
   });
   if(result?.error)throw new Error(result.error.message||"E-postfeil");
   sentCount+=1;
  }catch(sendError){
   failures.push({id:booking.id,error:String(sendError?.message||sendError||"Ukjent feil").slice(0,180)});
   console.error("RENTAL REMINDER EMAIL",booking.id,sendError);
   await s.from("rental_bookings").update({reminder_sent_at:null,updated_at:new Date().toISOString()}).eq("id",booking.id).eq("reminder_sent_at",claimedAt);
  }
 }

 return NextResponse.json({ok:true,targetDate,checked:(data||[]).length,sent:sentCount,failed:failures.length,failures});
}
