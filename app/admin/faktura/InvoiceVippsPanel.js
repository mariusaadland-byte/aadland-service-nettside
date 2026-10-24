"use client";
import {useEffect,useState,useRef} from "react";
import VippsFeePreview from "../VippsFeePreview";
import {invoiceTotalOre,invoiceVippsConfirmationSnapshot} from "../../../lib/invoicePaymentStatus";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function InvoiceVippsPanel({invoice,persist,onRefresh,disabled,onBusyChange,onApplyPrice,onPaymentMethodChange,allowPriceAdjustment=false}){
 const [payment,setPayment]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[completed,setCompleted]=useState(false);
 const [statusLoading,setStatusLoading]=useState(true),[statusLoaded,setStatusLoaded]=useState(false),[statusRetry,setStatusRetry]=useState(0);
 const [refundAllowed,setRefundAllowed]=useState(false),[refundablePayments,setRefundablePayments]=useState([]),[refundMessage,setRefundMessage]=useState("");
 const [pushApproved,setPushApproved]=useState(false),[deliveryMethod,setDeliveryMethod]=useState("email_link"),[pushPhone,setPushPhone]=useState(""),[customerPresent,setCustomerPresent]=useState(false),[customerConsent,setCustomerConsent]=useState(false);
 const refreshing=useRef(false);
 useEffect(()=>{
  let ignore=false;setPayment(null);setError("");setCompleted(false);setStatusLoading(true);setStatusLoaded(false);setPushApproved(false);setDeliveryMethod("email_link");setPushPhone("");setCustomerPresent(false);setCustomerConsent(false);setRefundAllowed(false);setRefundablePayments([]);setRefundMessage("");
  fetch("/api/admin/invoices/vipps?id="+invoice.id,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Vipps-status er utilgjengelig.");if(!ignore){setPayment(d.payment);setRefundablePayments(d.refundablePayments||[]);setRefundAllowed(d.refundAllowed===true);setPushApproved(d.pushApproved===true);if(d.payment?.deliveryMethod==="vipps_push")setDeliveryMethod("vipps_push");setStatusLoaded(true);}})
   .catch(e=>{if(!ignore)setError("Vipps-status kunne ikke hentes. "+(e.message||"Prøv igjen."));})
   .finally(()=>{if(!ignore)setStatusLoading(false);});
  return ()=>{ignore=true};
 },[invoice.id,statusRetry]);
 async function reloadPaymentHistory(){
  const r=await fetch("/api/admin/invoices/vipps?id="+invoice.id,{cache:"no-store"});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Betalingshistorikken kunne ikke oppdateres.");
  setPayment(d.payment);setRefundablePayments(d.refundablePayments||[]);setRefundAllowed(d.refundAllowed===true);
 }
 async function refundNow(item){
  if(busy||disabled||!refundAllowed||!item?.reference)return;
  const available=Math.max(0,Number(item.capturedOre||0)-Number(item.refundedOre||0));
  if(available<=0){setError("Ingen beløp tilgjengelig for refusjon. Oppdater status.");return;}
  const entered=window.prompt("Vipps-refusjon for faktura "+invoice.invoice_number+"\\nMaksimalt tilgjengelig: "+money(available)+"\\nSkriv beløpet i kroner:",(available/100).toFixed(2).replace(".",","));
  if(entered===null)return;
  const cleaned=entered.trim();
  if(!/^\\d+(?:[,.]\\d{1,2})?$/.test(cleaned)){setError("Bruk kroner og maks to desimaler, for eksempel 125,50.");return;}
  const amountOre=Math.round(Number(cleaned.replace(",","."))*100);
  if(!Number.isSafeInteger(amountOre)||amountOre<=0||amountOre>available){setError("Beløpet må være større enn null og kan ikke overstige "+money(available)+".");return;}
  if(!window.confirm("Du er i ferd med å REFUNDERE "+money(amountOre)+" til kunden via Vipps.\\nFaktura: "+invoice.invoice_number+"\\nVipps-referanse: "+item.reference+"\\nDette flytter ekte penger og gjør beløpet utestående på fakturaen inntil det eventuelt krediteres. Er beløpet riktig?"))return;
  if(window.prompt("Skriv REFUNDER for å godkjenne den ekte tilbakebetalingen:")!=="REFUNDER")return;
  setBusy(true);onBusyChange?.(true);setError("");setRefundMessage("");
  try{
   const response=await fetch("/api/admin/invoices/vipps",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:invoice.id,action:"refund",reference:item.reference,amountOre,
     expectedCapturedOre:item.capturedOre,expectedRefundedOre:item.refundedOre,
     confirmedInvoiceNumber:invoice.invoice_number})
   });
   const data=await response.json();if(!response.ok)throw Error(data.error||"Refusjonen kunne ikke bekreftes.");
   await reloadPaymentHistory();await onRefresh();
   setRefundMessage("Vipps har bekreftet refusjon på "+money(amountOre)+". Fakturaens innbetaling er oppdatert. "+(data.refundNotice?.sent?"E-postbekreftelse er sendt til kunden.":"E-postbekreftelsen er ennå ikke bekreftet sendt; systemet forsøker automatisk igjen."));
  }catch(e){
   setError((e.message||"Refusjonen kunne ikke bekreftes.")+" Ikke send et nytt krav eller en ny refusjon før Vipps-status er kontrollert.");
   try{await reloadPaymentHistory();await onRefresh();}catch{}
  }finally{setBusy(false);onBusyChange?.(false);}
 }
 async function sync(){
  if(refreshing.current)return;refreshing.current=true;
  try{
   const r=await fetch("/api/admin/invoices/vipps",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:invoice.id,action:"sync"})});
   const d=await r.json();if(!r.ok)throw Error(d.error);setPayment(d.payment);setError("");await reloadPaymentHistory();
   if(["paid","partial","refunded"].includes(d.payment.state))await onRefresh();
  }catch(e){setError(e.message)}finally{refreshing.current=false}
 }
 useEffect(()=>{
  if(!payment||!["pending","authorized"].includes(payment.state))return;
  const timer=setInterval(()=>{if(document.visibilityState==="visible")sync()},6000);
  return ()=>clearInterval(timer);
 },[payment?.reference,payment?.state,invoice.id]);
 async function start(){
  if(busy||disabled||statusLoading||!statusLoaded||!completed)return;
  const to=String(invoice.customer?.email||"").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){setError("Fyll inn en gyldig e-postadresse til kunden før Vipps-betaling.");return;}
  const outstanding=Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore||0));
  const method=payment&&["pending","authorized"].includes(payment.state)?payment.deliveryMethod||"email_link":deliveryMethod;
  if(method==="vipps_push"){
   if(!pushApproved){setError("Vipps-varsel er ikke godkjent og aktivert for Aadland Service ennå.");return;}
   if(!customerPresent||!customerConsent){setError("Bekreft at kunden er til stede og ønsker Vipps-varsel.");return;}
   const digits=String(pushPhone||invoice.customer?.phone||"").replace(/[\s()+-]/g,"");
   if(!/^(?:47)?[0-9]{8}$/.test(digits)){setError("Skriv inn kundens gyldige norske mobilnummer.");return;}
  }
  if(outstanding<100){setError("Fakturaen er allerede betalt, eller restbeløpet er under 1 krone.");return;}
  const reusing=payment&&["pending","authorized"].includes(payment.state);
  const details=reusing
   ?method==="vipps_push"?"Kontrollere eksisterende Vipps-varsel til telefonnummeret som slutter på "+(payment.phoneLast4||"ukjent")+"? Det sendes IKKE et nytt betalingsvarsel.":"Kontrollere eksisterende Vipps-betaling og eventuelt sende SAMME betalingslenke igjen til "+to+"? Det opprettes ikke et nytt Vipps-krav."
   :method==="vipps_push"
    ?"Kunden er til stede og har bedt om Vipps-varsel til "+(pushPhone||invoice.customer?.phone||"ukjent nummer")+" på "+money(outstanding)+"?\n\n"+(invoice.status==="draft"?"Dette utsteder en ekte faktura og låser prisene. ":"")+"Dette sender et EKTE Vipps-varsel til kundens mobil. Kunden godkjenner selv i Vipps."
    :"Bekrefter du at kunden skal få en Vipps-betalingslenke på "+money(outstanding)+" til "+to+"?\n\n"+(invoice.status==="draft"?"Dette utsteder fakturaen og låser prisene. ":"")+"En betalingsforespørsel kan bli sendt på e-post når du bekrefter. Kontroller at beløpet er avtalt med kunden.";
  if(!window.confirm(details))return;
  setError("");setBusy(true);onBusyChange?.(true);
  try{
   if(invoice.status==="draft")await persist(invoice);
   const r=await fetch("/api/admin/invoices/vipps",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:invoice.id,action:"start",workCompleted:completed,confirmedInvoice:invoiceVippsConfirmationSnapshot(invoice),deliveryMethod:method,...(method==="vipps_push"?{phone:pushPhone||invoice.customer?.phone,customerPresent,customerConsent}:{})})});
   const d=await r.json();if(!r.ok)throw Error(d.error);setPayment(d.payment);await reloadPaymentHistory();await onRefresh();
  }catch(e){setError(e.message);if(/etter bekreftelsen|på nytt før Vipps-betaling|Last inn fakturaen på nytt/.test(e.message||"")){setStatusLoaded(false);await onRefresh();setStatusRetry(n=>n+1);}}finally{setBusy(false);onBusyChange?.(false)}
 }
 const waiting=payment&&["pending","authorized"].includes(payment.state);
 return <section id="invoice-vipps-payment" style={{padding:18,marginBottom:18,border:"1px solid #c99a49",borderRadius:12}}><h2>Ta betalt med Vipps</h2><p style={{fontSize:13,marginTop:0}}><a href="/admin/vipps/test">Prøvekjør Vipps med fiktive beløp (uten ekte betaling)</a></p>{invoice.status==="draft"&&<label style={{display:"block",marginBottom:12}}>Betalingsmåte ved prisberegningen<select value={invoice.customer?.paymentMethod==="vipps"?"vipps":"bank"} onChange={e=>onPaymentMethodChange?.(e.target.value)} disabled={busy||disabled} style={{display:"block",width:"100%",padding:10,marginTop:5}}><option value="bank">Bank / ordinær pris</option><option value="vipps">Vipps – beregn pris ut fra ønsket utbetaling</option></select></label>}<p>For ferdig utført arbeid kan du sende en betalingslenke på e-post eller, etter Vipps-godkjenning, sende et betalingsvarsel direkte til en kunde som står foran deg. Etter bekreftet betaling registreres beløpet automatisk og kunden får PDF-kvittering.</p>
