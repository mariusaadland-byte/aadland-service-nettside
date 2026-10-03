import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {db} from "../../../../lib/supabase";

export const runtime="nodejs";

const MAX_PDF_BYTES=10*1024*1024;

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function clean(value,max=1000){return String(value??"").trim().slice(0,max)}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function money(ore){return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100)}
function dateNo(value){
 if(!value)return "—";
 const d=new Date(value+"T12:00:00");
 return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("nb-NO");
}
async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 if(user.role==="owner"||await hasPermission("canUpdateOrders"))return user;
 return null;
}
function map(row){
 return {
  id:row.id,
  reminderNumber:Number(row.reminder_number),
  invoiceNumber:row.invoice_number,
  customerName:row.customer_name,
  customerEmail:row.customer_email,
  amountOre:Number(row.amount_ore)||0,
  originalDueDate:row.original_due_date||null,
  reminderDueDate:row.reminder_due_date||null,
  subject:row.subject||"",
  message:row.message||"",
  attachmentFilename:row.attachment_filename||"",
  status:row.status||"draft",
  sentAt:row.sent_at||null,
  errorMessage:row.error_message||"",
  createdAt:row.created_at
 };
}

export async function GET(){
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from("payment_reminders").select("*").order("created_at",{ascending:false}).limit(100);
 if(error){
  if(["42P01","42703"].includes(String(error.code||"")))return NextResponse.json({reminders:[],setupRequired:true});
  console.error("PAYMENT REMINDERS GET",error);
  return NextResponse.json({error:"Purringene kunne ikke hentes."},{status:500});
 }
 return NextResponse.json({reminders:(data||[]).map(map)});
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 let form;
 try{form=await req.formData()}catch{return NextResponse.json({error:"Ugyldig skjema."},{status:400})}

 const invoiceNumber=clean(form.get("invoiceNumber"),120);
 const customerName=clean(form.get("customerName"),160);
 const customerEmail=clean(form.get("customerEmail"),254).toLowerCase();
 const amountOre=Math.round(Number(String(form.get("amount")||"").replace(",","."))*100);
 const originalDueDate=clean(form.get("originalDueDate"),10)||null;
 const reminderDueDate=clean(form.get("reminderDueDate"),10);
 const extraNote=clean(form.get("extraNote"),2000);
 const file=form.get("invoicePdf");

 if(!invoiceNumber)return NextResponse.json({error:"Fakturanummer mangler."},{status:400});
 if(!customerName)return NextResponse.json({error:"Kundenavn mangler."},{status:400});
 if(!validEmail(customerEmail))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
 if(!Number.isFinite(amountOre)||amountOre<=0)return NextResponse.json({error:"Beløpet må være høyere enn 0 kr."},{status:400});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reminderDueDate))return NextResponse.json({error:"Velg ny betalingsfrist."},{status:400});
 if(originalDueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(originalDueDate))return NextResponse.json({error:"Opprinnelig forfallsdato er ugyldig."},{status:400});
 if(!(file instanceof File)||file.size<=0)return NextResponse.json({error:"Legg ved original faktura som PDF."},{status:400});
 const filename=clean(file.name||"faktura.pdf",180);
 if(file.type!=="application/pdf"&&!filename.toLowerCase().endsWith(".pdf"))return NextResponse.json({error:"Vedlegget må være en PDF."},{status:400});
 if(file.size>MAX_PDF_BYTES)return NextResponse.json({error:"PDF-en kan være maks 10 MB."},{status:400});

 const subject="Betalingspåminnelse – faktura "+invoiceNumber;
 const message=[
  "Hei "+customerName+",",
  "",
  "Vi viser til faktura "+invoiceNumber+" på "+money(amountOre)+(originalDueDate?", med opprinnelig forfall "+dateNo(originalDueDate):"")+".",
  "Vi kan ikke se at betaling er registrert.",
  "",
  "Ny betalingsfrist: "+dateNo(reminderDueDate)+".",
  "",
  "Kopi av original faktura er vedlagt.",
  extraNote?extraNote:"",
  "",
  "Dersom fakturaen allerede er betalt, kan du se bort fra denne meldingen.",
  "",
  "Vennlig hilsen",
  "Aadland Service"
 ].filter((line,index,array)=>line!==""||array[index-1]!=="").join("\n");

 const {data:record,error:insertError}=await s.from("payment_reminders").insert({
  invoice_number:invoiceNumber,
  customer_name:customerName,
  customer_email:customerEmail,
  amount_ore:amountOre,
  original_due_date:originalDueDate,
  reminder_due_date:reminderDueDate,
  subject,
  message,
  attachment_filename:filename,
  status:"draft",
  sent_by:user.id
 }).select("*").single();

 if(insertError){
  console.error("PAYMENT REMINDER INSERT",insertError);
  if(["42P01","42703"].includes(String(insertError.code||"")))return NextResponse.json({error:"Databaseoppdatering mangler for purring.",setupRequired:true},{status:409});
  return NextResponse.json({error:"Purringen kunne ikke opprettes."},{status:500});
 }

 const reminderNumber=Number(record.reminder_number);
 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d"><div style="font-size:18px;font-weight:900;letter-spacing:.13em;color:#fff">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">BETALINGSPÅMINNELSE · NR. ${esc(reminderNumber)}</div></td></tr>
