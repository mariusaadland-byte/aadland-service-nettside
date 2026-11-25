import {withServiceCronMonitoring} from "../../../../lib/serviceCronMonitor";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey} from "../../../../lib/osloTime";
import {vatDeadlineEvents,vatReminderEmail} from "../../../../lib/vatDeadlineReminders";

export const runtime="nodejs";
export const maxDuration=60;

export async function GET(req){
 // The fallback is only for isolated source-evaluation tests which strip imports.
 // Next.js production always imports and uses the persistent monitor helper.
 if(typeof withServiceCronMonitoring==="function")
  return withServiceCronMonitoring("vat-deadline-reminders",req,()=>runServiceCron(req));
 return runServiceCron(req);
}
async function runServiceCron(req){
 const denied=cronGuard(req);if(denied)return denied;
 if(process.env.VERCEL_ENV!=="production")
  return NextResponse.json({error:"MVA-fristvarsler er sperret utenfor produksjon."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const today=osloDateKey(new Date());
 const thisYear=Number(today.slice(0,4));
 try{
  const [profile,terms]=await Promise.all([
   s.from("vat_reporting_profile").select("first_term_year,first_term,registration_date")
    .eq("id","primary").maybeSingle(),
   s.from("vat_reporting_term_status").select("year,term,status")
    .gte("year",thisYear-1).lte("year",thisYear+1)
  ]);
  if(profile.error||terms.error||!Array.isArray(terms.data))
   throw Error("MVA-profil eller terminstatus kunne ikke leses. Ingen varsel er sendt.");
  if(!profile.data)
   return NextResponse.json({ok:true,active:false,sent:0,message:"MVA-registrering er ikke bekreftet."});
  const due=vatDeadlineEvents(today,profile.data,terms.data)
   .filter(event=>event.reminderDays!==null);
  if(!due.length)return NextResponse.json({ok:true,date:today,checked:0,sent:0});
  const key=process.env.RESEND_API_KEY;
  if(!key)throw Error("RESEND_API_KEY er ikke konfigurert. Ingen varsel er sendt.");
  let resend=null,sent=0,recovered=0,blocked=0,skipped=0;
  const failures=[];
  for(const event of due){
   // A delivered term can never qualify for an automatic reminder.
   if(event.status==="filed"){skipped++;continue;}
   const args={p_year:event.year,p_term:event.term,p_lead_days:event.daysLeft};
   const claim=await s.rpc("claim_vat_deadline_reminder",{
    ...args,p_due_date:event.deadline,p_today:today
   });
   if(claim.error){
    console.error("VAT REMINDER CLAIM",event.year,event.term,claim.error.code);
    failures.push("Kunne ikke låse varsel for termin "+event.term+"/"+event.year);
    continue;
   }
   const state=claim.data?.state;
   if(state==="skipped"){skipped++;continue;}
   if(state==="blocked"){blocked++;continue;}
   const idempotencyKey=String(claim.data?.key||"");
   if(!idempotencyKey){
    failures.push("Varslingsnøkkel mangler for termin "+event.term+"/"+event.year);
    continue;
   }
   if(state==="provider_accepted"){
    const finished=await s.rpc("complete_vat_deadline_reminder",{...args,p_key:idempotencyKey});
    if(finished.error){
     console.error("VAT REMINDER RECOVERY",event.year,event.term,finished.error.code);
     failures.push("Bekreftet varsel trenger manuell kontroll for termin "+event.term+"/"+event.year);
    }else recovered++;
    continue;
   }
   if(state!=="claimed"){blocked++;continue;}

   // Minimize the risk of emailing just after the owner marks the term filed.
   const refreshed=await s.from("vat_reporting_term_status")
    .select("status").eq("year",event.year).eq("term",event.term).maybeSingle();
   if(refreshed.error){
    const held=await s.rpc("vat_deadline_reminder_uncertain",{
     ...args,p_key:idempotencyKey,p_error:"Kunne ikke kontrollere terminstatus før utsending."
    });
    if(held.error)console.error("VAT REMINDER HOLD",held.error.code);
    failures.push("Status kunne ikke leses for termin "+event.term+"/"+event.year);
    continue;
   }
   if(refreshed.data?.status==="filed"){
    const skippedStatus=await s.rpc("skip_vat_deadline_reminder_if_filed",{
     ...args,p_key:idempotencyKey
    });
    if(skippedStatus.error){
     failures.push("Bekreftet innsendt termin kunne ikke markeres som utelatt.");
    }else skipped++;
    continue;
   }
   const message=vatReminderEmail(event);
   try{
    if(!resend){
     const {Resend}=await import("../../../../lib/safeResend");
     resend=new Resend(key);
    }
    const result=await resend.emails.send({
     from:"Aadland Service <noreply@aadland-service.no>",
     to:"post@aadland-service.no",
     subject:message.subject,text:message.text
    },{idempotencyKey});
    if(result?.error)throw Error(result.error.message||"Resend feil");
    const providerId=String(result?.data?.id||"").trim();
    if(!providerId)throw Error("Resend svarte uten bekreftet meldings-ID.");
    const accepted=await s.rpc("vat_deadline_reminder_provider_accepted",{
     ...args,p_key:idempotencyKey,p_provider_email_id:providerId
    });
    if(accepted.error){
     // Provider may have accepted the message. Keep the original claim,
     // NEVER retry this period/day automatically.
     console.error("VAT REMINDER ACK WRITE",event.year,event.term,accepted.error.code);
     failures.push("E-post bekreftet, men kvittering kunne ikke lagres. Ikke send igjen.");
     continue;
    }
    const completed=await s.rpc("complete_vat_deadline_reminder",{
     ...args,p_key:idempotencyKey
    });
    if(completed.error){
     console.error("VAT REMINDER FINISH",event.year,event.term,completed.error.code);
     failures.push("E-post bekreftet, men historikken kunne ikke ferdigstilles.");
     continue;
    }
    sent++;
   }catch(error){
    console.error("VAT REMINDER UNCERTAIN",event.year,event.term,String(error?.message||error));
    const hold=await s.rpc("vat_deadline_reminder_uncertain",{
     ...args,p_key:idempotencyKey,
     p_error:String(error?.message||"Uavklart Resend-status").slice(0,180)
    });
    if(hold.error)console.error("VAT REMINDER UNCERTAIN WRITE",hold.error.code);
    failures.push("E-poststatus uavklart. Automatisk gjentakelse er sperret.");
   }
  }
  return NextResponse.json({ok:failures.length===0,date:today,checked:due.length,
   sent,recovered,blocked,skipped,failed:failures.length,failures},
   {status:failures.length?503:200});
 }catch(error){
  console.error("VAT DEADLINE CRON",String(error?.message||error));
  return NextResponse.json({error:String(error?.message||"MVA-varslene kunne ikke kontrolleres.")},{status:503});
 }
}