<div style={{background:"#fffaf2",padding:"12px 14px",borderRadius:9,margin:"12px 0",border:"1px solid #dac7a9"}}>
 <strong>Hvordan vil kunden betale?</strong>
 <label style={{display:"block",marginTop:8}}><input type="radio" name={"invoice-vipps-mode-"+invoice.id} value="email_link" checked={(payment&&["pending","authorized"].includes(payment.state)?payment.deliveryMethod||"email_link":deliveryMethod)==="email_link"} onChange={()=>setDeliveryMethod("email_link")} disabled={busy||disabled||waiting}/> Send betalingslenke på e-post</label>
 <label style={{display:"block",marginTop:8}}><input type="radio" name={"invoice-vipps-mode-"+invoice.id} value="vipps_push" checked={(payment&&["pending","authorized"].includes(payment.state)?payment.deliveryMethod||"email_link":deliveryMethod)==="vipps_push"} onChange={()=>setDeliveryMethod("vipps_push")} disabled={busy||disabled||waiting||!pushApproved}/> Kunden er her – send varsel direkte til Vipps {pushApproved?"":"(krever godkjenning fra Vipps)"}</label>
 {(payment&&["pending","authorized"].includes(payment.state)?payment.deliveryMethod:deliveryMethod)==="vipps_push"&&pushApproved&&<>
  <label style={{display:"block",marginTop:12}}>Kundens mobilnummer
   <input type="tel" inputMode="tel" autoComplete="off" value={pushPhone} placeholder={invoice.customer?.phone||"8 siffer"} onChange={e=>setPushPhone(e.target.value)} disabled={busy||disabled||waiting} style={{display:"block",padding:10,width:"100%",maxWidth:260,marginTop:5}}/>
  </label>
  <label style={{display:"block",marginTop:9}}><input type="checkbox" checked={customerPresent} onChange={e=>setCustomerPresent(e.target.checked)} disabled={busy||disabled||waiting}/> Kunden er fysisk til stede hos meg.</label>
  <label style={{display:"block",marginTop:9}}><input type="checkbox" checked={customerConsent} onChange={e=>setCustomerConsent(e.target.checked)} disabled={busy||disabled||waiting}/> Kunden har samtykket til at jeg sender Vipps-varsel til dette nummeret.</label>
 </>}
 {!pushApproved&&<p style={{fontSize:12,marginBottom:0}}>Direkte Vipps-varsel er ennå ikke aktivert. Be Vipps godkjenne <code>PUSH_MESSAGE</code> for Aadland Service sitt MSN. Frem til da bruker du betalingslenke.</p>}
