import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {osloDateKey} from "../../../../../lib/osloTime";
import {invoicePaymentState} from "../../../../../lib/invoicePaymentStatus";
import {invoiceSettlementInfo,summarizeInvoiceActivity} from "../../../../../lib/invoiceSettlementInfo";
import {friendlyReminderEligible,friendlyReminderText} from "../../../../../lib/invoiceFriendlyReminder";

export const runtime="nodejs";
export const maxDuration=60;
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const email=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim());
const allowed=user=>user&&(user.role==="owner"||user.canUpdateOrders||user.canManageProducts);
const respond=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(error,status=400)=>respond({error},status);

export async function GET(req){
 if(!allowed(await getAdminUser()))return fail("Ingen tilgang.",403);
 const invoiceId=new URL(req.url).searchParams.get("invoiceId");
 if(!uuid(invoiceId))return fail("Velg en faktura.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const found=await s.from("invoice_friendly_reminders")
  .select("id,recipient,subject,body,outstanding_ore,original_due_date,created_at,first_send_at,sent_at,error_message")
  .eq("invoice_id",invoiceId).order("created_at",{ascending:false}).limit(100);
 if(found.error)return fail("Påminnelseshistorikken kunne ikke hentes.",503);
 return respond({canSend:(await getAdminUser())?.role==="owner",reminders:found.data||[]});
}

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")return fail("Bare eieren kan sende betalingspåminnelser.",403);
 if(process.env.VERCEL_ENV!=="production")return fail("E-post kan bare sendes fra produksjonssiden.",403);
 if(!process.env.RESEND_API_KEY)return fail("E-post er ikke konfigurert.",503);
 const params=await req.json().catch(()=>({}));
 if(!uuid(params.invoiceId)||!uuid(params.requestId)||params.confirmed!==true||
    !Number.isSafeInteger(params.expectedOutstandingOre)||params.expectedOutstandingOre<=0||
    !email(params.expectedEmail))return fail("Oppdater fakturaen og bekreft mottaker og restbeløp.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const found=await s.from("invoice_drafts").select("*").eq("id",params.invoiceId).maybeSingle();
 if(found.error||!found.data)return fail("Fakturaen ble ikke funnet.",404);
 const invoice=found.data,today=osloDateKey(new Date());
 if(!friendlyReminderEligible(invoice,today)||!invoice.pdf_base64)
  return fail("Fakturaen må være utstedt, ha original PDF og et utestående beløp.",409);
 const [vp,cn]=await Promise.all([
  s.from("invoice_vipps_payments").select("invoice_id,state,captured_ore,refunded_ore").eq("invoice_id",invoice.id).limit(500),
  s.from("invoice_credit_notes").select("invoice_id,total_ore,sent_at").eq("invoice_id",invoice.id).limit(500)
 ]);
 if(vp.error||cn.error||vp.data?.length===500||cn.data?.length===500)
  return fail("Betalingshistorikken kunne ikke kontrolleres. Oppdater fakturaen.",503);
 const current=summarizeInvoiceActivity([invoice],vp.data,cn.data)[0];
 const settlement=invoiceSettlementInfo(current,today);
 if(settlement.needsReview)
  return fail("Betalingsstatus eller refusjon må avklares før en påminnelse kan sendes.",409);
 const outstanding=invoicePaymentState(current,today).outstanding;
 if(outstanding!==params.expectedOutstandingOre)return fail("Restbeløpet er endret. Oppdater siden før du sender.",409);
 const recipient=String(invoice.customer?.email||"").trim();
 if(!email(recipient)||recipient.toLowerCase()!==params.expectedEmail.trim().toLowerCase())
  return fail("Kundens e-postadresse er endret. Oppdater fakturaen.",409);
 const query=()=>s.from("invoice_friendly_reminders").select("*").eq("id",params.requestId).eq("invoice_id",invoice.id);
 let previous=await query().maybeSingle();
 if(previous.error)return fail("Tidligere sendeforsøk kunne ikke kontrolleres.",503);
 let record=previous.data;
 if(!record){
  const wording=friendlyReminderText(invoice,outstanding);
  const inserted=await s.from("invoice_friendly_reminders").insert({
   id:params.requestId,invoice_id:invoice.id,recipient,subject:wording.subject,body:wording.body,
   outstanding_ore:outstanding,original_due_date:invoice.due_date,sent_by:user.id
  }).select("*").single();
  if(inserted.error){
   // A concurrent submission of the same request ID may have inserted it first.
   previous=await query().maybeSingle();
   if(previous.error||!previous.data)return fail("Sendeforsøket kunne ikke lagres.",503);
   record=previous.data;
  }else record=inserted.data;
 }
 if(record.sent_at)return respond({ok:true,alreadySent:true,to:record.recipient,sentAt:record.sent_at});
 if(record.recipient.toLowerCase()!==recipient.toLowerCase()||
    Number(record.outstanding_ore)!==outstanding||record.original_due_date!==invoice.due_date)
  return fail("Fakturaen er endret siden sendeforsøket ble opprettet. Kontroller fakturaen før ny sending.",409);
 const first=record.first_send_at?Date.parse(record.first_send_at):null;
 if(record.first_send_at&&(!Number.isFinite(first)||Date.now()-first>=23*60*60*1000))
  return fail("Forrige sendeforsøk er for gammelt. Kontroller e-postloggen før du starter et nytt forsøk.",409);
 if(!record.first_send_at){
  const marked=await s.from("invoice_friendly_reminders")
   .update({first_send_at:new Date().toISOString(),error_message:null})
   .eq("id",record.id).eq("invoice_id",invoice.id).is("first_send_at",null);
  if(marked.error)return fail("Sendeforsøket kunne ikke registreres.",503);
  const refreshed=await query().single();
  if(refreshed.error||!refreshed.data?.first_send_at)return fail("Sendestatus kunne ikke kontrolleres.",503);
  record=refreshed.data;
  if(record.sent_at)return respond({ok:true,alreadySent:true,to:record.recipient,sentAt:record.sent_at});
 }
 try{
  const {Resend}=await import("resend");
  const sent=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   to:record.recipient,replyTo:"post@aadland-service.no",
   subject:record.subject,text:record.body,
   attachments:[{filename:"Aadland-Service-Faktura-"+invoice.invoice_number+".pdf",
    content:invoice.pdf_base64,contentType:"application/pdf"}]
  },{idempotencyKey:"invoice-friendly-reminder/"+record.id});
  if(sent.error||!sent.data?.id)throw Error(sent.error?.message||"E-posttjenesten kunne ikke bekrefte sendingen.");
  const sentAt=new Date().toISOString();
  const saved=await s.from("invoice_friendly_reminders").update({
   sent_at:sentAt,resend_id:sent.data.id,error_message:null
  }).eq("id",record.id).eq("invoice_id",invoice.id).is("sent_at",null);
  if(saved.error)throw Error("E-posten kan være sendt, men sendestatus kunne ikke lagres. Kontroller e-postloggen før nytt forsøk.");
  return respond({ok:true,to:record.recipient,sentAt});
 }catch(err){
  const message=String(err.message||"Utsendingen kunne ikke bekreftes.").slice(0,300);
  await s.from("invoice_friendly_reminders").update({error_message:message})
   .eq("id",record.id).eq("invoice_id",invoice.id).is("sent_at",null);
  return fail(message,502);
 }
}
