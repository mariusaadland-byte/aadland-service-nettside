import "server-only";
import {createVippsPayment,getVippsPayment,captureVippsPayment,vippsPublicPaymentsEnabled} from "./vippsClient";
import {vippsUnitReadiness} from "./vippsReadiness";
import {buildInvoiceDraftPdf} from "./invoiceDraftPdf";
import {invoiceTotalOre,invoiceVippsConfirmationSnapshot} from "./invoicePaymentStatus";

const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const escapeEmailHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[ch]);
function receiptEmailHtml(invoice,p,outstandingOre,isPartial){
 const name=escapeEmailHtml(invoice.customer?.name||"kunde");
 const invoiceNumber=escapeEmailHtml(invoice.invoice_number||"");
 const paymentReference=escapeEmailHtml(p.reference||"");
 const received=escapeEmailHtml(money(Number(p.captured_ore)));
 const balance=escapeEmailHtml(money(outstandingOre));
 const heading=isPartial?"Delbetaling registrert":"Fakturaen er betalt";
 const message=isPartial?"Dette er en delbetaling. Det gjenstår et beløp på fakturaen.":"Fakturaen er registrert som fullt betalt.";
 return [
  '<div style="font-family:Arial,Helvetica,sans-serif;color:#211e19;max-width:600px;margin:0 auto;font-size:15px;line-height:1.5">',
  '<div style="background:#191816;color:#fff;padding:24px"><strong style="font-size:20px">AADLAND SERVICE</strong><div style="color:#e4c88c;margin-top:5px">VIPPS-KVITTERING</div></div>',
  '<div style="padding:24px;border:1px solid #e4ddcf;border-top:0">',
  '<h1 style="font-size:22px;margin:0 0 14px">'+heading+'</h1>',
  '<p>Hei '+name+'!</p>',
  '<p>Vi har mottatt betalingen med Vipps for faktura <strong>'+invoiceNumber+'</strong>.</p>',
  '<div style="background:#f6f2ea;border-left:4px solid #c49b53;padding:16px 20px">',
  '<div style="font-size:13px">MOTTATT MED VIPPS</div>',
  '<div style="font-size:27px;font-weight:700">'+received+'</div>',
  ...(isPartial?['<div style="margin-top:10px">Gjenstår på fakturaen: <strong>'+balance+'</strong></div>']:[]),
  '</div>',
  '<p>'+message+'</p>',
  '<p>Vedlagt ligger <strong>kvitteringen</strong> og den <strong>opprinnelige fakturaen</strong> som PDF-filer.</p>',
  '<p style="font-size:12px;color:#5b554b;overflow-wrap:anywhere">Betalingsreferanse: '+paymentReference+'</p>',
  '<p style="font-size:12px;color:#5b554b">Dette er en kvittering for mottatt betaling – ikke et nytt betalingskrav.</p>',
  '<p style="font-size:12px;color:#5b554b;margin-bottom:0">Aadland Service · post@aadland-service.no · 471 54 898</p>',
  '</div></div>'
 ].join("");
}
export const invoiceVippsReference=value=>/^INV-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(value||""));
const origin=()=>"https://www.aadland-service.no";
const shortPaymentUrl=reference=>origin()+"/betaling/faktura/start?reference="+encodeURIComponent(reference);
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
 // Vipps terminal states EXPIRED/ABORTED/TERMINATED may report released or
 // cancelled sums without a prior authorization. These are NOT chargeable:
 // they must never contain captured or refunded funds. Requiring cancelled <=
 // authorized for such states trapped an expired 1-kr test request as pending.
 if(Object.values(a).some(n=>n>Number(p.amount_ore))||a.refunded>a.captured)
  throw Error("Ugyldige Vipps-summer.");
 const state=String(payment.state||"");
 if(!["CREATED","AUTHORIZED","EXPIRED","ABORTED","TERMINATED"].includes(state))
  throw Error("Ukjent Vipps-betalingsstatus.");
 if(state==="AUTHORIZED"){
  if(a.captured+a.cancelled>a.authorized)throw Error("Ugyldige Vipps-summer.");
 }else if(a.captured!==0||a.refunded!==0){
  // A terminal no-authorization payment must never be booked as paid.
  throw Error("Ugyldige Vipps-summer.");
 }
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
  const outstandingOre=Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore||0));
  const isPartial=outstandingOre>0;
  const payload={
   to:invoice.customer.email,
   subject:(isPartial?"Kvittering for delbetaling av faktura ":"Kvittering for faktura ")+invoice.invoice_number+" – Aadland Service",
   text:[
    "Hei "+invoice.customer.name+"!","",
    "Vi har mottatt "+money(Number(p.captured_ore))+" med Vipps for faktura "+invoice.invoice_number+".",
    isPartial?"Dette er en delbetaling. Fakturaen har fortsatt et utestående beløp.":"Fakturaen er nå registrert som fullt betalt.",
    "Vedlagt følger kvittering og den opprinnelige fakturaen.",
    "Betalingsreferanse: "+p.reference,
    ...(isPartial?["Gjenstående på fakturaen: "+money(outstandingOre)]:[]),"",
    "Dette er kun en kvittering for mottatt betaling, ikke et nytt betalingskrav.",
    isPartial?"Takk for delbetalingen!":"Takk for oppdraget!",
    "Aadland Service · 471 54 898 · post@aadland-service.no"
   ].join("\n"),
   html:receiptEmailHtml(invoice,p,outstandingOre,isPartial),
   attachments:[
    {filename:"Kvittering-"+invoice.invoice_number+".pdf",content:receipt.toString("base64"),contentType:"application/pdf"},
    {filename:"Faktura-"+invoice.invoice_number+".pdf",content:invoice.pdf_base64,contentType:"application/pdf"}
   ]
  };
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
function verifyInvoicePilot(invoice){
 // The admin pilot does not authorize arbitrary customer invoices.
 // It must be exactly 1 kr, to the server-configured owner test inbox,
 // while customer checkout is disabled. Never hardcode or expose credentials.
 if(vippsPublicPaymentsEnabled("service"))return;
 const testRecipient=String(process.env.VIPPS_SERVICE_PILOT_EMAIL||"").trim().toLowerCase();
 const actualRecipient=String(invoice?.customer?.email||"").trim().toLowerCase();
 const rest=invoiceTotalOre(invoice)-Number(invoice?.paid_ore||0);
 if(!testRecipient||actualRecipient!==testRecipient||rest!==100){
  throw Error("Kun pilotbetaling på nøyaktig 1,00 kr til registrert testadresse er tillatt mens kundebetaling er AV. Andre fakturaer kan ikke sendes med Vipps.");
 }
}
function verifyPushRequest(opts){
 const method=opts?.deliveryMethod||"email_link";
 if(!["email_link","vipps_push"].includes(method))throw Error("Ugyldig betalingsmåte.");
 if(method==="email_link")return {method,phone:null};
 if(process.env.VIPPS_SERVICE_PUSH_ENABLED!=="true")
  throw Error("Vipps-varsel krever egen godkjenning hos Vipps. Bruk betalingslenke på e-post inntil dette er aktivert.");
 if(opts.customerPresent!==true||opts.customerConsent!==true)
  throw Error("Bekreft at kunden er til stede og har samtykket til Vipps-varsel.");
 const value=String(opts.phone||"").replace(/[\s()+-]/g,"");
 const phone=/^[0-9]{8}$/.test(value)?"47"+value:value;
 if(!/^47[0-9]{8}$/.test(phone))throw Error("Skriv inn et gyldig norsk mobilnummer.");
 return {method,phone};
}
export async function startInvoiceVipps(s,invoice,confirmation,opts={}){
 if(process.env.VERCEL_ENV==="preview")throw Error("Vipps-betaling startes fra produksjonssiden.");
 const channel=verifyPushRequest(opts);
 verifyVippsConfirmation(invoice,confirmation);
 verifyInvoicePilot(invoice);
 const readiness=await vippsUnitReadiness(s,"service",{audience:"admin"});
 if(!readiness.ready)throw Error("Vipps for Aadland Service må aktiveres og kobles til før du kan ta betalt.");
 if(!emailValid(invoice.customer?.email))throw Error("Legg inn kundens e-postadresse, slik at kunden får betalingslenke og kvittering.");
 if(!process.env.RESEND_API_KEY)throw Error("E-post er ikke konfigurert.");
 if(invoice.status==="draft"){
  const autoDate=invoice.customer?.paymentMethod==="vipps";
  const issued=await s.rpc("issue_invoice_draft",{p_id:invoice.id,p_expected_updated_at:invoice.updated_at});
  if(issued.error)throw Error(issued.error.message);invoice=issued.data;
  // Issuance can happen after midnight in Oslo. The owner explicitly chose
  // today's date for an immediate Vipps job; normalize only that auto-date,
  // never the customer, job description, price, VAT or other confirmed data.
  if(autoDate)confirmation={...confirmation,customer:{...confirmation.customer,workDate:String(invoice.customer?.workDate||"")}};
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
 verifyInvoicePilot(invoice);
 const prepared=await s.rpc("prepare_invoice_vipps_v2",{
  p_invoice_id:invoice.id,p_delivery_method:channel.method,p_push_phone:channel.phone
 });
 if(prepared.error)throw Error(prepared.error.message);
 let p=prepared.data,payment;
 if(p?.delivery_method!==channel.method||String(p?.push_phone||"")!==String(channel.phone||""))
  throw Error("Betalingsmåte eller mobilnummer for dette Vipps-forsøket er endret. Kontroller status før et nytt forsøk.");
 // Ledger may change between owner confirmation and SQL row creation.
 // Never contact Vipps or email a link for a different amount.
 const confirmedRemaining=Number(confirmation.totalOre)-Number(confirmation.paidOre);
 if(!p||!Number.isSafeInteger(Number(p.amount_ore))||Number(p.amount_ore)!==confirmedRemaining)
  throw Error("Restbeløpet ble endret under klargjøringen. Last inn fakturaen på nytt og bekreft igjen. Ingen betalingslenke ble sendt.");
 try{payment=await getVippsPayment("service",p.reference);}catch(e){if(Number(e.status)!==404)throw Error("Kunne ikke kontrollere Vipps-forsøket. Prøv samme knapp igjen.");}
 if(!payment){
  payment=await createVippsPayment({
   unit:"service",reference:p.reference,amountOre:Number(p.amount_ore),
   ...(channel.method==="vipps_push"?{phone:channel.phone,userFlow:"PUSH_MESSAGE"}:{returnUrl:origin()+"/betaling/faktura?reference="+p.reference}),
   description:"Faktura "+invoice.invoice_number,idempotencyKey:p.id
  });
 }
 if(payment.state&&payment.state!=="CREATED")return reconcileInvoiceVipps(s,p.reference);
 if(channel.method==="vipps_push"){
  if(!p.push_requested_at){
   const saved=await s.from("invoice_vipps_payments")
    .update({push_requested_at:new Date().toISOString()})
    .eq("id",p.id).is("push_requested_at",null);
   if(saved.error)throw Error("Vipps-varselet er opprettet, men sendestatus kunne ikke lagres. Kontroller status – ikke send på nytt.");
  }
  return row(s,p.reference);
 }
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
   const paymentLink=shortPaymentUrl(p.reference);
   const amountLabel=money(Number(p.amount_ore));
   requestEmailId=await mail({
    to:invoice.customer.email,
    subject:"Betal faktura "+invoice.invoice_number+" med Vipps",
    text:["Hei "+invoice.customer.name+"!","","Du kan betale "+amountLabel+" for faktura "+invoice.invoice_number+" med Vipps her:",paymentLink,"","Åpne lenken og trykk «Åpne Vipps og betal» for å gå til Vipps. Lenken til selve Vipps-betalingen er tidsbegrenset.","Du får kvittering automatisk etter bekreftet betaling. Ikke betal samme faktura en gang til i banken.","","Aadland Service · post@aadland-service.no · 471 54 898"].join("\n"),
    html:'<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;color:#2d261e"><h2>Betal faktura med Vipps</h2><p>Du kan betale <strong>'+amountLabel+'</strong> for faktura fra Aadland Service.</p><p><a href="'+paymentLink+'" style="display:inline-block;background:#f36f36;color:#fff;font-weight:700;padding:15px 22px;text-decoration:none;border-radius:10px">Betal med Vipps</a></p><p>Åpne betalingssiden og trykk på knappen for å gå til Vipps.</p><p>Hvis knappen ikke virker, kopier denne korte adressen:<br><a href="'+paymentLink+'">'+paymentLink+'</a></p><p>Vipps-betalingsøkten er tidsbegrenset. Ikke betal den samme fakturaen i banken dersom du betaler med Vipps.</p><p>Du får kvittering automatisk etter godkjent betaling.</p></div>',
    attachments:[{filename:"Faktura-"+invoice.invoice_number+".pdf",content:invoice.pdf_base64,contentType:"application/pdf"}]
   },"invoice-vipps-request/"+p.id);
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
 return {reference:p.reference,shareUrl:p.delivery_method==="vipps_push"?null:shortPaymentUrl(p.reference),state:p.state,amountOre:Number(p.amount_ore),capturedOre:Math.max(0,Number(p.captured_ore)||0),refundedOre:Math.max(0,Number(p.refunded_ore)||0),redirectUrl:p.redirect_url||"",deliveryMethod:p.delivery_method||"email_link",phoneLast4:p.delivery_method==="vipps_push"?String(p.push_phone||"").slice(-4):null,pushRequestedAt:p.push_requested_at||null,receiptSentAt:p.receipt_sent_at||null,receiptError:p.receipt_error||"",emailSentAt:p.request_email_sent_at||null,emailError:p.emailError||""};
}
