import "server-only";
import {buildInvoiceDraftPdf} from "./invoiceDraftPdf";

export async function freezeManualInvoiceReceipt(s,invoiceId,paymentId){
 const frozen=await s.rpc("freeze_invoice_manual_receipt_snapshot",{
  p_invoice_id:invoiceId,p_payment_id:paymentId
 });
 if(frozen.error||!frozen.data)
  throw Error(frozen.error?.message||"Kvitteringsgrunnlaget kunne ikke lagres.");
 const details=frozen.data;
 if(details.paymentId!==paymentId||!details.invoiceNumber||
    !Number.isSafeInteger(Number(details.paymentAmountOre))||Number(details.paymentAmountOre)<=0)
  throw Error("Kvitteringen mangler gyldig betalingsgrunnlag.");
 const get=()=>s.from("invoice_payments").select("id,invoice_id,amount_ore,reversed_at,vipps_reference,receipt_pdf_base64,receipt_first_send_at,receipt_sent_at,receipt_resend_id,receipt_delivery_error,receipt_payload")
  .eq("invoice_id",invoiceId).eq("id",paymentId).maybeSingle();
 let row=await get();
 if(row.error||!row.data||row.data.reversed_at||row.data.vipps_reference)
  throw Error("Betalingen er angret, mangler eller er registrert via Vipps.");
 if(row.data.receipt_pdf_base64)return {payment:row.data,pdfBase64:row.data.receipt_pdf_base64,details};
 const buffer=await buildInvoiceDraftPdf({
  invoice_number:details.invoiceNumber,
  issued_date:details.invoiceDate,due_date:details.dueDate,
  title:details.title,customer:details.customer,line_items:details.lineItems,
  notes:details.invoiceNotes,paid_ore:Number(details.paymentAmountOre)+Number(details.otherPaymentsOre||0),
  paymentReceipt:{
   method:"manual",amountOre:Number(details.paymentAmountOre),
   otherPaymentsOre:Number(details.otherPaymentsOre||0),
   outstandingOre:Number(details.outstandingOre||0),
   paidOn:details.paidOn,paidAt:details.paidOn,
   receiptCreatedOn:details.receiptCreatedOn,reference:details.paymentId
  }
 });
 const candidate=buffer.toString("base64");
 const write=await s.from("invoice_payments").update({receipt_pdf_base64:candidate})
  .eq("id",paymentId).eq("invoice_id",invoiceId).is("reversed_at",null).is("receipt_pdf_base64",null);
 if(write.error)throw Error("Kvitteringens PDF kunne ikke lagres.");
 row=await get();
 if(row.error||!row.data||row.data.reversed_at||!row.data.receipt_pdf_base64)
  throw Error("Kvitteringsdokumentet kunne ikke hentes eller betalingen er angret.");
 return {payment:row.data,pdfBase64:row.data.receipt_pdf_base64,details};
}

const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""));
const kr=v=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(v)/100);
export async function sendManualInvoiceReceipt(s,invoiceId,paymentId){
 if(process.env.VERCEL_ENV==="preview")
  throw Error("Ekte kundekvitteringer kan bare sendes fra produksjon.");
 if(!process.env.RESEND_API_KEY)throw Error("E-postutsending er ikke konfigurert.");
 const result=await freezeManualInvoiceReceipt(s,invoiceId,paymentId);
 const {payment,details,pdfBase64}=result;
 const email=String(details.customer?.email||"").trim();
 if(!emailOk(email))throw Error("Kundens e-postadresse mangler eller er ugyldig.");
 if(payment.receipt_sent_at)return {sent:true,alreadySent:true,email};
 let firstAt=payment.receipt_first_send_at;
 if(firstAt&&(!Number.isFinite(Date.parse(firstAt))||Date.now()-Date.parse(firstAt)>23*3600000))
  throw Error("Tidligere sendeforsøk er for gammelt. Kontroller e-postloggen før ny utsending.");
 if(!firstAt){
  const update=await s.from("invoice_payments")
   .update({receipt_first_send_at:new Date().toISOString(),receipt_delivery_error:null})
   .eq("id",paymentId).eq("invoice_id",invoiceId).is("reversed_at",null).is("receipt_first_send_at",null);
  if(update.error)throw Error("Kvitteringens sendestatus kunne ikke lagres.");
  const refreshed=await freezeManualInvoiceReceipt(s,invoiceId,paymentId);
  if(refreshed.payment.receipt_sent_at)return {sent:true,alreadySent:true,email};
  firstAt=refreshed.payment.receipt_first_send_at;
  if(!firstAt)throw Error("E-postens sendeforsøk kunne ikke bekreftes.");
 }
 const outstanding=Number(details.outstandingOre||0);
 const amount=kr(details.paymentAmountOre);
 const subject=(outstanding>0?"Kvittering for delbetaling – ":"Kvittering – faktura ")+
  details.invoiceNumber+" – Aadland Service";
 const lines=[
  "Hei "+String(details.customer?.name||"kunde")+"!","",
  "Vi bekrefter mottatt manuell betaling på "+amount+" for faktura "+details.invoiceNumber+".",
  "Betalingsdato: "+details.paidOn+".",
  outstanding>0?"Gjenstående beløp per kvitteringsdato "+details.receiptCreatedOn+": "+kr(outstanding)+".":"Fakturaen er fullt oppgjort.",
  "Vedlagt finner du kvitteringen som PDF.","",
  "Dette er en kvittering, ikke et nytt betalingskrav.",
  "Aadland Service","post@aadland-service.no","471 54 898"
 ];
 const {Resend}=await import("resend");
 try{
  const mailed=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   replyTo:"post@aadland-service.no",to:email,subject,text:lines.join("\n"),
   attachments:[{filename:"Kvittering-"+details.invoiceNumber+"-"+paymentId.slice(0,8)+".pdf",
    content:pdfBase64,contentType:"application/pdf"}]
  },{idempotencyKey:"invoice-manual-receipt/"+paymentId});
  if(mailed.error||!mailed.data?.id)
   throw Error(mailed.error?.message||"E-posttjenesten kunne ikke bekrefte utsendingen.");
  const recorded=await s.from("invoice_payments").update({
   receipt_sent_at:new Date().toISOString(),receipt_resend_id:mailed.data.id,receipt_delivery_error:null
  }).eq("invoice_id",invoiceId).eq("id",paymentId).is("receipt_sent_at",null);
  if(recorded.error)throw Error("Kvitteringen kan være sendt, men sendestatus kunne ikke lagres. Kontroller loggen før ny utsending.");
  return {sent:true,email};
 }catch(e){
  try{
   await s.from("invoice_payments").update({receipt_delivery_error:String(e.message||"Ukjent feil").slice(0,250)})
    .eq("invoice_id",invoiceId).eq("id",paymentId).is("receipt_sent_at",null);
  }catch{}
  throw e;
 }
}
