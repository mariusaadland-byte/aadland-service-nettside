import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {buildInvoiceDraftPdf} from "../../../../../lib/invoiceDraftPdf";
export const runtime="nodejs";
export const maxDuration=60;
const fail=(error,status=400)=>NextResponse.json({error},{status});
const total=lines=>(lines||[]).reduce((sum,l)=>{const net=Math.round(Number(l.quantity)*Number(l.unitPriceOre));return sum+net+Math.round(net*Number(l.vatRate)/100)},0);
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return fail("Ingen tilgang.",403);
 if(process.env.VERCEL_ENV==="preview")return fail("Fakturaer sendes fra produksjonssiden.",403);
 const key=process.env.RESEND_API_KEY;if(!key)return fail("E-post er ikke konfigurert.",503);
 const {id}=await req.json().catch(()=>({}));if(typeof id!=="string")return fail("Velg en faktura.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 let {data:invoice,error}=await s.from("invoice_drafts").select("*").eq("id",id).maybeSingle();
 if(error||!invoice)return fail("Fakturaen ble ikke funnet.",404);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.customer?.email||""))return fail("Fyll inn en gyldig e-postadresse før e-postsending.");
 if(invoice.sent_at)return NextResponse.json({ok:true,alreadySent:true,invoiceNumber:invoice.invoice_number,sentTo:invoice.customer.email});
 if(invoice.status==="draft"){
  const result=await s.rpc("issue_invoice_draft",{p_id:id,p_expected_updated_at:invoice.updated_at});
  if(result.error)return fail(result.error.message);
  invoice=result.data;
 }
 try{
  if(!invoice.pdf_base64){
   const pdf=await buildInvoiceDraftPdf(invoice);
   const stored=await s.from("invoice_drafts").update({pdf_base64:pdf.toString("base64")}).eq("id",id).is("pdf_base64",null);
   if(stored.error)throw Error("Faktura-PDF kunne ikke lagres.");
  }
  // Freeze and reuse the exact PDF and recipient for every retry.
  const fresh=await s.from("invoice_drafts").select("*").eq("id",id).single();
  if(fresh.error||!fresh.data?.pdf_base64)throw Error("PDF-kopien kunne ikke hentes.");
  invoice=fresh.data;
  if(invoice.sent_at)return NextResponse.json({ok:true,alreadySent:true,invoiceNumber:invoice.invoice_number,sentTo:invoice.customer.email});
  if(!invoice.first_send_at){
   const claim=await s.from("invoice_drafts").update({first_send_at:new Date().toISOString()}).eq("id",id).is("first_send_at",null);
   if(claim.error)throw Error("Sendestatus kunne ikke lagres.");
  }
  const attempt=await s.from("invoice_drafts").select("first_send_at,sent_at").eq("id",id).single();
  if(attempt.error||!attempt.data?.first_send_at)throw Error("Sendestatus kunne ikke kontrolleres.");
  if(attempt.data.sent_at)return NextResponse.json({ok:true,alreadySent:true,invoiceNumber:invoice.invoice_number,sentTo:invoice.customer.email});
  if(Date.now()-new Date(attempt.data.first_send_at).getTime()>23*60*60*1000)throw Error("Forrige sendeforsøk må kontrolleres i e-postloggen før nytt forsøk.");
  const amount=new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(total(invoice.line_items)/100);
  const text=["Hei "+invoice.customer.name+"!","","Vedlagt finner du faktura "+invoice.invoice_number+" for "+invoice.title+".","Beløp inkl. mva.: "+amount,"Forfallsdato: "+invoice.due_date,"Kontonummer: 8450 46 22699","Merk betalingen med fakturanummer "+invoice.invoice_number+".","","Ta gjerne kontakt hvis du har spørsmål.","","Med vennlig hilsen","Aadland Service","Telefon: 471 54 898","E-post: post@aadland-service.no","Org.nr.: 937 781 873 MVA"].join("\n");
  const {Resend}=await import("resend");
  const resend=new Resend(key);
  const result=await resend.emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",to:invoice.customer.email,replyTo:"post@aadland-service.no",
   subject:"Faktura "+invoice.invoice_number+" – Aadland Service",text,
   attachments:[{filename:"Aadland-Service-Faktura-"+invoice.invoice_number+".pdf",content:invoice.pdf_base64}]
  },{idempotencyKey:"invoice-send/"+id});
  if(result.error||!result.data?.id)throw Error("E-posttjenesten kunne ikke bekrefte sendingen. Prøv igjen.");
  const saved=await s.from("invoice_drafts").update({status:"sent",sent_at:new Date().toISOString(),resend_id:result.data.id,delivery_error:null}).eq("id",id);
  if(saved.error)return fail("E-posten er sendt, men sendestatus kunne ikke lagres. Prøv samme knapp igjen; fakturanummer og sending gjenbrukes.",500);
  return NextResponse.json({ok:true,invoiceNumber:invoice.invoice_number,sentTo:invoice.customer.email});
 }catch(err){
  console.error("INVOICE EMAIL",{id,message:err?.message});
  const message=String(err?.message||"Ukjent e-postfeil").slice(0,250);
  await s.from("invoice_drafts").update({delivery_error:message}).eq("id",id);
  return fail("Faktura "+invoice.invoice_number+" er utstedt og lagret, men sending er ikke bekreftet. "+message,502);
 }
}
