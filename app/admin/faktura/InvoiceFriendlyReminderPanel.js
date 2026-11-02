"use client";
import {useEffect,useRef,useState} from "react";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
import {invoiceSettlementInfo} from "../../../lib/invoiceSettlementInfo";
import {friendlyReminderEligible,friendlyReminderText} from "../../../lib/invoiceFriendlyReminder";
import {osloDateKey} from "../../../lib/osloTime";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore)/100);
const displayDate=value=>{
 if(!value)return "";
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value.split("-").reverse().join(".");
 return new Intl.DateTimeFormat("nb-NO",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Oslo"}).format(new Date(value));
};

export default function InvoiceFriendlyReminderPanel({invoice,disabled=false,onRefresh}){
 const [history,setHistory]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [canSend,setCanSend]=useState(false),[open,setOpen]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [retry,setRetry]=useState(0);
 const requestId=useRef(null),sending=useRef(false);
 const today=osloDateKey(new Date()),payment=invoicePaymentState(invoice,today);
 const settlement=invoiceSettlementInfo(invoice,today);
 const email=String(invoice.customer?.email||"").trim();
 const eligible=friendlyReminderEligible(invoice,today)&&!settlement.needsReview&&Boolean(email);
 const preview=eligible?friendlyReminderText(invoice,payment.outstanding):null;
 const endpoint="/api/admin/invoices/friendly-reminders";
 async function loadHistory(){
  const r=await fetch(endpoint+"?invoiceId="+encodeURIComponent(invoice.id),{cache:"no-store"});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Påminnelseshistorikken kunne ikke hentes.");
  setHistory(d.reminders||[]);setCanSend(d.canSend===true);
 }
 useEffect(()=>{
  let active=true;
  setLoading(true);setHistory([]);setCanSend(false);setOpen(false);setError("");setNotice("");
  requestId.current=null;
  fetch(endpoint+"?invoiceId="+encodeURIComponent(invoice.id),{cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Kunne ikke hente historikk.");
    if(active){setHistory(d.reminders||[]);setCanSend(d.canSend===true);}})
   .catch(e=>{if(active)setError(e.message||"Påminnelseshistorikken kunne ikke hentes.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[invoice.id,invoice.payment_updated_at,invoice.credited_ore,retry]);
 function start(id=null){
  requestId.current=id||crypto.randomUUID();
  setOpen(true);setError("");setNotice("");
 }
 async function send(){
  if(sending.current||!eligible||!canSend||disabled||loading)return;
  if(!requestId.current)requestId.current=crypto.randomUUID();
  if(!window.confirm("Sende en ekte, vennlig betalingspåminnelse til "+email+
   "?\n\nFaktura: "+invoice.invoice_number+
   "\nGjenstående beløp: "+money(payment.outstanding)+
   "\nOpprinnelig forfallsdato: "+displayDate(invoice.due_date)+
   "\n\nDen opprinnelige fakturaen legges ved. Ingen ny betalingsfrist, gebyr eller renter opprettes."))return;
  sending.current=true;setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({invoiceId:invoice.id,requestId:requestId.current,
     confirmed:true,expectedEmail:email,expectedOutstandingOre:payment.outstanding})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Påminnelsen kunne ikke sendes.");
   setNotice(d.alreadySent?"Denne påminnelsen er allerede sendt. Ingen ekstra e-post ble sendt.":
    "Vennlig betalingspåminnelse er sendt til "+d.to+".");
   requestId.current=null;setOpen(false);
   await loadHistory();if(onRefresh)await onRefresh();
  }catch(e){
   setError((e.message||"Utsendingen kunne ikke bekreftes.")+
    " Kontroller e-postloggen før du prøver samme sending igjen.");
   try{await loadHistory()}catch{}
  }finally{sending.current=false;setBusy(false);}
 }
 if(invoice.status==="draft")return null;
 return <section id="invoice-friendly-reminder" style={{padding:"16px 0",borderBottom:"1px solid #d8c9ae",marginBottom:18}}>
  <h2>Vennlig betalingspåminnelse</h2>
  <p style={{fontSize:13}}>Send en vanlig e-post med originalfakturaen vedlagt. Ingen purring, purregebyr, renter eller ny betalingsfrist. Forfallsdatoen på fakturaen beholdes.</p>
  {settlement.needsReview&&<p role="alert">Betalingsstatus må kontrolleres før påminnelse: {settlement.guidance}</p>}
  {payment.outstanding===0?<p>Fakturaen er oppgjort. Ingen betalingspåminnelse skal sendes.</p>:
   <p>Gjenstående: <strong>{money(payment.outstanding)}</strong> · Opprinnelig forfall: <strong>{displayDate(invoice.due_date)}</strong></p>}
  {!email&&payment.outstanding>0&&<p>Kunden mangler e-postadresse. Oppdater kundekortet.</p>}
  {loading?<p>Henter tidligere påminnelser …</p>:
   canSend&&eligible&&<button type="button" disabled={disabled||busy} onClick={()=>start()}>
    Send vennlig betalingspåminnelse
   </button>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {notice&&<p role="status" style={{fontWeight:700}}>{notice}</p>}
  {open&&preview&&<div style={{padding:14,marginTop:12,border:"1px solid #d8c9ae",borderRadius:10}}>
   <h3>Se e-posten før sending</h3>
   <p>Til: <strong>{email}</strong><br/>Vedlegg: Original faktura {invoice.invoice_number} (PDF)</p>
   <p><strong>{preview.subject}</strong></p>
   <div style={{whiteSpace:"pre-wrap",lineHeight:1.55,background:"#f5f1e8",color:"#201d18",padding:12,borderRadius:6}}>{preview.body}</div>
   <p style={{fontSize:13}}>Du kan sende flere separate påminnelser senere. Dette forsøket blir registrert i historikken.</p>
   <button type="button" disabled={busy||disabled||!eligible} onClick={send}>{busy?"Sender …":"Bekreft og send e-post"}</button>{" "}
   <button type="button" disabled={busy} onClick={()=>setOpen(false)}>Avbryt</button>
  </div>}
  {!loading&&history.length>0&&<div style={{marginTop:14}}>
   <h3>Tidligere vennlige påminnelser</h3>
   {history.map(row=><div key={row.id} style={{borderBottom:"1px solid #e5dfd4",padding:"9px 0",fontSize:13}}>
    <strong>{row.sent_at?"Sendt "+displayDate(row.sent_at):"Sendeforsøk "+displayDate(row.created_at)}</strong>
    <div>Til: {row.recipient} · Restbeløp: {money(row.outstanding_ore)} · Opprinnelig forfall: {displayDate(row.original_due_date)}</div>
    {!row.sent_at&&<p>Ikke bekreftet sendt{row.error_message?": "+row.error_message:""}. Kontroller e-postloggen før nytt forsøk.</p>}
    {!row.sent_at&&canSend&&eligible&&<button type="button" disabled={busy||disabled} onClick={()=>start(row.id)}>Prøv samme sendeforsøk igjen</button>}
   </div>)}
  </div>}
  <button type="button" style={{marginTop:12}} disabled={loading||busy} onClick={()=>setRetry(n=>n+1)}>Oppdater påminnelseshistorikk</button>
 </section>;
}
