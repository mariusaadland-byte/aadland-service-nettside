import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {db} from "../../../../lib/supabase";
import {osloDateKey,shiftDateKey} from "../../../../lib/osloTime";
import {rentalEmailFrom,rentalReplyTo,rentalResendApiKey,rentalSiteUrl,rentalEmailLogo} from "../../../../lib/rentalEmailConfig";
import {rentalReturnReminderEligible,rentalReturnReminderKey,rentalReturnReminderMessage} from "../../../../lib/rentalReturnReminder.mjs";
export const runtime="nodejs";
export const maxDuration=60;
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const columns="id,booking_number,status,archived_at,customer,end_date,rental_items(name)";
export async function GET(req){
 const guard=cronGuard(req);if(guard)return guard;
 // Separate rollout gate. No claims or messages in preview or before approval.
 if(process.env.VERCEL_ENV!=="production"||process.env.RENTAL_RETURN_REMINDERS_ENABLED!=="true")return json({ok:true,disabled:true,sent:0});
 const key=rentalResendApiKey(),s=db();
 if(!key||!s)return json({ok:false,error:"Utleiepåminnelser er ikke konfigurert."},503);
 const target=shiftDateKey(osloDateKey(new Date()),1);
 const {data,error}=await s.from("rental_bookings").select(columns).eq("status","active").is("archived_at",null).eq("end_date",target).order("id").limit(100);
 if(error)return json({ok:false,error:"Bookinger kunne ikke kontrolleres."},503);
 const ids=(data||[]).map(x=>x.id);
 if(!ids.length)return json({ok:true,sent:0,targetDate:target});
 const {data:existing,error:journalError}=await s.from("rental_return_reminder_events").select("booking_id").eq("return_date",target).in("booking_id",ids);
 if(journalError)return json({ok:false,setupRequired:true,error:"Påminnelsesloggen er ikke tilgjengelig."},503);
 const done=new Set((existing||[]).map(x=>x.booking_id));
 const {Resend}=await import("../../../../lib/safeResend");
 const resend=new Resend(key);
 let sent=0,review=0,failed=0,skipped=0;
 for(const candidate of (data||[]).filter(b=>!done.has(b.id)&&rentalReturnReminderEligible(b,target)).slice(0,15)){
  const {data:claim,error:claimError}=await s.from("rental_return_reminder_events").insert({booking_id:candidate.id,return_date:target,state:"claimed"}).select("id").single();
  if(claimError){if(claimError.code!=="23505")failed++;continue;}
  // Re-read after durable claim to avoid sending for a known returned/changed rental.
  const {data:current,error:currentError}=await s.from("rental_bookings").select(columns).eq("id",candidate.id).maybeSingle();
  if(currentError||!rentalReturnReminderEligible(current,target)){
   const update=await s.from("rental_return_reminder_events").update({state:currentError?"needs_review":"skipped"}).eq("id",claim.id).eq("state","claimed");
   if(update.error)failed++;
   if(currentError)review++;else skipped++;
   continue;
  }
  try{
   const message=rentalReturnReminderMessage(current,{replyTo:rentalReplyTo(),siteUrl:rentalSiteUrl(req),logoHtml:rentalEmailLogo()});
   const result=await resend.emails.send({from:rentalEmailFrom(),to:String(current.customer.email).trim(),replyTo:rentalReplyTo(),...message},{idempotencyKey:rentalReturnReminderKey(current)});
   if(result?.error||!result?.data?.id)throw Error("SEND_NOT_CONFIRMED");
   const stamp=await s.from("rental_return_reminder_events").update({state:"accepted",provider_id:result.data.id,sent_at:new Date().toISOString()}).eq("id",claim.id).eq("state","claimed");
   if(stamp.error){review++;continue;}
   sent++;
  }catch{
   // Do not retry an ambiguous provider response automatically; retain the claim.
   await s.from("rental_return_reminder_events").update({state:"needs_review"}).eq("id",claim.id).eq("state","claimed");
   review++;
  }
 }
 return json({ok:failed===0&&review===0,targetDate:target,sent,review,failed,skipped},{status:failed||review?503:200}.status);
}
