"use client";
import {useEffect,useState,useRef} from "react";
import VippsFeePreview from "../VippsFeePreview";
import {invoiceTotalOre} from "../../../lib/invoicePaymentStatus";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function InvoiceVippsPanel({invoice,persist,onRefresh,disabled,onBusyChange,onApplyPrice,onPaymentMethodChange,allowPriceAdjustment=false}){
 const [payment,setPayment]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[completed,setCompleted]=useState(false);
 const refreshing=useRef(false);
 useEffect(()=>{
  let ignore=false;setPayment(null);setError("");setCompleted(false);
  fetch("/api/admin/invoices/vipps?id="+invoice.id).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!ignore)setPayment(d.payment)}).catch(e=>{if(!ignore)setError(e.message)});
  return ()=>{ignore=true};
 },[invoice.id]);
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
  setError("");setBusy(true);onBusyChange?.(true);
  try{
   if(invoice.status==="draft")await persist(invoice);
   const r=await fetch("/api/admin/invoices/vipps",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:invoice.id,action:"start",workCompleted:completed})});
   const d=await r.json();if(!r.ok)throw Error(d.error);setPayment(d.payment);await onRefresh();
  }catch(e){setError(e.message)}finally{setBusy(false);onBusyChange?.(false)}
 }
 const waiting=payment&&["pending","authorized"].includes(payment.state);
 return <section style={{padding:18,marginBottom:18,border:"1px solid #c99a49",borderRadius:12}}><h2>Ta betalt med Vipps</h2>{invoice.status==="draft"&&<label style={{display:"block",marginBottom:12}}>Betalingsmåte ved prisberegningen<select value={invoice.customer?.paymentMethod==="vipps"?"vipps":"bank"} onChange={e=>onPaymentMethodChange?.(e.target.value)} disabled={busy||disabled} style={{display:"block",width:"100%",padding:10,marginTop:5}}><option value="bank">Bank / ordinær pris</option><option value="vipps">Vipps – beregn pris ut fra ønsket utbetaling</option></select></label>}<p>For ferdig utført arbeid: Kunden får betalingslenke på e-post. Når betalingen er trukket hos Vipps, registreres beløpet automatisk på fakturaen og kvittering sendes.</p>{invoiceTotalOre(invoice)>Number(invoice.paid_ore||0)&&(invoice.status!=="draft"||invoice.customer?.paymentMethod==="vipps")&&<VippsFeePreview amountOre={Math.max(0,invoiceTotalOre(invoice)-Number(invoice.paid_ore||0))} allowPriceAdjustment={allowPriceAdjustment&&invoice.status==="draft"} noPriceAdjustmentText={invoice.status==="draft"?"Kun timearbeid: ingen materialer eller andre varelinjer å justere. Vipps-gebyret dekkes av bedriften.":"Fakturaen er utstedt og låst. Ingen priser kan endres."} title={invoice.status==="draft"?"Vipps – pris for fakturakladd":"Vipps – fakturaens restbeløp"} disabled={busy||disabled} onApply={invoice.status==="draft"&&allowPriceAdjustment?onApplyPrice:undefined} applyLabel="Legg beregnet pris på materialer / andre varer" note={invoice.status==="draft"?"Timeprisen endres aldri. Dersom det ikke finnes materialer eller andre varelinjer, dekkes Vipps-kostnaden av bedriften. Avtal eventuell ny totalpris med kunden før fakturaen utstedes.":"Utstedt faktura er låst, og prisen kan ikke etterjusteres."}/>}{payment&&<p role="status"><b>{({pending:"Venter på betaling",authorized:"Betalingen fullføres",paid:"Betalt med Vipps",cancelled:"Betalingen er avsluttet uten betaling",partial:"Delvis betaling",refunded:"Refundert"})[payment.state]}</b> · {money(payment.amountOre)}{payment.receiptSentAt&&<><br/>Kvittering sendt på e-post.</>}{payment.receiptError&&<><br/>{payment.receiptError}</>}</p>}{waiting&&payment.redirectUrl&&<div><a href={payment.redirectUrl} target="_blank" rel="noreferrer">Åpne betalingslenken på kundens enhet</a><button type="button" onClick={async()=>{try{if(navigator.share)await navigator.share({title:"Betal faktura med Vipps",url:payment.redirectUrl});else {await navigator.clipboard.writeText(payment.redirectUrl);setError("Betalingslenken er kopiert.")}}catch(e){if(e.name!=="AbortError")setError("Bruk knappen Kopier betalingslenke.")}}}>Del betalingslenke</button><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(payment.redirectUrl);setError("Betalingslenken er kopiert.")}catch{setError("Kopier betalingslenken fra lenken over.")}}}>Kopier betalingslenke</button>{payment.emailSentAt&&<p>Betalingslenken er sendt til {invoice.customer?.email}.</p>}{!payment.emailSentAt&&<p>Utsending av betalingslenken er ikke bekreftet. Bruk knappen for samme betalingslenke igjen, eller kopier lenken til kunden.</p>}{payment.emailError&&<p role="alert">{payment.emailError}</p>}</div>}{payment&&<button type="button" disabled={busy||disabled} onClick={sync}>Kontroller Vipps-status</button>}{(invoiceTotalOre(invoice)>Number(invoice.paid_ore||0))&&(!payment||["cancelled","pending"].includes(payment.state))&&<><label style={{display:"block",margin:"12px 0"}}><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)} disabled={busy||disabled}/> Arbeidet er ferdig, og kunden vil betale nå.</label><button type="button" disabled={busy||disabled||!completed} onClick={start}>{busy?"Klargjør …":waiting?"Hent / send samme betalingslenke igjen":invoice.status==="draft"?"Fakturer og ta betalt med Vipps":"Ta betalt med Vipps"}</button></>}{error&&<p role="status">{error}</p>}</section>;
}
