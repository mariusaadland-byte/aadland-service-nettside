import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

function clean(value,max=8000){
 return String(value??"").trim().slice(0,max);
}
function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return user.role==="owner"||user.canUpdateOrders?user:null;
}
function validDate(value){
 const input=String(value||"").trim();
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input))return null;
 const d=new Date(input);
 if(Number.isNaN(d.getTime()))return null;
 const iso=d.toISOString();
 return iso.slice(0,19)===input.slice(0,19)?iso:null;
}
async function loadJob(s,id){
 const {data:order,error}=await s.from("orders")
  .select("id,order_number,order_type,status,customer,customer_user_id,total_ore,job_start_at,job_customer_agreement,job_planning_updated_at,job_confirmation_sent_at,job_reminder_sent_at,job_plan_revision,archived_at")
  .eq("id",id).maybeSingle();
 if(error){
  if(String(error.code||"")==="42703")return {setupRequired:true,error:"Databaseoppdatering mangler for oppdragsplanlegging."};
  return {error:"Oppdraget kunne ikke hentes."};
 }
 if(!order)return {error:"Oppdraget ble ikke funnet.",status:404};
 if(order.order_type!=="custom")return {error:"Denne siden gjelder bare oppdrag.",status:400};
 const {data:quote}=await s.from("quotes")
  .select("id,quote_number,title,planned_start_date")
  .eq("converted_order_id",order.id).maybeSingle();
 return {order,quote:quote||null};
}

export async function GET(req){
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=clean(new URL(req.url).searchParams.get("id"),100);
 if(!id)return NextResponse.json({error:"Oppdrag mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const loaded=await loadJob(s,id);
 if(loaded.setupRequired)return NextResponse.json({error:loaded.error,setupRequired:true},{status:409});
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status||500});
 const o=loaded.order;
 const delivery=await jobDelivery(s,id,o.job_plan_revision,o.job_confirmation_sent_at);
 if(delivery.error)return NextResponse.json({error:"Bekreftelsesloggen kunne ikke leses."},{status:503});
 return NextResponse.json({job:{
  id:o.id,
  orderNumber:o.order_number,
  status:o.status,
  customer:o.customer||{},
  totalOre:Number(o.total_ore)||0,
  startAt:o.job_start_at||null,
  agreement:o.job_customer_agreement||"",
  planningUpdatedAt:o.job_planning_updated_at||null,
  confirmationSentAt:o.job_confirmation_sent_at||null,
  reminderSentAt:o.job_reminder_sent_at||null,
  planRevision:o.job_plan_revision||null,
  delivery:delivery.status,
  quote:loaded.quote?{
   id:loaded.quote.id,
   quoteNumber:loaded.quote.quote_number,
   title:loaded.quote.title||"Oppdrag",
   earliestStartDate:loaded.quote.planned_start_date||null
  }:null
 },canReview:user.role==="owner"});
}

async function jobDelivery(s,id,revision,previousSentAt){
 const {data,error}=await s.from("job_plan_confirmation_attempts")
  .select("id,plan_revision,state,recipient_email,claimed_at,sent_at,provider_email_id,issue")
  .eq("order_id",id).order("claimed_at",{ascending:false}).limit(40);
 if(error)return {error:true};
 const attempts=data||[];
 const unresolved=attempts.find(a=>["sending","needs_review"].includes(a.state));
 const current=attempts.find(a=>a.plan_revision===revision);
 return {status:{
  state:current?.state||(previousSentAt?"legacy_sent":"not_sent"),
  attemptId:current?.id||null,
  claimedAt:current?.claimed_at||null,
  sentAt:current?.sent_at||previousSentAt||null,
  providerId:current?.provider_email_id||null,
  issue:current?.issue||null,
  unresolved:unresolved?{
   id:unresolved.id,state:unresolved.state,claimedAt:unresolved.claimed_at,
   email:unresolved.recipient_email,issue:unresolved.issue
  }:null
 }};
}

async function savePlan(s,id,startAt,agreement,expectedRevision,existingOrder){
 const start=validDate(startAt);
 if(!start)return {error:"Velg gyldig dato og klokkeslett for oppstart.",status:400};
 if(!agreement)return {error:"Skriv kort hva som er avtalt videre med kunden.",status:400};
 const {data,error}=await s.rpc("save_job_plan_once",{
  p_order_id:id,p_start_at:start,p_agreement:agreement,
  p_expected_revision:expectedRevision||null
 });
 if(error){
  const message=String(error.message||"");
  if(/S27_STALE_PLAN/.test(message))
   return {error:"Planen ble endret i en annen fane. Last den inn på nytt før du lagrer.",status:409};
  if(/S27_JOB_NOT_ELIGIBLE/.test(message))
   return {error:"Oppdraget er ikke lenger aktivt og bekreftet.",status:409};
  if(/42883|PGRST202|42P01|42703/.test(String(error.code||"")))
   return {error:"Databaseoppdatering mangler for sikker oppdragsbekreftelse.",status:409,setupRequired:true};
  return {error:"Planen kunne ikke lagres. Ingen e-post er sendt.",status:503};
 }
 return {changed:Boolean(data?.changed),revision:data?.revision,
  data:{...existingOrder,job_start_at:data?.start_at,
   job_customer_agreement:data?.agreement,
   job_plan_revision:data?.revision,job_confirmation_sent_at:data?.confirmation_sent_at,
   job_reminder_sent_at:data?.reminder_sent_at}};
}

