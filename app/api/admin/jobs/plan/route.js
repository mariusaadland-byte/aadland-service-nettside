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
 return Number.isNaN(d.getTime())?null:d.toISOString();
}
async function loadJob(s,id){
 const {data:order,error}=await s.from("orders")
  .select("id,order_number,order_type,status,customer,customer_user_id,total_ore,job_start_at,job_customer_agreement,job_planning_updated_at,job_confirmation_sent_at,job_reminder_sent_at")
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
  quote:loaded.quote?{
   id:loaded.quote.id,
   quoteNumber:loaded.quote.quote_number,
   title:loaded.quote.title||"Oppdrag",
   earliestStartDate:loaded.quote.planned_start_date||null
  }:null
 }});
}

async function savePlan(s,id,startAt,agreement,currentStartAt=null){
 const start=validDate(startAt);
 if(!start)return {error:"Velg gyldig dato og klokkeslett for oppstart.",status:400};
 if(!agreement)return {error:"Skriv kort hva som er avtalt videre med kunden.",status:400};
 const now=new Date().toISOString();
 const oldStart=currentStartAt?new Date(currentStartAt).toISOString():null;
 const startChanged=oldStart!==start;
 const {data,error}=await s.from("orders").update({
  job_start_at:start,
  job_customer_agreement:agreement,
  job_planning_updated_at:now,
  ...(startChanged?{job_reminder_sent_at:null}:{}),
  updated_at:now
 }).eq("id",id).select("id,order_number,order_type,status,customer,customer_user_id,total_ore,job_start_at,job_customer_agreement,job_planning_updated_at,job_confirmation_sent_at,job_reminder_sent_at").single();
 if(error){
  if(String(error.code||"")==="42703")return {setupRequired:true,error:"Databaseoppdatering mangler for oppdragsplanlegging.",status:409};
  return {error:"Planen kunne ikke lagres.",status:500};
 }
 return {data};
}

export async function PATCH(req){
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
 const saved=await savePlan(s,id,body.startAt,agreement,loaded.order.job_start_at);
 if(saved.error)return NextResponse.json({error:saved.error,setupRequired:saved.setupRequired===true},{status:saved.status||500});
 return NextResponse.json({ok:true,job:{
  startAt:saved.data.job_start_at,
  agreement:saved.data.job_customer_agreement,
  planningUpdatedAt:saved.data.job_planning_updated_at,
  confirmationSentAt:saved.data.job_confirmation_sent_at,
  reminderSentAt:saved.data.job_reminder_sent_at
 }});
}

export async function POST(req){
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

 const saved=await savePlan(s,id,body.startAt,agreement,loaded.order.job_start_at);
 if(saved.error)return NextResponse.json({error:saved.error,setupRequired:saved.setupRequired===true},{status:saved.status||500});

 const email=clean(saved.data.customer?.email,254).toLowerCase();
 if(!email)return NextResponse.json({error:"Planen er lagret, men kunden mangler e-postadresse."},{status:409});

 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"Planen er lagret, men e-post er ikke konfigurert."},{status:503});

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
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const sent=await resend.emails.send({
   from:"Aadland Service <post@aadland-service.no>",
   to:email,
   replyTo:"post@aadland-service.no",
   subject:"Bekreftelse på oppstart – "+title,
   html
  });
  if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
 }catch(err){
  console.error("JOB PLANNING EMAIL ERROR",err);
  return NextResponse.json({error:"Planen er lagret, men bekreftelsen kunne ikke sendes på e-post."},{status:500});
 }

 const sentAt=new Date().toISOString();
 await s.from("orders").update({job_confirmation_sent_at:sentAt,job_reminder_sent_at:null,updated_at:sentAt}).eq("id",id);
 return NextResponse.json({ok:true,sentTo:email,sentAt});
}