</div>{invoiceTotalOre(invoice)>Number(invoice.paid_ore||0)&&(invoice.status!=="draft"||invoice.customer?.paymentMethod==="vipps")&&<VippsFeePreview amountOre={Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore||0))} allowPriceAdjustment={allowPriceAdjustment&&invoice.status==="draft"} noPriceAdjustmentText={invoice.status==="draft"?"Kun timearbeid: ingen materialer eller andre varelinjer å justere. Vipps-gebyret dekkes av bedriften.":"Fakturaen er utstedt og låst. Ingen priser kan endres."} title={invoice.status==="draft"?"Vipps – pris for fakturakladd":"Vipps – fakturaens restbeløp"} disabled={busy||disabled} onApply={invoice.status==="draft"&&allowPriceAdjustment?onApplyPrice:undefined} applyLabel="Legg beregnet pris på materialer / andre varer" note={invoice.status==="draft"?"Timeprisen endres aldri. Dersom det ikke finnes materialer eller andre varelinjer, dekkes Vipps-kostnaden av bedriften. Avtal eventuell ny totalpris med kunden før fakturaen utstedes.":"Utstedt faktura er låst, og prisen kan ikke etterjusteres."}/>}{payment&&["partial","refunded","paid"].includes(payment.state)&&invoiceTotalOre(invoice)>Number(invoice.paid_ore||0)&&<p>Det gjenstår et beløp på fakturaen. Du kan kontrollere status og opprette en ny Vipps-lenke for restbeløpet dersom forrige betaling er avsluttet.</p>}{payment&&<div role="status" style={{padding:"12px 14px",border:"1px solid #d8c9ae",borderRadius:9,margin:"12px 0"}}>
 <strong>{({pending:"Venter på betaling",authorized:"Betalingen fullføres",paid:"Vipps-forsøket er betalt",cancelled:"Vipps-forsøket er avsluttet uten betaling",partial:"Vipps-forsøket er delvis betalt",refunded:"Vipps-forsøket er refundert"})[payment.state]||"Betalingsstatus ukjent"}</strong>
 <dl style={{display:"grid",gridTemplateColumns:"minmax(120px,1fr) auto",gap:"5px 14px",margin:"12px 0 0"}}>
  <dt>Betalingsforespørsel</dt><dd style={{margin:0,textAlign:"right"}}>{money(payment.amountOre)}</dd>
  <dt>Trukket hos Vipps</dt><dd style={{margin:0,textAlign:"right"}}>{money(payment.capturedOre||0)}</dd>
  {(payment.refundedOre||0)>0&&<><dt>Refundert hos Vipps</dt><dd style={{margin:0,textAlign:"right"}}>{money(payment.refundedOre)}</dd></>}
  <dt>Netto registrert fra dette Vipps-forsøket</dt><dd style={{margin:0,textAlign:"right"}}>{money(Math.max(0,(payment.capturedOre||0)-(payment.refundedOre||0)))}</dd>
  <dt>Totalt registrert betalt på fakturaen</dt><dd style={{margin:0,textAlign:"right"}}>{money(Math.max(0,Number(invoice.paid_ore)||0))}</dd>
  <dt><strong>Gjenstår på fakturaen</strong></dt><dd style={{margin:0,textAlign:"right"}}><strong>{money(Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore||0)))}</strong></dd>
 </dl>
 {payment.receiptSentAt&&<p style={{marginBottom:0}}>{payment.refundedOre>0?"Kvittering for opprinnelig betaling er sendt. Refusjonen kan ha endret sluttbeløpet.":"Kvittering for betalingen er sendt på e-post."}</p>}
 {payment.receiptError&&payment.refundedOre===0&&<p role="alert" style={{marginBottom:0}}>Kvitteringen er ikke bekreftet sendt: {payment.receiptError}. Bruk «Kontroller Vipps-status» for å prøve igjen; kunden skal ikke betale på nytt.</p>}
 </div>}{refundAllowed&&refundablePayments.length>0&&invoice.status!=="draft"&&<section aria-label="Refunder Vipps" style={{background:"#fffaf3",padding:16,border:"1px solid #cfb584",borderRadius:10,margin:"14px 0"}}>
 <h3 style={{margin:"0 0 8px"}}>Refunder Vipps-betaling</h3>
 <p style={{fontSize:13}}>Kun eier kan tilbakebetale. Velg betalingen og beløpet. Bekreftelsen gjennomfører en ekte refusjon hos Vipps. Når refusjonen er bekreftet, får kunden en egen e-postbekreftelse.</p><p style={{fontSize:12}}>Viktig: Refusjon reverserer en innbetaling, men utsteder ikke kreditnota. Dersom fakturabeløpet skal reduseres eller oppheves, må dette håndteres med korrekt kreditnota før videre betalingsoppfølging.</p>
 {refundablePayments.map(item=><div key={item.reference} style={{borderTop:"1px solid #e3d7c5",padding:"12px 0",display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
  <div><strong>{money(Math.max(0,item.capturedOre-item.refundedOre))} kan refunderes</strong><div style={{fontSize:12}}>Vipps: {item.reference.slice(-12)} · Trukket {money(item.capturedOre)} · Tidligere refundert {money(item.refundedOre)}</div></div>
  <button type="button" disabled={busy||disabled||statusLoading} onClick={()=>refundNow(item)}>{busy?"Behandler …":"Refunder …"}</button>
 </div>)}
 {refundMessage&&<p role="status" style={{fontWeight:700}}>{refundMessage}</p>}
 </section>}{waiting&&payment.deliveryMethod==="vipps_push"&&<p role="status" style={{padding:12,background:"#edf6ee",borderRadius:8}}>Vipps-forespørsel opprettet for kunden sitt nummer som slutter på <strong>{payment.phoneLast4}</strong>. Kunden må godkjenne i sin egen Vipps-app. Ingen ny forespørsel sendes når du kontrollerer status.</p>}{waiting&&payment.shareUrl&&<div><a href={payment.shareUrl} target="_blank" rel="noreferrer">Åpne kort Vipps-betalingslenke på kundens enhet</a><button type="button" onClick={async()=>{try{if(navigator.share)await navigator.share({title:"Betal faktura med Vipps",url:payment.shareUrl});else {await navigator.clipboard.writeText(payment.shareUrl);setError("Den korte betalingslenken er kopiert.")}}catch(e){if(e.name!=="AbortError")setError("Bruk knappen Kopier betalingslenke.")}}}>Del betalingslenke</button><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(payment.shareUrl);setError("Den korte betalingslenken er kopiert.")}catch{setError("Kopier betalingslenken fra lenken over.")}}}>Kopier betalingslenke</button>{payment.emailSentAt&&<p>Betalingslenken er sendt til {invoice.customer?.email}.</p>}{!payment.emailSentAt&&<p>Utsending av betalingslenken er ikke bekreftet. Bruk knappen for samme betalingslenke igjen, eller kopier lenken til kunden.</p>}{payment.emailError&&<p role="alert">{payment.emailError}</p>}</div>}{payment&&<button type="button" disabled={busy||disabled} onClick={sync}>{payment.receiptError?"Prøv kvittering på nytt / kontroller status":"Kontroller Vipps-status"}</button>}{statusLoading&&<p role="status">Kontrollerer tidligere Vipps-betalinger før du kan opprette en betalingslenke …</p>}{!statusLoading&&!statusLoaded&&<button type="button" disabled={busy||disabled} onClick={()=>setStatusRetry(x=>x+1)}>Prøv Vipps-status på nytt</button>}{statusLoaded&&(invoiceTotalOre(invoice)>Number(invoice.paid_ore||0))&&(!payment||["cancelled","pending","partial","refunded","paid"].includes(payment.state))&&<><label style={{display:"block",margin:"12px 0"}}><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)} disabled={busy||disabled}/> Arbeidet er ferdig, og kunden vil betale nå.</label><button type="button" disabled={busy||disabled||statusLoading||!statusLoaded||!completed} onClick={waiting&&payment?.deliveryMethod==="vipps_push"?sync:start}>{busy?"Klargjør …":waiting?payment.deliveryMethod==="vipps_push"?"Kontroller eksisterende Vipps-varsel":"Hent / send samme betalingslenke igjen":deliveryMethod==="vipps_push"?"Send Vipps-varsel til kunden":invoice.status==="draft"?"Fakturer og ta betalt med Vipps":"Ta betalt med Vipps"}</button></>}{error&&<p role="status">{error}</p>}</section>;
}