async function holdAttempt(s,attemptId,issue,cancel=false){
 const {data,error}=await s.rpc("hold_job_plan_confirmation",{
  p_attempt_id:attemptId,p_issue:issue,p_cancel:cancel
 });
 if(error||!data?.held)console.error("S27 CONFIRMATION HOLD UNCONFIRMED",{issue});
}

export async function PATCH(req){const originError=sameOriginGuard(req);if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=clean(body.id,100);
 if(!id)return NextResponse.json({error:"Oppdrag mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 if(body.action==="review"){
  if(user.role!=="owner")return NextResponse.json({error:"Bare eieren kan avklare uvisse sendeforsøk."},{status:403});
  const note=clean(body.note,1200);
  const outcome=body.outcome;
  const phrase=outcome==="sent"?"BEKREFTET I RESEND":outcome==="unsent"?"IKKE SENDT":null;
  const providerId=clean(body.providerId,240);
  if(!phrase||body.confirmation!==phrase||note.length<12||
    outcome==="sent"&&providerId.length<8)
   return NextResponse.json({error:"Kontroller Resend og fyll inn bekreftelsestekst, merknad og eventuell meldings-ID."},{status:400});
  const attemptId=clean(body.attemptId,100);
  const {data:belongs,error:lookupError}=await s.from("job_plan_confirmation_attempts")
   .select("id").eq("id",attemptId).eq("order_id",id).maybeSingle();
  if(lookupError||!belongs)return NextResponse.json({
   error:"Sendeforsøket tilhører ikke dette oppdraget."},{status:404});
  const {data,error}=await s.rpc("review_job_plan_confirmation",{
   p_attempt_id:attemptId,p_reviewer_id:user.id,
   p_result:outcome,p_note:note,p_provider_email_id:outcome==="sent"?providerId:null
  });
  if(error)return NextResponse.json({error:"Sendeforsøket kan ikke avklares ennå. Vent minst fem minutter og kontroller Resend-loggen."},{status:409});
  return NextResponse.json({ok:true,reviewed:data?.reviewed===true,state:data?.state});
 }
 const agreement=clean(body.agreement,8000);
 const loaded=await loadJob(s,id);
 if(loaded.setupRequired)return NextResponse.json({error:loaded.error,setupRequired:true},{status:409});
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status||500});
 const saved=await savePlan(s,id,body.startAt,agreement,body.expectedRevision,loaded.order);
 if(saved.error)return NextResponse.json({error:saved.error,setupRequired:saved.setupRequired===true},{status:saved.status||500});
 const delivery=await jobDelivery(s,id,saved.revision,saved.data.job_confirmation_sent_at);
 if(delivery.error)return NextResponse.json({error:"Planen ble lagret, men sendestatus kunne ikke hentes."},{status:503});
 return NextResponse.json({ok:true,job:{
  startAt:saved.data.job_start_at,agreement:saved.data.job_customer_agreement,
  planningUpdatedAt:saved.changed?new Date().toISOString():loaded.order.job_planning_updated_at,
  confirmationSentAt:saved.data.job_confirmation_sent_at,
  reminderSentAt:saved.data.job_reminder_sent_at,
  planRevision:saved.revision,delivery:delivery.status
 }});
}

