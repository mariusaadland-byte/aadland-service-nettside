import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {invoicePaymentState} from "../../../../../../lib/invoicePaymentStatus";
import {nextInvoiceReminder,reminderDateAfter,reminderText} from "../../../../../../lib/invoiceReminders";
import {isValidDateInput,osloDateKey} from "../../../../../../lib/osloTime";
import {buildInvoiceDraftPdf} from "../../../../../../lib/invoiceDraftPdf";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const error=(message,status=400)=>NextResponse.json({error:message},{status});

export async function GET(req){
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return error("Ingen tilgang.",403);
 const url=new URL(req.url),id=url.searchParams.get("invoiceId"),kind=url.searchParams.get("kind"),dueDate=url.searchParams.get("dueDate");
 if(!uuid(id)||!["purring","inkasso"].includes(kind)||!isValidDateInput(dueDate))return error("Velg en gyldig faktura, varseltype og betalingsfrist.");
 const s=db();if(!s)return error("Database utilgjengelig.",503);
 const [inv,history]=await Promise.all([
  s.from("invoice_drafts").select("*").eq("id",id).maybeSingle(),
  s.from("invoice_reminder_sends").select("id,invoice_id,kind,status,recipient,subject,body,outstanding_ore,due_date,document_date,created_at,sent_at").eq("invoice_id",id).order("created_at",{ascending:false}).limit(100)
 ]);
 if(inv.error||!inv.data)return error("Fakturaen ble ikke funnet.",404);
 if(history.error)return error("Purringshistorikken kunne ikke kontrolleres.",503);
 const invoice=inv.data,today=osloDateKey(new Date()),payment=invoicePaymentState(invoice,today);
 if(!["issued","sent"].includes(invoice.status)||!invoice.invoice_number||!invoice.pdf_base64)return error("Utsted og lagre original faktura-PDF før forhåndsvisning.",409);
 if(!(payment.outstanding>0)||!invoice.due_date||invoice.due_date>=today)return error("Fakturaen er betalt eller ikke forfalt.",409);
 const next=nextInvoiceReminder(history.data||[],today);
 if(next.done||next.waitUntil&&next.waitUntil>=today)return error("Neste varsel er ikke klart til sending.",409);
 if(next.kind!==kind)return error("Varseltypen er endret. Oppdater fakturaen.",409);
 const pending=next.pending;
 if(pending&&(
  pending.due_date!==dueDate||
  Number(pending.outstanding_ore)!==payment.outstanding||
  !pending.subject||!pending.body
 ))return error("Tidligere sendeforsøk eller restbeløp har endret seg. Kontroller historikken.",409);
 if(!pending&&dueDate<reminderDateAfter(today))return error("Betalingsfristen må være minst 14 dager fra sending.",409);
 const content=pending?{subject:pending.subject,body:pending.body}:reminderText(invoice,kind,dueDate,payment.outstanding);
 try{
  const pdf=await buildInvoiceDraftPdf({...invoice,previewDocument:true,notice:{
   kind,body:content.body,due_date:dueDate,document_date:pending?.document_date||today,
   outstanding_ore:payment.outstanding
  }});
  return new NextResponse(new Uint8Array(pdf),{headers:{
   "Content-Type":"application/pdf",
   "Content-Disposition":'inline; filename="FORHANDSVISNING-'+(kind==="inkasso"?"Inkassovarsel":"Purring")+'.pdf"',
   "Cache-Control":"private, no-store",
   "X-Robots-Tag":"noindex, nofollow, noarchive",
   "X-Content-Type-Options":"nosniff",
   "X-Frame-Options":"SAMEORIGIN",
   "Content-Security-Policy":"base-uri 'none'; frame-ancestors 'self'; object-src 'none'"
  }});
 }catch(e){
  console.error("INVOICE REMINDER PDF PREVIEW FAILED",e?.message);
  return error("Forhåndsvisningen kunne ikke genereres.",500);
 }
}
