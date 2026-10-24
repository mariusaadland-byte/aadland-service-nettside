"use client";
import {useEffect,useRef,useState} from "react";
import {invoiceFollowUpState} from "../../../lib/invoiceFollowUpState";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
const formatTime=value=>{
 if(!value)return "";
 const d=new Date(value);return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("nb-NO",{timeZone:"Europe/Oslo",dateStyle:"medium",timeStyle:"short"}).format(d):"";
};
export default function InvoiceClosurePanel({invoice,today,onRefresh,disabled=false}){
 const [events,setEvents]=useState([]),[canManage,setCanManage]=useState(false);
 const [isLoading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [reason,setReason]=useState(""),[confirmChecked,setConfirmChecked]=useState(false);
 const requestId=useRef(null);
 const id=invoice.id,closed=Boolean(invoice.adminClosure?.closedAt);
 const follow=invoiceFollowUpState(invoice,today);
 const payment=invoicePaymentState(invoice,today);
 async function refresh(){
  const response=await fetch("/api/admin/invoices/closures?invoiceId="+encodeURIComponent(id),{cache:"no-store"});
  const data=await response.json();if(!response.ok)throw Error(data.error||"Kunne ikke hente avslutningshistorikk.");
  setEvents(data.events||[]);setCanManage(data.canManage===true);
 }
 useEffect(()=>{
  let active=true;setLoading(true);setEvents([]);setCanManage(false);setError("");setNotice("");
  setReason("");setConfirmChecked(false);requestId.current=null;
  fetch("/api/admin/invoices/closures?invoiceId="+encodeURIComponent(id),{cache:"no-store"})
   .then(async response=>{
    const data=await response.json();if(!response.ok)throw Error(data.error||"Historikken kunne ikke hentes.");
    if(active){setEvents(data.events||[]);setCanManage(data.canManage===true);}
   }).catch(e=>{if(active)setError(e.message||"Avslutningshistorikken kunne ikke hentes.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[id]);
 async function act(action){
  if(busy||disabled||isLoading||!canManage||!confirmChecked||reason.trim().length<5||
     reason.trim().length>500||(action==="close"&&(closed||follow.key!=="ready"))||
     (action==="reopen"&&!closed))return;
  const verb=action==="close"?"AVSLUTT":"ÅPNE";
  const question=action==="close"?
   "Vil du administrativt avslutte faktura "+invoice.invoice_number+
    "?\n\nAlle innbetalinger og dokumenter beholdes. Dette bokfører ikke fakturaen i eksternt regnskapssystem.":
   "Åpne faktura "+invoice.invoice_number+" igjen for videre behandling?\n\nEksisterende faktura, betalinger og historikk beholdes.";
  if(!window.confirm(question))return;
  if(window.prompt("Skriv "+verb+" for å bekrefte:")!==verb)return;
  setBusy(true);setError("");setNotice("");
  try{
   requestId.current||=crypto.randomUUID();
   const response=await fetch("/api/admin/invoices/closures",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     invoiceId:id,requestId:requestId.current,action,note:reason.trim(),confirmed:true,
     expectedPaidOre:payment.paid,expectedCreditedOre:payment.credited,
     expectedOutstandingOre:payment.outstanding
    })
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Statusen kunne ikke oppdateres.");
   requestId.current=null;
   await onRefresh?.();
   await refresh();
   setReason("");setConfirmChecked(false);
   setNotice(data.alreadyApplied?"Handlingen var allerede registrert. Ingen ny hendelse ble laget.":
    action==="close"?"Fakturaen er nå markert som administrativt avsluttet.":
    "Fakturaen er åpnet igjen og klar for videre behandling.");
  }catch(e){setError((e.message||"Kunne ikke endre administrativ status.")+
    " Kontroller historikken før du prøver igjen.");}
  finally{setBusy(false);}
 }
 return <section id="invoice-administrative-close" style={{
  padding:"16px",border:"1px solid #d9c7ac",borderRadius:10,margin:"16px 0"}}>
  <h2>Administrativ avslutning</h2>
  <p style={{fontSize:13}}>
   <strong>{closed?"Administrativt avsluttet":"Ikke administrativt avsluttet"}</strong>
   {closed&&invoice.adminClosure?.closedAt&&" · "+formatTime(invoice.adminClosure.closedAt)}
  </p>
  <p style={{fontSize:13,marginTop:4}}>
   Å avslutte her er bare en markering for intern oppfølging. Fakturaens nummer, PDF,
   kreditnotaer, innbetalinger og kundehistorikk endres ikke.
  </p>
  {closed&&follow.key!=="closed"&&<p role="alert" style={{padding:12,background:"#fff3e3",borderRadius:8}}>
   Denne fakturaen må kontrolleres selv om den er markert som avsluttet. Åpne den igjen før videre behandling.
  </p>}
  {!closed&&follow.key!=="ready"&&<p style={{fontSize:13}}>
   <strong>Kan ikke avsluttes ennå:</strong> {follow.detail}
  </p>}
  {isLoading&&<p>Henter avslutningshistorikk …</p>}
  {!isLoading&&canManage&&(closed||follow.key==="ready")&&<>
   <label style={{display:"block",margin:"12px 0"}}>
    Begrunnelse for {closed?"gjenåpning":"avslutning"} (minst 5 tegn)
    <textarea rows={2} maxLength={500} value={reason} style={{width:"100%",display:"block",boxSizing:"border-box"}}
     placeholder={closed?"For eksempel ny oppfølging eller behov for kontroll":"For eksempel betalinger og kreditnotaer kontrollert"}
     onChange={v=>{setReason(v.target.value);setConfirmChecked(false);requestId.current=null}}/>
   </label>
   <label style={{display:"flex",gap:9,alignItems:"flex-start",marginBottom:10,fontSize:13}}>
    <input type="checkbox" checked={confirmChecked} onChange={e=>setConfirmChecked(e.target.checked)}/>
    {closed?"Jeg bekrefter at fakturaen skal åpnes for videre intern oppfølging.":
     "Jeg har kontrollert at fakturaen er betalt/kreditert riktig, og at dokumentasjonen er på plass."}
   </label>
   <button type="button" disabled={busy||disabled||!confirmChecked||reason.trim().length<5||reason.trim().length>500}
    onClick={()=>act(closed?"reopen":"close")}>
    {busy?"Lagrer …":closed?"Åpne faktura igjen":"Avslutt faktura"}
   </button>
  </>}
  {!isLoading&&events.length>0&&<>
   <h3 style={{margin:"16px 0 8px"}}>Avslutningshistorikk</h3>
   {events.map(event=><div key={event.id} style={{padding:"9px 0",borderBottom:"1px solid #e7dfd3",fontSize:13}}>
    <strong>{event.action==="close"?"Avsluttet":event.action==="automatic_reopen"?"Automatisk åpnet igjen":"Åpnet igjen"}</strong>
    {" · "+formatTime(event.happened_at)}
    <div>{event.note}</div>
    {event.outstanding_ore>0&&<small>Registrert restbeløp ved hendelsen: {money(event.outstanding_ore)}</small>}
   </div>)}
  </>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}
   <button type="button" onClick={()=>{setError("");refresh().catch(e=>setError(e.message))}}>
    Kontroller historikk
   </button>
  </p>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
