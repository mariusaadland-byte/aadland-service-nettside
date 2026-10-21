import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {invoicePaymentState} from "../../../../../lib/invoicePaymentStatus";
import {buildInvoiceDraftPdf} from "../../../../../lib/invoiceDraftPdf";
import {reminderText} from "../../../../../lib/invoiceReminders";
import {isValidDateInput} from "../../../../../lib/osloTime";
import {osloDateKey} from "../../../../../lib/osloTime";
export const runtime="nodejs";
export const maxDuration=60;
const allowed=user=>user&&(user.role==="owner"||user.canUpdateOrders||user.canManageProducts);
const fail=(error,status=400)=>NextResponse.json({error},{status});
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function GET(req){
 if(!allowed(await getAdminUser()))return fail("Ingen tilgang.",403);
 const id=new URL(req.url).searchParams.get("invoiceId");if(!uuid(id))return fail("Velg en faktura.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const documentId=new URL(req.url).searchParams.get("documentId");
 if(documentId){
  if(!uuid(documentId))return fail("Ugyldig dokument.");
  const {data,error}=await s.from("invoice_reminder_sends").select("kind,pdf_base64").eq("id",documentId).eq("invoice_id",id).maybeSingle();
  if(error||!data?.pdf_base64)return fail("Dokumentet ble ikke funnet.",404);
  return new NextResponse(Buffer.from(data.pdf_base64,"base64"),{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="'+(data.kind==="inkasso"?"Inkassovarsel":"Purring")+'-'+documentId+'.pdf"',"Cache-Control":"private, no-store"}});
 }
 const {data,error}=await s.from("invoice_reminder_sends").select("id,recipient,subject,body,outstanding_ore,kind,due_date,document_date,status,created_at,sent_at,error_message,pdf_base64").eq("invoice_id",id).order("created_at",{ascending:false}).limit(100);
 if(error)return fail("Purringshistorikken kunne ikke hentes.",500);
 return NextResponse.json({reminders:data.map(({pdf_base64,...record})=>({...record,hasPdf:Boolean(pdf_base64)}))});
}
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 if(process.env.VERCEL_ENV==="preview")return fail("Purringer sendes fra produksjonssiden.",403);
 const key=process.env.RESEND_API_KEY;if(!key)return fail("E-post er ikke konfigurert.",503);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.invoiceId)||!uuid(body.requestId)||!["purring","inkasso"].includes(body.kind)||!isValidDateInput(body.dueDate))return fail("Kontroller faktura, varseltype og betalingsfrist.");
 if(!Number.isSafeInteger(body.outstandingOre)||body.outstandingOre<=0)return fail("Fakturaen har ikke et gyldig restbeløp.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const initial=await s.from("invoice_drafts").select("*").eq("id",body.invoiceId).maybeSingle();
 if(initial.error||!initial.data)return fail("Fakturaen ble ikke funnet.",404);
 // Only server-generated standard wording is accepted.
 const existing=await s.from("invoice_reminder_sends").select("*").eq("id",body.requestId).eq("invoice_id",body.invoiceId).maybeSingle();
 if(existing.error)return fail("Tidligere sendeforsøk kunne ikke kontrolleres.",500);
 const wording=existing.data?{subject:existing.data.subject,body:existing.data.body}:reminderText(initial.data,body.kind,body.dueDate,body.outstandingOre);
 const prepared=await s.rpc("prepare_invoice_notice",{p_invoice_id:body.invoiceId,p_request_id:body.requestId,p_subject:wording.subject,p_body:wording.body,p_expected_outstanding:body.outstandingOre,p_admin_id:user.id,p_kind:body.kind,p_due_date:body.dueDate});
 if(prepared.error)return fail(prepared.error.message,409);
 let record=prepared.data;
 if(record.status==="sent")return NextResponse.json({ok:true,alreadySent:true,sentAt:record.sent_at});
 try{
  const {data:invoice,error}=await s.from("invoice_drafts").select("*").eq("id",body.invoiceId).single();
  if(error||!invoice?.pdf_base64)throw Error("Original faktura-PDF kunne ikke hentes.");
  if(invoice.status==="draft"||invoicePaymentState(invoice,osloDateKey(new Date())).outstanding!==Number(record.outstanding_ore))throw Error("Restbeløpet er endret. Oppdater siden og kontroller betalingene.");
  if(!record.pdf_base64){
   const pdf=await buildInvoiceDraftPdf({...invoice,notice:record});
   const savedPdf=await s.from("invoice_reminder_sends").update({pdf_base64:pdf.toString("base64")}).eq("id",record.id).is("pdf_base64",null);
   if(savedPdf.error)throw Error("PDF-en kunne ikke lagres.");
   const fresh=await s.from("invoice_reminder_sends").select("*").eq("id",record.id).single();
   if(fresh.error||!fresh.data?.pdf_base64)throw Error("PDF-en kunne ikke hentes.");
   record=fresh.data;
  }
  const {Resend}=await import("resend");
  const resend=new Resend(key);
  const result=await resend.emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",to:record.recipient,replyTo:"post@aadland-service.no",
   subject:record.subject,text:record.body,
   attachments:[{filename:(record.kind==="inkasso"?"Inkassovarsel":"Purring")+"-"+invoice.invoice_number+".pdf",content:record.pdf_base64},{filename:"Aadland-Service-Faktura-"+invoice.invoice_number+".pdf",content:invoice.pdf_base64}]
  },{idempotencyKey:"invoice-reminder/"+record.id});
  if(result.error||!result.data?.id)throw Error("E-posttjenesten kunne ikke bekrefte sendingen. Prøv samme utsending igjen.");
  const sentAt=new Date().toISOString();
  const saved=await s.from("invoice_reminder_sends").update({status:"sent",sent_at:sentAt,resend_id:result.data.id,error_message:null}).eq("id",record.id);
  if(saved.error)return fail("E-posten er sendt, men historikken kunne ikke oppdateres. Prøv samme utsending igjen.",502);
  return NextResponse.json({ok:true,sentAt,sentTo:record.recipient});
 }catch(error){
  const message=String(error?.message||"Kunne ikke sende purringen.").slice(0,300);
  // A concurrent successful retry must never be overwritten by an earlier failed attempt.
  await s.from("invoice_reminder_sends").update({status:"failed",error_message:message}).eq("id",record.id).neq("status","sent");
  return fail(message,502);
 }
}
