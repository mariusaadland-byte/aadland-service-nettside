import "server-only";
import {createVippsPayment,getVippsPayment,captureVippsPayment} from "./vippsClient";
import {vippsUnitReadiness} from "./vippsReadiness";
import {buildInvoiceDraftPdf} from "./invoiceDraftPdf";
import {invoiceTotalOre,invoiceVippsConfirmationSnapshot} from "./invoicePaymentStatus";

const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export const invoiceVippsReference=value=>/^INV-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(value||""));
const origin=()=>"https://www.aadland-service.no";
const emailValid=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||""));

async function mail(payload,key){
 if(process.env.VERCEL_ENV==="preview")throw Error("E-post sendes bare fra produksjon.");
 if(!process.env.RESEND_API_KEY)throw Error("E-post er ikke konfigurert.");
 const {Resend}=await import("resend");
 const r=await new Resend(process.env.RESEND_API_KEY).emails.send({from:"Aadland Service <noreply@aadland-service.no>",replyTo:"post@aadland-service.no",...payload},{idempotencyKey:key});
 if(r.error||!r.data?.id)throw Error("E-postsendingen kunne ikke bekreftes.");
 return r.data.id;
}
async function row(s,reference){
 const r=await s.from("invoice_vipps_payments").select("*").eq("reference",reference).single();
 if(r.error)throw Error("Vipps-betalingen kunne ikke hentes.");return r.data;
}
async function invoiceRow(s,id){
 const r=await s.from("invoice_drafts").select("*").eq("id",id).single();
 if(r.error)throw Error("Fakturaen kunne ikke hentes.");return r.data;
}
async function freezeInvoice(s,invoice){
 if(!invoice.pdf_base64){
  const pdf=await buildInvoiceDraftPdf(invoice);
  const r=await s.from("invoice_drafts").update({pdf_base64:pdf.toString("base64")}).eq("id",invoice.id).is("pdf_base64",null);
  if(r.error)throw Error("Faktura-PDF kunne ikke lagres.");
 }
 return invoiceRow(s,invoice.id);
}
function validateSnapshot(payment,p){
 if(payment?.reference!==p.reference||payment?.amount?.currency!=="NOK"||payment?.amount?.value!==Number(p.amount_ore))throw Error("Vipps-betalingen har feil referanse eller beløp.");
 const aggregate=payment.aggregate||{};
 const value=key=>{
  const amount=aggregate[key];if(!amount)return 0;
  if(amount.currency!=="NOK"||!Number.isSafeInteger(amount.value)||amount.value<0)throw Error("Ugyldig Vipps-beløp.");
  return amount.value;
 };
 const a={captured:value("capturedAmount"),refunded:value("refundedAmount"),authorized:value("authorizedAmount"),cancelled:value("cancelledAmount")};
 if(Object.values(a).some(n=>n>Number(p.amount_ore))||a.refunded>a.captured||a.captured+a.cancelled>a.authorized)throw Error("Ugyldige Vipps-summer.");
 return a;
}
export async function reconcileInvoiceVipps(s,reference){
 if(process.env.VERCEL_ENV==="preview")throw Error("Betaling behandles bare fra produksjon.");
 let p=await row(s,reference);
 let payment=await getVippsPayment("service",reference);
 let a=validateSnapshot(payment,p);
 // This flow is explicitly chosen for a completed job paid immediately.
 if(payment.state==="AUTHORIZED"&&a.authorized-a.cancelled-a.captured>0){
  await captureVippsPayment("service",reference,a.authorized-a.cancelled-a.captured,{idempotencyKey:"cap-"+p.id});
  payment=await getVippsPayment("service",reference);a=validateSnapshot(payment,p);
 }
 const synced=await s.rpc("sync_invoice_vipps",{p_reference:reference,p_state:String(payment.state||""),p_captured:a.captured,p_refunded:a.refunded});
 if(synced.error)throw Error("Vipps-status kunne ikke registreres.");p=synced.data;
 let receiptError="";
 if(Number(p.captured_ore)>0&&Number(p.refunded_ore)===0&&!p.receipt_sent_at){
  try{p=await sendInvoiceVippsReceipt(s,p);}catch(e){
   receiptError=String(e.message||"Kvitteringen kunne ikke sendes.").slice(0,250);
   await s.from("invoice_vipps_payments").update({receipt_error:receiptError}).eq("id",p.id);
  }
 }
 return {...p,receipt_error:receiptError||p.receipt_error};
}
async function sendInvoiceVippsReceipt(s,p){
 const invoice=await invoiceRow(s,p.invoice_id);
 if(!emailValid(invoice.customer?.email))throw Error("Kunden mangler gyldig e-postadresse.");
 if(!p.receipt_payload){
  const receipt=await buildInvoiceDraftPdf({...invoice,paymentReceipt:{amountOre:Number(p.captured_ore),paidAt:p.captured_at,reference:p.reference,outstandingOre:Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore))}});
  const payload={to:invoice.customer.email,subject:"Kvittering for faktura "+invoice.invoice_number+" – Aadland Service",text:["Hei "+invoice.customer.name+"!","","Vi har mottatt "+money(Number(p.captured_ore))+" med Vipps for faktura "+invoice.invoice_number+".","Vedlagt følger kvittering og den opprinnelige fakturaen.","Betalingsreferanse: "+p.reference,"Gjenstående på fakturaen: "+money(Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore))),"","Takk for oppdraget!","Aadland Service · 471 54 898 · post@aadland-service.no"].join("\n"),attachments:[{filename:"Kvittering-"+invoice.invoice_number+".pdf",content:receipt.toString("base64")},{filename:"Faktura-"+invoice.invoice_number+".pdf",content:invoice.pdf_base64}]};
  const frozen=await s.from("invoice_vipps_payments").update({receipt_payload:payload,receipt_first_at:new Date().toISOString()}).eq("id",p.id).is("receipt_payload",null);
  if(frozen.error)throw Error("Kvitteringen kunne ikke lagres.");p=await row(s,p.reference);
 }
 if(p.receipt_sent_at)return p;
 if(Date.now()-new Date(p.receipt_first_at).getTime()>23*3600000)throw Error("Kontroller kvitteringens e-postlogg før nytt sendeforsøk etter 23 timer.");
 await mail(p.receipt_payload,"invoice-vipps-receipt/"+p.id);
 const stamp=await s.from("invoice_vipps_payments").update({receipt_sent_at:new Date().toISOString(),receipt_error:null}).eq("id",p.id);
 if(stamp.error)throw Error("Kvitteringen er sendt, men sendestatus kunne ikke lagres.");
 return row(s,p.reference);
}
function verifyVippsConfirmation(invoice,expected){
 if(!expected||typeof expected!=="object"||Array.isArray(expected))throw Error("Bekreft faktura, kunde og beløp på nytt før Vipps-betaling.");
 const current=invoiceVippsConfirmationSnapshot(invoice);
 if(JSON.stringify(current)!==JSON.stringify(expected))throw Error("Fakturaen, kundedata eller registrert betaling har endret seg etter bekreftelsen. Last inn fakturaen på nytt, kontroller beløpet og bekreft Vipps-betaling igjen.");
 if(!Number.isSafeInteger(current.totalOre)||!Number.isSafeInteger(current.paidOre)||current.totalOre-current.paidOre<100)throw Error("Fakturaen er betalt eller beløpet er ugyldig. Last inn fakturaen på nytt.");
}
export async function startInvoiceVipps(s,invoice,confirmation){
 if(process.env.VERCEL_ENV==="preview")throw Error("Vipps-betaling startes fra produksjonssiden.");
 verifyVippsConfirmation(invoice,confirmation);
 const readiness=await vippsUnitReadiness(s,"service");
 if(!readiness.ready)throw Error("Vipps for Aadland Service må aktiveres og kobles til før du kan ta betalt.");
 if(!emailValid(invoice.customer?.email))throw Error("Legg inn kundens e-postadresse, slik at kunden får betalingslenke og kvittering.");
 if(!process.env.RESEND_API_KEY)throw Error("E-post er ikke konfigurert.");
 if(invoice.status==="draft"){
  const issued=await s.rpc("issue_invoice_draft",{p_id:invoice.id,p_expected_updated_at:invoice.updated_at});
  if(issued.error)throw Error(issued.error.message);invoice=issued.data;
 }
 invoice=await freezeInvoice(s,invoice);
 // Before offering another link, reconcile the most recent attempt with Vipps.
 // A callback can arrive late; trust the provider's capture/refund totals instead
 // of relying on a possibly stale invoice paid_ore field.
 const previous=await s.from("invoice_vipps_payments").select("reference").eq("invoice_id",invoice.id)
  .order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(previous.error)throw Error("Forrige Vipps-betaling kunne ikke kontrolleres. Prøv samme knapp igjen.");
 if(previous.data?.reference){
  await reconcileInvoiceVipps(s,previous.data.reference);
  invoice=await invoiceRow(s,invoice.id);
 }
 // A webhook or a concurrent admin action can change the amount even after the
 // first check. Recheck before creating/reusing a payment reference.
 verifyVippsConfirmation(invoice,confirmation);
 const prepared=await s.rpc("prepare_invoice_vipps",{p_invoice_id:invoice.id});
 if(prepared.error)throw Error(prepared.error.message);
 let p=prepared.data,payment;
 try{payment=await getVippsPayment("service",p.reference);}catch(e){if(Number(e.status)!==404)throw Error("Kunne ikke kontrollere Vipps-forsøket. Prøv samme knapp igjen.");}
 if(!payment){
  payment=await createVippsPayment({unit:"service",reference:p.reference,amountOre:Number(p.amount_ore),returnUrl:origin()+"/betaling/faktura?reference="+p.reference,description:"Faktura "+invoice.invoice_number,idempotencyKey:p.id});
 }
 if(payment.state&&payment.state!=="CREATED")return reconcileInvoiceVipps(s,p.reference);
 const redirectUrl=String(payment.redirectUrl||p.redirect_url||"");
 if(!/^https:\/\//.test(redirectUrl))throw Error("Vipps-lenken kunne ikke hentes. Prøv samme knapp igjen.");
 const saved=await s.from("invoice_vipps_payments").update({redirect_url:redirectUrl}).eq("id",p.id);
 if(saved.error)throw Error("Vipps-lenken kunne ikke lagres.");
 p=await row(s,p.reference);
 let emailError="",requestEmailId=null;
 if(!p.request_email_sent_at){
  try{
   if(!p.request_email_first_at){await s.from("invoice_vipps_payments").update({request_email_first_at:new Date().toISOString()}).eq("id",p.id).is("request_email_first_at",null);p=await row(s,p.reference);}
   if(!p.request_email_first_at||Date.now()-new Date(p.request_email_first_at).getTime()>23*3600000)throw Error("Kontroller forrige betalingslenke i e-postloggen før ny sending.");
   requestEmailId=await mail({to:invoice.customer.email,subject:"Betal faktura "+invoice.invoice_number+" med Vipps",text:["Hei "+invoice.customer.name+"!","","Du kan betale "+money(Number(p.amount_ore))+" for faktura "+invoice.invoice_number+" med Vipps her:",redirectUrl,"","Du får kvittering automatisk etter bekreftet betaling. Ikke betal samme faktura en gang til i banken.","","Aadland Service · post@aadland-service.no · 471 54 898"].join("\n"),attachments:[{filename:"Faktura-"+invoice.invoice_number+".pdf",content:invoice.pdf_base64}]},"invoice-vipps-request/"+p.id);
   const stamp=await s.from("invoice_vipps_payments").update({request_email_sent_at:new Date().toISOString()}).eq("id",p.id);if(stamp.error)throw Error("E-posten er sendt, men status kunne ikke lagres. Bruk samme knapp igjen.");
  }catch(e){emailError=String(e.message||"Betalingslenken kunne ikke sendes.");}
 }
 p=await row(s,p.reference);
 if(p.request_email_sent_at&&!invoice.sent_at){
  const stamp=await s.from("invoice_drafts").update({status:"sent",sent_at:p.request_email_sent_at,...(requestEmailId?{resend_id:requestEmailId}:{}),delivery_error:null}).eq("id",invoice.id).is("sent_at",null);
  if(stamp.error)emailError="Betalingslenken er sendt, men fakturaens sendestatus kunne ikke lagres. Prøv samme knapp igjen.";
 }
 return {...p,emailError};
}
export function invoiceVippsView(p){
 if(!p)return null;
 return {reference:p.reference,state:p.state,amountOre:Number(p.amount_ore),capturedOre:Math.max(0,Number(p.captured_ore)||0),refundedOre:Math.max(0,Number(p.refunded_ore)||0),redirectUrl:p.redirect_url||"",receiptSentAt:p.receipt_sent_at||null,receiptError:p.receipt_error||"",emailSentAt:p.request_email_sent_at||null,emailError:p.emailError||""};
}
