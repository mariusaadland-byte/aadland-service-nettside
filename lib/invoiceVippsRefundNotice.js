import "server-only";

// A refund email is a payment confirmation, never a credit note.
// Confirmed refund changes are logged by the database trigger, not by the browser.
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore)/100);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const emailOk=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||""));

function buildRefundEmail({invoice,payment,notice}){
 const amount=money(notice.refunded_delta_ore);
 const cumulative=money(notice.refunded_total_ore);
 const remaining=money(Math.max(0,Number(payment.captured_ore)-Number(notice.refunded_total_ore)));
 const invoiceNumber=String(invoice.invoice_number||"");
 const name=String(invoice.customer?.name||"kunde");
 const subject="Bekreftelse på Vipps-tilbakebetaling – faktura "+invoiceNumber+" – Aadland Service";
 const paragraphs=[
  "Hei "+name+"!","",
  "Vi bekrefter at "+amount+" er refundert via Vipps for faktura "+invoiceNumber+".",
  "Totalt refundert på denne Vipps-betalingen: "+cumulative+".",
  "Netto igjen av den opprinnelige Vipps-betalingen: "+remaining+".",
  "Vipps-referanse: "+payment.reference,"",
  "Dette er en betalingsbekreftelse, ikke en kreditnota eller et nytt betalingskrav.",
  "Dersom fakturabeløpet skal endres, utstedes eventuell kreditnota som eget dokument.",
  "Har du spørsmål, kan du svare på denne e-posten.",
  "Aadland Service · post@aadland-service.no · 471 54 898"
 ];
 const safe=[amount,cumulative,remaining,invoiceNumber,name,payment.reference].map(escapeHtml);
 const html='<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#211e19">'+
  '<div style="background:#191816;color:white;padding:22px"><strong>AADLAND SERVICE</strong><div>VIPPS – TILBAKEBETALING</div></div>'+
  '<div style="padding:24px;border:1px solid #e4ddcf"><h2>Tilbakebetaling bekreftet</h2>'+
  '<p>Hei '+safe[4]+'!</p><p>Vi har refundert et beløp for faktura <strong>'+safe[3]+'</strong>.</p>'+
  '<div style="background:#f6f2ea;padding:18px"><div>REFUNDERT NÅ</div><strong style="font-size:26px">'+safe[0]+'</strong>'+
  '<p>Totalt refundert på Vipps-betalingen: '+safe[1]+'</p><p>Netto igjen av Vipps-betalingen: '+safe[2]+'</p></div>'+
  '<p>Vipps-referanse: '+safe[5]+'</p>'+
  '<p>Dette er kun bekreftelse på tilbakebetalingen, ikke en kreditnota eller et nytt betalingskrav.</p>'+
  '<p>Eventuell kreditnota utstedes som eget dokument hvis fakturabeløpet skal reduseres.</p>'+
  '<p>Spørsmål? Svar på e-posten.</p></div></div>';
 return {subject,text:paragraphs.join("\n"),html};
}
async function updateNotice(s,id,values){
 const {error}=await s.from("invoice_vipps_refund_notices").update(values).eq("id",id);
 if(error)throw new Error("Sendestatus for Vipps-refusjonen kunne ikke lagres.");
}
export async function sendInvoiceVippsRefundNoticeIfNeeded({s,paymentId=null}){
 const claimed=await s.rpc("claim_invoice_vipps_refund_notice",{p_payment_id:paymentId});
 if(claimed.error)throw Error("Køen for refusjonsbekreftelser kunne ikke kontrolleres.");
 const notice=claimed.data;
 if(!notice?.id)return {sent:false,reason:"nothing-pending"};
 try{
  const [invoiceResult,paymentResult]=await Promise.all([
   s.from("invoice_drafts").select("id,invoice_number,customer").eq("id",notice.invoice_id).single(),
   s.from("invoice_vipps_payments").select("id,invoice_id,reference,captured_ore,refunded_ore").eq("id",notice.payment_id).single()
  ]);
  if(invoiceResult.error||paymentResult.error||!invoiceResult.data||!paymentResult.data)
   throw Error("Faktura eller Vipps-betaling ble ikke funnet.");
  const invoice=invoiceResult.data,payment=paymentResult.data;
  if(payment.invoice_id!==invoice.id||Number(payment.refunded_ore)<Number(notice.refunded_total_ore)||
     Number(notice.refunded_delta_ore)<=0)
   throw Error("Tilbakebetalingen er ennå ikke bekreftet i fakturasystemet.");
  const recipient=String(invoice.customer?.email||"").trim();
  if(!emailOk(recipient))throw Error("Kunden mangler gyldig e-postadresse.");
  if(process.env.VERCEL_ENV==="preview")throw Error("E-post sendes bare fra produksjon.");
  if(!process.env.RESEND_API_KEY)throw Error("E-post er ikke konfigurert.");
  const {Resend}=await import("resend");
  const email=buildRefundEmail({invoice,payment,notice});
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",to:recipient,
   replyTo:"post@aadland-service.no",...email
  },{idempotencyKey:"invoice-vipps-refund/"+notice.id});
  if(result.error||!result.data?.id)throw Error(result.error?.message||"Utsendingen ble ikke bekreftet.");
  await updateNotice(s,notice.id,{status:"sent",sent_at:new Date().toISOString(),resend_id:result.data.id,error_message:null});
  return {sent:true,recipient,amountOre:Number(notice.refunded_delta_ore)};
 }catch(e){
  // Retry with the SAME Resend idempotency key. Do not create another notice.
  // After 23 hours, automatic retries stop pending a manual email-log check.
  try{await updateNotice(s,notice.id,{status:"failed",error_message:String(e.message||"Ukjent feil").slice(0,250)})}
  catch(recordError){console.error("INVOICE VIPPS REFUND NOTICE STATE ERROR",{message:recordError.message});}
  throw e;
 }
}
