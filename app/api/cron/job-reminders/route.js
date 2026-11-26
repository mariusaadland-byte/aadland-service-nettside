import {withServiceCronMonitoring} from "../../../../lib/serviceCronMonitor";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey,shiftDateKey,osloDayStartIso,osloDayEndIso} from "../../../../lib/osloTime";
import {serviceEmailFrom,serviceReplyTo} from "../../../../lib/serviceEmailConfig";
import {deliverAppointmentReminder,appointmentReminderBacklog} from "../../../../lib/serviceAppointmentReminders";

export const runtime="nodejs";
export const maxDuration=60;

const MAX_PER_RUN=25;
function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function baseUrl(req){
 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 return configured||new URL(req.url).origin||"https://www.aadland-service.no";
}

function makeJobReminderEmail(order,base){
 const email=String(order.customer?.email||"").trim().toLowerCase();
   const customerName=esc(order.customer?.name||"kunde");
   const startText=new Date(order.job_start_at).toLocaleString("nb-NO",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Oslo"});
   const address=[order.customer?.address,order.customer?.postalCode,order.customer?.city].filter(Boolean).join(", ");
   const agreement=String(order.job_customer_agreement||"").trim();
   const accountUrl=order.customer_user_id?base+"/min-side":"";

   const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">PÅMINNELSE OM OPPSTART</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">OPPDRAG ${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Vi sees til oppstart i morgen</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${customerName}. Dette er en kort påminnelse om avtalt oppstart på oppdraget i morgen.</p>
<div style="padding:17px;background:#101010;border:1px solid #2d2d2d">
<div style="color:#8e887f;font-size:11px">AVTALT OPPSTART</div><div style="margin-top:5px;color:#fff;font-size:21px;font-weight:900">${esc(startText)}</div>
${address?`<div style="margin-top:14px;color:#8e887f;font-size:11px">ADRESSE</div><div style="margin-top:4px;color:#fff;font-weight:700">${esc(address)}</div>`:""}
</div>
${agreement?`<div style="margin-top:18px;padding:15px;border-left:3px solid #d7a74e;background:#141414"><div style="color:#8e887f;font-size:11px;margin-bottom:6px">AVTALT VIDERE</div><div style="color:#f5f2ec;white-space:pre-line;line-height:1.6">${esc(agreement)}</div></div>`:""}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Hvis noe har endret seg, svar på denne e-posten eller ring 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;


 return {
  from:serviceEmailFrom(),to:email,replyTo:serviceReplyTo(),
  subject:"Påminnelse om oppstart i morgen – Aadland Service",
  html
 };
}

export async function GET(req){
 // The fallback is only for isolated source-evaluation tests which strip imports.
 // Next.js production always imports and uses the persistent monitor helper.
 if(typeof withServiceCronMonitoring==="function")
  return withServiceCronMonitoring("job-reminders",req,()=>runServiceCron(req));
 return runServiceCron(req);
}
async function runServiceCron(req){
 const authError=cronGuard(req); if(authError)return authError;
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({ok:false,error:"Planlagte kundepåminnelser kan bare sendes i produksjon."},{status:403});

 const resendKey=process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({ok:false,error:"RESEND_API_KEY mangler."},{status:503});

 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 const targetDate=shiftDateKey(osloDateKey(new Date()),1);
 const from=osloDayStartIso(targetDate);
 const until=osloDayEndIso(targetDate);

 const {data,error}=await s.from("orders")
  .select("id,order_number,status,order_type,customer,customer_user_id,job_start_at,job_customer_agreement,job_confirmation_sent_at,job_reminder_sent_at,archived_at")
  .eq("order_type","custom")
  .eq("status","confirmed")
  .not("job_start_at","is",null)
  .not("job_confirmation_sent_at","is",null)
  .is("job_reminder_sent_at",null)
  .is("archived_at",null)
  .gte("job_start_at",from)
  .lte("job_start_at",until)
  .order("job_start_at",{ascending:true})
  .limit(MAX_PER_RUN+1);

 if(error){
  if(["42703","42P01"].includes(String(error.code||""))){
   return NextResponse.json({ok:true,setupRequired:true,sent:0,message:"job_reminders.sql er ikke kjørt ennå."});
  }
  console.error("JOB REMINDER QUERY",error);
  return NextResponse.json({ok:false,error:"Oppdragene kunne ikke hentes."},{status:500});
 }

 const {Resend}=await import("../../../../lib/safeResend");
 const resend=new Resend(resendKey);
 const base=baseUrl(req);
 let sentCount=0;
 const failures=[];

 let skipped=0;
 for(const order of (data||[]).slice(0,MAX_PER_RUN)){
  const outcome=await deliverAppointmentReminder(s,order,{
   kind:"job",targetDate,
   makeEmail:current=>makeJobReminderEmail(current,base),
   sendEmail:(message,options)=>resend.emails.send(message,options)
  });
  if(outcome.state==="sent")sentCount++;
  else if(outcome.state==="skipped"||outcome.state==="cancelled"){
   skipped++;
   if(outcome.reason==="missing_recipient")failures.push({id:order.id,reason:"missing_recipient"});
  }else{
   failures.push({id:order.id,reason:outcome.reason||"unknown_status"});
   console.error("SERVICE APPOINTMENT REMINDER NEEDS REVIEW",{kind:"job",orderId:order.id,reason:outcome.reason});
  }
 }

 const overflow=(data||[]).length>MAX_PER_RUN;
 const backlog=await appointmentReminderBacklog(s,"job");
 if(!backlog.ok)return NextResponse.json({ok:false,error:"Tidligere uavklarte påminnelser kunne ikke kontrolleres.",sent:sentCount},{status:503});
 const requiresReview=Math.max(failures.length,backlog.requiresReview);
 return NextResponse.json({ok:requiresReview===0&&!overflow,targetDate,checked:Math.min((data||[]).length,MAX_PER_RUN),sent:sentCount,skipped,failed:failures.length,failures,requiresReview,held:backlog.held,staleClaims:backlog.staleClaims,overflow},{status:requiresReview||overflow?207:200});
}