<tr><td style="padding:30px">
<h1 style="font-size:27px;line-height:1.15;margin:0 0 14px;color:#fff">Betalingspåminnelse</h1>
<p style="margin:0 0 18px;color:#c9c3b8;line-height:1.65">Hei ${esc(customerName)}. Vi viser til faktura <b style="color:#fff">${esc(invoiceNumber)}</b>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px">Purringsnummer</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right">${esc(reminderNumber)}</td></tr>
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Faktura</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(invoiceNumber)}</td></tr>
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Beløp</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(money(amountOre))}</td></tr>
${originalDueDate?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Opprinnelig forfall</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(dateNo(originalDueDate))}</td></tr>`:""}
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Ny betalingsfrist</td><td style="padding:12px 14px;color:#fff;font-weight:800;text-align:right;border-top:1px solid #2d2d2d">${esc(dateNo(reminderDueDate))}</td></tr>
</table>
<p style="margin:20px 0 0;color:#c9c3b8;line-height:1.65">Vi kan ikke se at betalingen er registrert. Kopi av original faktura er vedlagt.</p>
${extraNote?`<div style="margin-top:16px;padding:14px;background:#101010;border:1px solid #2d2d2d;color:#fff;line-height:1.6">${esc(extraNote).replace(/\n/g,"<br>")}</div>`:""}
<p style="margin:18px 0 0;color:#8e887f;font-size:12px;line-height:1.6">Dersom fakturaen allerede er betalt, kan du se bort fra denne meldingen.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · Org.nr. 937 781 873 MVA · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 try{
  const resendKey=process.env.VERCEL_ENV==="preview"
   ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
   :process.env.RESEND_API_KEY;
  if(!resendKey)throw new Error("RESEND_API_KEY mangler.");
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const content=Buffer.from(await file.arrayBuffer()).toString("base64");
  const sent=await resend.emails.send({
   from:"Aadland Service <post@aadland-service.no>",
   to:customerEmail,
   replyTo:"post@aadland-service.no",
   subject,
   html,
   attachments:[{filename,content}]
  });
  if(sent?.error)throw new Error(sent.error.message||"E-postfeil");

  const sentAt=new Date().toISOString();
  const {error:updateError}=await s.from("payment_reminders").update({status:"sent",sent_at:sentAt,error_message:null,updated_at:sentAt}).eq("id",record.id);
  if(updateError)console.error("PAYMENT REMINDER SENT STAMP",updateError);

  return NextResponse.json({ok:true,reminder:{...map(record),status:"sent",sentAt}});
 }catch(error){
  console.error("PAYMENT REMINDER SEND",error);
  const now=new Date().toISOString();
  await s.from("payment_reminders").update({status:"failed",error_message:clean(error?.message||"Kunne ikke sende.",500),updated_at:now}).eq("id",record.id);
  return NextResponse.json({error:"Purringen ble opprettet som nr. "+reminderNumber+", men e-posten kunne ikke sendes.",reminderNumber,statusSaved:true},{status:500});
 }
}