export async function POST(req){ const originError=sameOriginGuard(req); if(originError)return originError;
 // Never send real customer email from a Vercel preview using a fallback key.
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({
  error:"Bekreftelser kan bare sendes fra produksjon, ikke fra testmiljø."},{status:403});
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=clean(body.id,100);
 const agreement=clean(body.agreement,8000);
 if(!id)return NextResponse.json({error:"Oppdrag mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const loaded=await loadJob(s,id);
 if(loaded.setupRequired)return NextResponse.json({error:loaded.error,setupRequired:true},{status:409});
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status||500});

 const saved=await savePlan(s,id,body.startAt,agreement,body.expectedRevision,loaded.order);
 if(saved.error)return NextResponse.json({error:saved.error,setupRequired:saved.setupRequired===true},{status:saved.status||500});

 const email=clean(saved.data.customer?.email,254).toLowerCase();
 if(!email)return NextResponse.json({error:"Planen er lagret, men kunden mangler e-postadresse."},{status:409});

 const resendKey=process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"Planen er lagret, men e-post er ikke konfigurert."},{status:503});

 const {data:attempt,error:claimError}=await s.rpc("claim_job_plan_confirmation",{
  p_order_id:id,p_revision:saved.revision,p_expected_email:email
 });
 if(claimError)return NextResponse.json({error:"Sendekontrollen var utilgjengelig. Planen er lagret, men ingen e-post er sendt."},{status:503});
 if(!attempt?.id)return NextResponse.json({error:"Bekreftelsen er allerede forsøkt, sendt eller trenger kontroll. Oppdater planen og se sendestatus før ny utsending."},{status:409});
 // Preflight prevents an old plan from being sent when another operator
 // changes the schedule after the one-time claim but before provider delivery.
 const preflight=await loadJob(s,id);
 if(preflight.error){
  await holdAttempt(s,attempt.id,"preflight_unavailable");
  return NextResponse.json({error:"Planen kunne ikke kontrolleres på nytt. Utsending er sperret for sikkerhets skyld."},{status:409});
 }
 const now=preflight.order;
 if(now.job_plan_revision!==saved.revision||
  Number(new Date(now.job_start_at))!==Number(new Date(saved.data.job_start_at))||
  clean(now.job_customer_agreement,8000)!==agreement||
  clean(now.customer?.email,254).toLowerCase()!==email||
  now.status!=="confirmed"||now.archived_at){
  await holdAttempt(s,attempt.id,"plan_or_recipient_changed",true);
  return NextResponse.json({error:"Planen ble endret før sending. Ingen e-post ble sendt; last inn gjeldende plan."},{status:409});
 }
 const title=loaded.quote?.title||"Oppdrag";
 const startText=new Date(saved.data.job_start_at).toLocaleString("nb-NO",{
  dateStyle:"long",timeStyle:"short",timeZone:"Europe/Oslo"
 });
 const customerName=clean(saved.data.customer?.name,180)||"kunde";
 const quoteNo=loaded.quote?.quote_number||"";
 const requestOrigin=new URL(req.url).origin;
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
 const accountUrl=saved.data.customer_user_id?base+"/min-side":"";
 const html=`<!doctype html><html><body style="margin:0;background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #ded7cb">
 <tr><td style="padding:28px 30px;background:#11100e;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">BEKREFTELSE PÅ OPPDRAG</div></td></tr>
 <tr><td style="padding:30px">
  <div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">OPPDRAG ${esc(saved.data.order_number)}</div>
  <h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px">${esc(title)}</h1>
  <p style="color:#625d55;line-height:1.65">Hei ${esc(customerName)}. Her er bekreftelsen på det vi har avtalt videre.</p>
  <div style="margin:22px 0;padding:18px;background:#f7f3ec"><div style="font-size:11px;color:#777;text-transform:uppercase;font-weight:800">Avtalt oppstart</div><div style="margin-top:5px;font-size:22px;font-weight:900">${esc(startText)}</div></div>
  <div style="margin:22px 0"><div style="font-size:11px;color:#777;text-transform:uppercase;font-weight:800;margin-bottom:7px">Avtalt videre</div><div style="white-space:pre-line;line-height:1.65">${esc(agreement)}</div></div>
  ${quoteNo?`<p style="color:#777;font-size:12px">Tilhører tilbud ${esc(quoteNo)}.</p>`:""}
  ${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:10px;background:#d9b365;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
  <p style="margin:24px 0 0;color:#625d55;line-height:1.65">Ta kontakt dersom noe i avtalen må justeres. Du kan svare direkte på denne e-posten.</p>
 </td></tr>
 <tr><td style="padding:18px 30px;border-top:1px solid #ece7df;color:#777;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
 </table></td></tr></table></body></html>`;

 try{
  const {Resend}=await import("../../../../../lib/safeResend");
  const resend=new Resend(resendKey);
  const sent=await resend.emails.send({
   from:"Aadland Service <post@aadland-service.no>",
   to:email,
   replyTo:"post@aadland-service.no",
   subject:"Bekreftelse på oppstart – "+title,
   html
  },{idempotencyKey:"job-plan-confirmation/"+attempt.id});
  if(sent?.error||!sent?.data?.id)throw new Error("provider_status_uncertain");
  const ack=await s.rpc("ack_job_plan_confirmation",{
   p_attempt_id:attempt.id,p_provider_email_id:String(sent.data.id)
  });
  if(ack.error||!ack.data?.provider_accepted||!ack.data.marker_recorded)
   return NextResponse.json({error:"Resend tok imot bekreftelsen, men sendestatus må kontrolleres. Ikke send på nytt.",emailAccepted:true},{status:409});
 }catch(err){
  // A timeout or transport error does NOT prove the email was never accepted.
  await holdAttempt(s,attempt.id,"provider_status_uncertain");
  return NextResponse.json({error:"Uavklart sendestatus. Kontroller Resend før noe nytt forsøk. Planen er lagret.",needsReview:true},{status:409});
 }
 return NextResponse.json({ok:true,sentTo:email,sentAt:new Date().toISOString(),planRevision:saved.revision});
}
