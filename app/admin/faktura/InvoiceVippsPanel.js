"use client";
import {useEffect,useState,useRef} from "react";
import VippsFeePreview from "../VippsFeePreview";
import {invoiceTotalOre} from "../../../lib/invoicePaymentStatus";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function InvoiceVippsPanel({invoice,persist,onRefresh,disabled,onBusyChange,onApplyPrice,onPaymentMethodChange,allowPriceAdjustment=false}){
 const [payment,setPayment]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[completed,setCompleted]=useState(false);
 const [statusLoading,setStatusLoading]=useState(true),[statusLoaded,setStatusLoaded]=useState(false),[statusRetry,setStatusRetry]=useState(0);
 const refreshing=useRef(false);
 useEffect(()=>{
  let ignore=false;setPayment(null);setError("");setCompleted(false);setStatusLoading(true);setStatusLoaded(false);
  fetch("/api/admin/invoices/vipps?id="+invoice.id,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Vipps-status er utilgjengelig.");if(!ignore){setPayment(d.payment);setStatusLoaded(true);}})
   .catch(e=>{if(!ignore)setError("Vipps-status kunne ikke hentes. "+(e.message||"Prøv igjen."));})
   .finally(()=>{if(!ignore)setStatusLoading(false);});
  return ()=>{ignore=true};
 },[invoice.id,statusRetry]);
 async function sync(){
  if(refreshing.current)return;refreshing.current=true;
  try{
   const r=await fetch("/api/admin/invoices/vipps",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:invoice.id,action:"sync"})});
   const d=await r.json();if(!r.ok)throw Error(d.error);setPayment(d.payment);setError("");
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
  if(outstanding<100){setError("Fakturaen er allerede betalt, eller restbeløpet er under 1 krone.");return;}
  const reusing=payment&&["pending","authorized"].includes(payment.state);
  const details=reusing
   ?"Kontrollere den eksisterende Vipps-betalingen og eventuelt sende samme betalingslenke igjen til "+to+"? Det opprettes ikke et nytt Vipps-krav."
   :"Bekrefter du at kunden skal få en Vipps-betalingslenke på "+money(outstanding)+" til "+to+"?\n\n"+(invoice.status==="draft"?"Dette utsteder fakturaen og låser prisene. ":"")+"En betalingsforespørsel kan bli sendt på e-post når du bekrefter. Kontroller at beløpet er avtalt med kunden.";
  if(!window.confirm(details))return;
  setError("");setBusy(true);onBusyChange?.(true);
  try{
   if(invoice.status==="draft")await persist(invoice);
   const r=await fetch("/api/admin/invoices/vipps",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:invoice.id,action:"start",workCompleted:completed})});
   const d=await r.json();if(!r.ok)throw Error(d.error);setPayment(d.payment);await onRefresh();
  }catch(e){setError(e.message)}finally{setBusy(false);onBusyChange?.(false)}
 }
 const waiting=payment&&["pending","authorized"].includes(payment.state);
 return <section id="invoice-vipps-payment" style={{padding:18,marginBottom:18,border:"1px solid #c99a49",borderRadius:12}}><h2>Ta betalt med Vipps</h2>{invoice.status==="draft"&&<label style={{display:"block",marginBottom:12}}>Betalingsmåte ved prisberegningen<select value={invoice.customer?.paymentMethod==="vipps"?"vipps":"bank"} onChange={e=>onPaymentMethodChange?.(e.target.value)} disabled={busy||disabled} style={{display:"block",width:"100%",padding:10,marginTop:5}}><option value="bank">Bank / ordinær pris</option><option value="vipps">Vipps – beregn pris ut fra ønsket utbetaling</option></select></label>}<p>For ferdig utført arbeid: Kunden får betalingslenke på e-post. Når betalingen er trukket hos Vipps, registreres beløpet automatisk på fakturaen og kvittering sendes.</p>{invoiceTotalOre(invoice)>Number(invoice.paid_ore||0)&&(invoice.status!=="draft"||invoice.customer?.paymentMethod==="vipps")&&<VippsFeePreview amountOre={Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore||0))} allowPriceAdjustment={allowPriceAdjustment&&invoice.status==="draft"} noPriceAdjustmentText={invoice.status==="draft"?"Kun timearbeid: ingen materialer eller andre varelinjer å justere. Vipps-gebyret dekkes av bedriften.":"Fakturaen er utstedt og låst. Ingen priser kan endres."} title={invoice.status==="draft"?"Vipps – pris for fakturakladd":"Vipps – fakturaens restbeløp"} disabled={busy||disabled} onApply={invoice.status==="draft"&&allowPriceAdjustment?onApplyPrice:undefined} applyLabel="Legg beregnet pris på materialer / andre varer" note={invoice.status==="draft"?"Timeprisen endres aldri. Dersom det ikke finnes materialer eller andre varelinjer, dekkes Vipps-kostnaden av bedriften. Avtal eventuell ny totalpris med kunden før fakturaen utstedes.":"Utstedt faktura er låst, og prisen kan ikke etterjusteres."}/>}{payment&&["partial","refunded","paid"].includes(payment.state)&&invoiceTotalOre(invoice)>Number(invoice.paid_ore||0)&&<p>Det gjenstår et beløp på fakturaen. Du kan kontrollere status og opprette en ny Vipps-lenke for restbeløpet dersom forrige betaling er avsluttet.</p>}{payment&&<div role="status" style={{padding:"12px 14px",border:"1px solid #d8c9ae",borderRadius:9,margin:"12px 0"}}>
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
 </div>}{waiting&&payment.redirectUrl&&<div><a href={payment.redirectUrl} target="_blank" rel="noreferrer">Åpne betalingslenken på kundens enhet</a><button type="button" onClick={async()=>{try{if(navigator.share)await navigator.share({title:"Betal faktura med Vipps",url:payment.redirectUrl});else {await navigator.clipboard.writeText(payment.redirectUrl);setError("Betalingslenken er kopiert.")}}catch(e){if(e.name!=="AbortError")setError("Bruk knappen Kopier betalingslenke.")}}}>Del betalingslenke</button><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(payment.redirectUrl);setError("Betalingslenken er kopiert.")}catch{setError("Kopier betalingslenken fra lenken over.")}}}>Kopier betalingslenke</button>{payment.emailSentAt&&<p>Betalingslenken er sendt til {invoice.customer?.email}.</p>}{!payment.emailSentAt&&<p>Utsending av betalingslenken er ikke bekreftet. Bruk knappen for samme betalingslenke igjen, eller kopier lenken til kunden.</p>}{payment.emailError&&<p role="alert">{payment.emailError}</p>}</div>}{payment&&<button type="button" disabled={busy||disabled} onClick={sync}>{payment.receiptError?"Prøv kvittering på nytt / kontroller status":"Kontroller Vipps-status"}</button>}{statusLoading&&<p role="status">Kontrollerer tidligere Vipps-betalinger før du kan opprette en betalingslenke …</p>}{!statusLoading&&!statusLoaded&&<button type="button" disabled={busy||disabled} onClick={()=>setStatusRetry(x=>x+1)}>Prøv Vipps-status på nytt</button>}{statusLoaded&&(invoiceTotalOre(invoice)>Number(invoice.paid_ore||0))&&(!payment||["cancelled","pending","partial","refunded","paid"].includes(payment.state))&&<><label style={{display:"block",margin:"12px 0"}}><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)} disabled={busy||disabled}/> Arbeidet er ferdig, og kunden vil betale nå.</label><button type="button" disabled={busy||disabled||statusLoading||!statusLoaded||!completed} onClick={start}>{busy?"Klargjør …":waiting?"Hent / send samme betalingslenke igjen":invoice.status==="draft"?"Fakturer og ta betalt med Vipps":"Ta betalt med Vipps"}</button></>}{error&&<p role="status">{error}</p>}</section>;
}
