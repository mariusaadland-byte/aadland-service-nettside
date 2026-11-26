import "server-only";
import {osloDateKey,shiftDateKey} from "./osloTime";

// S-24: Never send twice after a network timeout. Each confirmed appointment
// has one durable claimed attempt with a stable Resend idempotency key.
const TABLE="service_appointment_reminder_attempts";
const kinds=Object.freeze({
 survey:{date:"survey_date",confirmation:"survey_confirmation_sent_at",marker:"survey_reminder_sent_at"},
 job:{date:"job_start_at",confirmation:"job_confirmation_sent_at",marker:"job_reminder_sent_at"}
});
export function sameReminderAppointment(row,claimed,kind,targetDate){
 const fields=kinds[kind];
 if(!fields||!row||!claimed)return false;
 const asIso=value=>{
  const ms=Date.parse(String(value||""));
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
 };
 const email=String(row.customer?.email||"").trim().toLowerCase();
 const at=asIso(row[fields.date]);
 return row.order_type==="custom"&&row.status==="confirmed"&&
  row.archived_at==null&&row[fields.marker]==null&&
  at!==null&&at===asIso(claimed.appointment_at)&&
  asIso(row[fields.confirmation])===asIso(claimed.confirmation_sent_at)&&
  email!==""&&email===claimed.recipient_email&&
  osloDateKey(new Date(at))===targetDate;
}

async function closeWithoutSending(s,id,state,issue){
 const {data,error}=await s.from(TABLE)
  .update({state,last_issue:String(issue||"unconfirmed").slice(0,120),
   updated_at:new Date().toISOString()})
  .eq("id",id).eq("state","claimed").select("id").maybeSingle();
 if(error||!data)console.error("APPOINTMENT REMINDER HOLD COULD NOT BE RECORDED",{state});
 return {state,reason:issue||"unconfirmed"};
}

export async function deliverAppointmentReminder(s,order,{
 kind,targetDate,makeEmail,sendEmail,now=new Date()
}={}){
 const spec=kinds[kind];
 if(!spec||typeof makeEmail!=="function"||typeof sendEmail!=="function")
  return {state:"failed",reason:"invalid_reminder_configuration"};
 const customerEmail=String(order?.customer?.email||"").trim().toLowerCase();
 if(!customerEmail)return {state:"skipped",reason:"missing_recipient"};
 if(!order?.[spec.date]||!order?.[spec.confirmation])
  return {state:"skipped",reason:"unconfirmed_appointment"};
 if(targetDate!==shiftDateKey(osloDateKey(now),1))
  return {state:"failed",reason:"invalid_reminder_target_day"};

 const claim=await s.rpc("claim_service_appointment_reminder",{
  p_order_id:order.id,p_kind:kind,
  p_expected_at:order[spec.date],
  p_expected_confirmation:order[spec.confirmation],
  p_email:customerEmail
 });
 if(claim.error)return {state:"failed",reason:"atomic_claim_failed"};
 if(!claim.data?.id)return {state:"skipped",reason:"already_claimed_or_changed"};
 const attempt=claim.data;
 try{
  // Re-read immediately before submission. Never format the email from the
  // old cron candidate list, which may be stale after an owner reschedules.
  const {data:current,error}=await s.from("orders")
   .select("id,order_type,status,archived_at,order_number,customer,customer_user_id,survey_date,survey_confirmation_sent_at,survey_reminder_sent_at,job_start_at,job_confirmation_sent_at,job_reminder_sent_at,job_customer_agreement")
   .eq("id",order.id).maybeSingle();
  if(error||!current)return closeWithoutSending(s,attempt.id,"needs_review","preflight_unavailable");
  if(!sameReminderAppointment(current,attempt,kind,targetDate))
   return closeWithoutSending(s,attempt.id,"cancelled","appointment_or_recipient_changed");
  const message=makeEmail(current);
  if(!message||String(message.to||"").trim().toLowerCase()!==attempt.recipient_email)
   return closeWithoutSending(s,attempt.id,"cancelled","recipient_mismatch");

  // This key is immutable per confirmed slot. Even if Resend times out,
  // the attempt remains claimed/needs_review and is never auto-retried.
  const sent=await sendEmail(message,{idempotencyKey:"service-appointment-reminder/"+attempt.id});
  if(sent?.error||!sent?.data?.id)
   return closeWithoutSending(s,attempt.id,"needs_review","provider_status_uncertain");
  const confirmed=await s.rpc("acknowledge_service_appointment_reminder",{
   p_attempt_id:attempt.id,p_resend_email_id:String(sent.data.id)
  });
  if(confirmed.error||!confirmed.data?.accepted_by_provider)
   return {state:"needs_review",reason:"provider_accepted_but_receipt_unconfirmed"};
  if(confirmed.data.marker_recorded!==true)
   return {state:"needs_review",reason:"appointment_changed_during_delivery"};
  return {state:"sent",providerAccepted:true};
 }catch{
  // A thrown timeout is NOT proof that Resend failed to accept the email.
  return closeWithoutSending(s,attempt.id,"needs_review","provider_status_uncertain");
 }
}

// Read-only monitoring of unresolved earlier attempts. Never release or resend.
export async function appointmentReminderBacklog(s,kind,now=Date.now()){
 if(!kinds[kind]||!Number.isFinite(now))return {ok:false};
 const cutoff=new Date(now-10*60*1000).toISOString();
 const [held,stale]=await Promise.all([
  s.from(TABLE).select("id",{count:"exact",head:true}).eq("kind",kind).eq("state","needs_review"),
  s.from(TABLE).select("id",{count:"exact",head:true}).eq("kind",kind).eq("state","claimed").lt("claimed_at",cutoff)
 ]);
 if([held,stale].some(x=>x.error||!Number.isSafeInteger(x.count)||x.count<0))return {ok:false};
 return {ok:true,held:held.count,staleClaims:stale.count,requiresReview:held.count+stale.count};
}
