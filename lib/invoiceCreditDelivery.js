import "server-only";
import {freezeInvoiceCreditPdf} from "./invoiceCreditNotes";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(n)/100);
const emailValid=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""));

export async function sendInvoiceCreditNote(s,original){
 if(process.env.VERCEL_ENV==="preview")throw Error("Kreditnota sendes bare fra produksjonssiden.");
 if(!process.env.RESEND_API_KEY)throw Error("E-post er ikke konfigurert.");
 let note=await freezeInvoiceCreditPdf(s,original);
 if(note.sent_at)return {sent:true,alreadySent:true,sentTo:note.customer?.email};
 const recipient=String(note.customer?.email||"").trim();
 if(!emailValid(recipient))throw Error("Kreditnotaens kunde mangler gyldig e-postadresse.");
 const first=note.first_send_at&&new Date(note.first_send_at).getTime();
 if(first&&(!Number.isFinite(first)||Date.now()-first>23*3600000))
  throw Error("Tidligere sendeforsøk må kontrolleres i e-postloggen før ny sending etter 23 timer.");
 if(!first){
  const mark=await s.from("invoice_credit_notes")
   .update({first_send_at:new Date().toISOString()}).eq("id",note.id).is("first_send_at",null);
  if(mark.error)throw Error("Kreditnotaens sendeforsøk kunne ikke registreres.");
  const fresh=await s.from("invoice_credit_notes").select("*").eq("id",note.id).single();
  if(fresh.error||!fresh.data?.first_send_at)throw Error("Sendelogg kunne ikke hentes.");
  note=fresh.data;
 }
 const to=String(note.customer?.email||"").trim();
 if(!emailValid(to)||to.toLowerCase()!==recipient.toLowerCase())
  throw Error("Kundens adresse ble endret etter bekreftelsen.");
 const {Resend}=await import("resend");
 const subject="Kreditnota "+note.credit_number+" til faktura "+note.original_invoice_number+" – Aadland Service";
 const text=[
  "Hei "+String(note.customer?.name||"kunde")+"!","",
  "Vedlagt følger kreditnota "+note.credit_number+" som korrigerer faktura "+note.original_invoice_number+".",
  "Kreditert beløp inkl. MVA: "+money(note.total_ore)+".",
  "Årsak: "+note.reason,"",
  "Kreditnotaen reduserer fakturabeløpet. Eventuell tilbakebetaling via Vipps håndteres separat.",
  "Dette er ikke et nytt betalingskrav.","",
  "Med vennlig hilsen","Aadland Service","post@aadland-service.no","471 54 898"
 ].join("\n");
 try{
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   replyTo:"post@aadland-service.no",to,subject,text,
   attachments:[{filename:note.credit_number+".pdf",content:note.pdf_base64,contentType:"application/pdf"}]
  },{idempotencyKey:"invoice-credit-note/"+note.id});
  if(result.error||!result.data?.id)throw Error(result.error?.message||"E-posttjenesten kunne ikke bekrefte sending.");
  const updated=await s.from("invoice_credit_notes").update({
   sent_at:new Date().toISOString(),resend_id:result.data.id,delivery_error:null
  }).eq("id",note.id).is("sent_at",null);
  if(updated.error)throw Error("E-posten ble sendt, men sendestatus kunne ikke lagres. Kontroller loggen før nytt forsøk.");
  return {sent:true,sentTo:to};
 }catch(error){
  await s.from("invoice_credit_notes").update({delivery_error:String(error.message||"Ukjent feil").slice(0,250)})
   .eq("id",note.id).is("sent_at",null);
  throw error;
 }
}
