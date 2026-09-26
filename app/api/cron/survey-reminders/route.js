import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey,shiftDateKey,osloDayStartIso,osloDayEndIso} from "../../../../lib/osloTime";

const MAX_PER_RUN=25;
function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function baseUrl(req){
 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 return configured||new URL(req.url).origin||"https://www.aadland-service.no";
}

export async function GET(req){
 const authError=cronGuard(req); if(authError)return authError;

 const resendKey=process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({ok:false,error:"RESEND_API_KEY mangler."},{status:503});

 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 const targetDate=shiftDateKey(osloDateKey(new Date()),1);
 const from=osloDayStartIso(targetDate);
 const until=osloDayEndIso(targetDate);

 const {data,error}=await s.from("orders")
  .select("id,order_number,status,order_type,customer,customer_user_id,survey_date,survey_confirmation_sent_at,survey_reminder_sent_at,archived_at")
  .eq("order_type","custom")
  .eq("status","confirmed")
  .not("survey_date","is",null)
  .not("survey_confirmation_sent_at","is",null)
  .is("survey_reminder_sent_at",null)
  .is("archived_at",null)
  .gte("survey_date",from)
  .lte("survey_date",until)
  .order("survey_date",{ascending:true})
  .limit(MAX_PER_RUN);

 if(error){
  if(["42703","42P01"].includes(String(error.code||""))){
   return NextResponse.json({ok:true,setupRequired:true,sent:0,message:"survey_reminders.sql er ikke kjørt ennå."});
  }
  console.error("SURVEY REMINDER QUERY",error);
  return NextResponse.json({ok:false,error:"Befaringene kunne ikke hentes."},{status:500});
 }

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const base=baseUrl(req);
 let sentCount=0;
 const failures=[];

 for(const order of data||[]){
  const email=String(order.customer?.email||"").trim().toLowerCase();
  if(!email)continue;

  const claimedAt=new Date().toISOString();
  const {data:claimed,error:claimError}=await s.from("orders")
   .update({survey_reminder_sent_at:claimedAt,updated_at:claimedAt})
   .eq("id",order.id)
   .eq("status","confirmed")
   .is("survey_reminder_sent_at",null)
   .select("id")
   .maybeSingle();

  if(claimError||!claimed){
   if(claimError)console.error("SURVEY REMINDER CLAIM",order.id,claimError);
   continue;
  }

  try{
   const customerName=esc(order.customer?.name||"kunde");
   const dateText=new Date(order.survey_date).toLocaleString("nb-NO",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Oslo"});
   const address=[order.customer?.address,order.customer?.postalCode,order.customer?.city].filter(Boolean).join(", ");
   const accountUrl=order.customer_user_id?base+"/min-side":"";

   const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">PÅMINNELSE OM BEFARING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Vi sees til befaring</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${customerName}. Dette er en kort påminnelse om den avtalte befaringen.</p>
<div style="padding:17px;background:#101010;border:1px solid #2d2d2d">
<div style="color:#8e887f;font-size:11px">DATO OG TID</div><div style="margin-top:5px;color:#fff;font-size:21px;font-weight:900">${esc(dateText)}</div>
${address?`<div style="margin-top:14px;color:#8e887f;font-size:11px">ADRESSE</div><div style="margin-top:4px;color:#fff;font-weight:700">${esc(address)}</div>`:""}
</div>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Hvis tidspunktet ikke lenger passer, svar på denne e-posten eller ring 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

   const result=await resend.emails.send({
    from:"Aadland Service <noreply@aadland-service.no>",
    to:email,
    replyTo:"post@aadland-service.no",
    subject:"Påminnelse om befaring – Aadland Service",
    html
   });
   if(result?.error)throw new Error(result.error.message||"E-postfeil");
   sentCount+=1;
  }catch(sendError){
   failures.push({id:order.id,error:String(sendError?.message||sendError||"Ukjent feil").slice(0,180)});
   console.error("SURVEY REMINDER EMAIL",order.id,sendError);
   await s.from("orders").update({survey_reminder_sent_at:null,updated_at:new Date().toISOString()}).eq("id",order.id).eq("survey_reminder_sent_at",claimedAt);
  }
 }

 return NextResponse.json({ok:true,targetDate,checked:(data||[]).length,sent:sentCount,failed:failures.length,failures});
}
