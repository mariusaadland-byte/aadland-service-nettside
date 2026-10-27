"use client";
import {useState} from "react";

const formatDateAdd=(date,days)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))return "–";
 const day=new Date(date+"T12:00:00Z");
 day.setUTCDate(day.getUTCDate()+days);
 return day.toISOString().slice(0,10);
};
const choices=[7,14,21,30,45,60];
export default function InvoiceSecondPartReschedule({invoice,today,disabled=false,onSaved}){
 const [open,setOpen]=useState(false),[sendOn,setSendOn]=useState(invoice.planned_send_on||today);
 const [terms,setTerms]=useState(invoice.payment_terms_override_days??14);
 const [auto,setAuto]=useState(invoice.automatic_send===true);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 if(invoice.status!=="draft"||invoice.split_part!==2||
  !["scheduled","manual","cancelled"].includes(invoice.auto_send_state))return null;
 async function submit(e){
  e.preventDefault();
  if(busy||disabled)return;
  setError("");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(sendOn)||sendOn<today)
   return setError("Velg en dato fra i dag eller senere.");
  if(!Number.isInteger(Number(terms))||Number(terms)<0||Number(terms)>365)
   return setError("Velg en gyldig betalingsfrist.");
  const message="Endre bare del 2 av fakturaen?\n\n"+
   "Ny sendingsdato: "+sendOn+"\n"+
   "Betalingsfrist: "+terms+" dager fra fakturadato\n"+
   (auto?"Automatisk utsendelse: PÅ":"Automatisk utsendelse: AV")+
   "\n\nBeløpet og del 1 blir ikke endret. Del 2 utstedes ikke nå.";
  if(!window.confirm(message))return;
  setBusy(true);
  try{
   const res=await fetch("/api/admin/invoices/split",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"reschedule",id:invoice.id,sendOn,
     termsDays:Number(terms),autoSend:auto,confirmed:true})
   });
   const json=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(json.error||"Kunne ikke endre utsendelsesplanen.");
   await onSaved?.(json.plan);
   setOpen(false);
  }catch(err){setError(err.message||"Kunne ikke lagre utsendelsesplanen.");}
  finally{setBusy(false);}
 }
 return <section style={{marginTop:10}}>
  <button type="button" disabled={busy||disabled} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   {open?"Lukk endring av del 2":"Endre dato, betalingsfrist og autosending for del 2"}
  </button>
  {open&&<form onSubmit={submit} style={{display:"grid",gap:11,padding:12,
   border:"1px solid #ddd3c2",borderRadius:9,marginTop:9}}>
   <p style={{fontSize:12,margin:0}}>
    Gjelder bare del 2 før den er utstedt. Ny dato må også følge leveringsdatoen og lovlige frister.
    Fakturaens beløp og del 1 endres ikke.
   </p>
   <label>Ny planlagt sendingsdato
    <input type="date" required min={today} value={sendOn} disabled={busy||disabled}
     onChange={e=>setSendOn(e.target.value)}/>
   </label>
   <label>Betalingsfrist
    <select value={terms} onChange={e=>setTerms(Number(e.target.value))} disabled={busy||disabled}>
     {choices.map(n=><option value={n} key={n}>{n} dager</option>)}
    </select>
   </label>
   <p style={{fontSize:12,margin:0}}>Forventet forfall: <b>{formatDateAdd(sendOn,Number(terms))}</b>.
    Faktisk forfall regnes fra dagen fakturaen utstedes.
   </p>
   <label style={{fontWeight:700}}>
    <input type="checkbox" checked={auto} disabled={busy||disabled}
     onChange={e=>setAuto(e.target.checked)}/>
    Send del 2 automatisk på valgt dato
   </label>
   <button disabled={busy||disabled} type="submit">
    {busy?"Lagrer ny plan …":"Lagre ny plan for del 2"}
   </button>
  </form>}
  {error&&<p role="alert" style={{fontSize:13,color:"#a1291b"}}>{error}</p>}
 </section>;
}
