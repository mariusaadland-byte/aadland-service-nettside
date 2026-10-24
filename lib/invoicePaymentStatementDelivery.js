import "server-only";
import {buildInvoicePaymentStatementPdf} from "./invoicePaymentStatementPdf";

const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""));
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(n)/100);

export async function saveInvoicePaymentStatementPdf(s,row){
 if(!row?.id||!row.snapshot?.invoiceNumber)throw Error("Betalingsoversikten har ikke gyldige opplysninger.");
 if(row.pdf_base64)return {statement:row,pdfBase64:row.pdf_base64};
 const candidate=(await buildInvoicePaymentStatementPdf(row.snapshot)).toString("base64");
 const {error}=await s.from("invoice_payment_statements").update({pdf_base64:candidate})
  .eq("id",row.id).eq("invoice_id",row.invoice_id).is("pdf_base64",null);
 if(error)throw Error("PDF-en kunne ikke lagres. Åpne oversikten på nytt.");
 const fresh=await s.from("invoice_payment_statements").select("*").eq("id",row.id)
  .eq("invoice_id",row.invoice_id).single();
 if(fresh.error||!fresh.data?.pdf_base64)throw Error("Lagret betalingsoversikt kunne ikke hentes.");
 return {statement:fresh.data,pdfBase64:fresh.data.pdf_base64};
}

export async function sendInvoicePaymentStatement(s,params){
 if(process.env.VERCEL_ENV==="preview")throw Error("E-post kan bare sendes fra produksjonssiden.");
 if(!process.env.RESEND_API_KEY)throw Error("E-post er ikke konfigurert.");
 const created=await s.rpc("issue_invoice_payment_statement",{
  p_invoice_id:params.invoiceId,p_expected_paid_ore:params.expectedPaidOre,
  p_expected_credited_ore:params.expectedCreditedOre,
  p_expected_outstanding_ore:params.expectedOutstandingOre
 });
 if(created.error||!created.data)throw Error(created.error?.message||"Betalingsoversikten kunne ikke opprettes.");
 let {statement,pdfBase64}=await saveInvoicePaymentStatementPdf(s,created.data);
 const customerEmail=String(statement.snapshot.customer?.email||"").trim();
 if(!validEmail(customerEmail))throw Error("Fakturakunden har ikke gyldig e-postadresse.");
 if(customerEmail.toLowerCase()!==String(params.expectedEmail||"").trim().toLowerCase())
  throw Error("Kundens e-postadresse er endret. Oppdater fakturaen før du sender.");
 if(statement.sent_at)return {sent:true,alreadySent:true,to:customerEmail,documentId:statement.id};
 const first=statement.first_send_at&&Date.parse(statement.first_send_at);
 if(first&&(!Number.isFinite(first)||Date.now()-first>23*3600000))
  throw Error("Tidligere e-postforsøk må kontrolleres i sendeloggen før ny sending.");
 if(!first){
  const mark=await s.from("invoice_payment_statements")
   .update({first_send_at:new Date().toISOString(),delivery_error:null})
   .eq("invoice_id",params.invoiceId).eq("id",statement.id).is("first_send_at",null);
  if(mark.error)throw Error("Sendeforsøket kunne ikke registreres.");
  const refreshed=await s.from("invoice_payment_statements").select("*")
   .eq("id",statement.id).eq("invoice_id",params.invoiceId).single();
  if(refreshed.error||!refreshed.data?.first_send_at)
   throw Error("Sendestatus kunne ikke kontrolleres.");
  statement=refreshed.data;
  if(statement.sent_at)return {sent:true,alreadySent:true,to:customerEmail,documentId:statement.id};
 }
 const data=statement.snapshot;
 const lines=[
  "Hei "+String(data.customer?.name||"kunde")+"!","",
  "Her kommer en samlet oversikt over registrerte betalinger for faktura "+data.invoiceNumber+".",
  "Oversikt per "+data.asOfDate+".",
  "Opprinnelig fakturabeløp: "+money(data.grossOre)+".",
  ...(Number(data.creditedOre)>0?["Kreditert beløp: "+money(data.creditedOre)+"."]:[]),
  "Netto registrert innbetalt: "+money(data.paidOre)+".",
  ...(Number(data.outstandingOre)>0?
    ["Gjenstående beløp per oversiktsdato: "+money(data.outstandingOre)+"."]:
    ["Fakturaen er fullt oppgjort."]),
  "",
  "Detaljer om alle registrerte innbetalinger, kreditnotaer og eventuelle Vipps-refusjoner ligger i vedlagt PDF.",
  "Dette er en betalingsoversikt, ikke en ny faktura eller et nytt betalingskrav.",
  "Hvis du har betalt etter datoen i oversikten, vil betalingen vises i neste oppdaterte oversikt.",
  "",
  "Med vennlig hilsen","Aadland Service","post@aadland-service.no","471 54 898"
 ];
 const {Resend}=await import("resend");
 try{
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   to:customerEmail,replyTo:"post@aadland-service.no",
   subject:"Betalingsoversikt – faktura "+data.invoiceNumber+" – Aadland Service",
   text:lines.join("\n"),
   attachments:[{
    filename:"Betalingsoversikt-"+data.invoiceNumber+"-"+data.asOfDate+".pdf",
    content:pdfBase64,contentType:"application/pdf"
   }]
  },{idempotencyKey:"invoice-payment-statement/"+statement.id});
  if(result.error||!result.data?.id)
   throw Error(result.error?.message||"E-posttjenesten kunne ikke bekrefte sending.");
  const saved=await s.from("invoice_payment_statements")
   .update({sent_at:new Date().toISOString(),resend_id:result.data.id,delivery_error:null})
   .eq("invoice_id",params.invoiceId).eq("id",statement.id).is("sent_at",null);
  if(saved.error)throw Error("E-posten kan være sendt, men sendestatus kunne ikke lagres. Kontroller sendeloggen.");
  return {sent:true,to:customerEmail,documentId:statement.id};
 }catch(e){
  try{
   await s.from("invoice_payment_statements").update({
    delivery_error:String(e.message||"Ukjent feil").slice(0,250)
   }).eq("invoice_id",params.invoiceId).eq("id",statement.id).is("sent_at",null);
  }catch{}
  throw e;
 }
}
