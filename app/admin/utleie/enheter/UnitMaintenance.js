"use client";
import {useEffect,useRef,useState} from "react";
import {maintenanceKinds,maintenanceConditions,maintenanceDueLabel} from "../../../../lib/rentalUnitMaintenance.mjs";
const empty={kind:"inspection",condition:"follow_up",performedOn:"",nextDueOn:"",note:""};
export default function UnitMaintenance({unitId,canWrite}){
 const [events,setEvents]=useState([]),[today,setToday]=useState(""),[v,setV]=useState(empty),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[ready,setReady]=useState(false),[limited,setLimited]=useState(false);
 const request=useRef(null),lock=useRef(false);
 async function load(){
  setLoading(true);setReady(false);setError("");
  try{
   const r=await fetch("/api/admin/rental/maintenance?unitId="+encodeURIComponent(unitId),{cache:"no-store"});const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||"Historikken kunne ikke hentes.");
   setEvents(d.events||[]);setToday(d.today);setLimited(!!d.limited);setV(x=>({...x,performedOn:x.performedOn||d.today}));setReady(true);
  }catch(e){setError(e.message);setEvents([]);}
  finally{setLoading(false);}
 }
 useEffect(()=>{load()},[unitId]);
 const change=e=>{setV(x=>({...x,[e.target.name]:e.target.value}));request.current=null;};
 async function submit(e){
  e.preventDefault();if(lock.current||!ready)return;lock.current=true;setBusy(true);setError("");
  try{
   if(!request.current)request.current=crypto.randomUUID();
   const r=await fetch("/api/admin/rental/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v,unitId,requestId:request.current})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Registreringen kunne ikke bekreftes.");
   request.current=null;setV({...empty,performedOn:today});await load();
  }catch(e){setError(e.message);}
  finally{lock.current=false;setBusy(false);}
 }
 const latest=events[0];
 return <section className="card" style={{marginTop:24}}><h2>Service og vedlikehold</h2><p>Historikk for denne fysiske enheten. Registrering endrer ikke automatisk bookbar kapasitet.</p>
 <button type="button" className="btn alt" disabled={busy||loading} onClick={load}>Oppdater historikk</button>
 {loading&&<p role="status">Henter servicehistorikk …</p>}{error&&<p role="alert">{error}</p>}
 {ready&&<>{latest?<div className="notice"><b>Siste registrerte tilstand: {maintenanceConditions[latest.condition]}</b><p>{maintenanceDueLabel(latest.next_due_on,today)}</p>{latest.condition!=="ok"&&<p>Vurder utstyret før bruk. Sperr produktet i utstyrsadministrasjonen og avklar eksisterende bookinger dersom det ikke kan brukes. Registreringen sperrer ikke utleiekalenderen.</p>}</div>:<p>Ingen kontroll registrert. Dette er ikke en bekreftelse på at utstyret er i orden.</p>}
 {canWrite&&<form onSubmit={submit}><h3>Registrer kontroll eller service</h3><label>Type<select name="kind" value={v.kind} onChange={change} disabled={busy}>{Object.entries(maintenanceKinds).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
 <label>Utført dato<input type="date" required name="performedOn" value={v.performedOn} max={today} onChange={change} disabled={busy}/></label>
 <label>Tilstand<select name="condition" value={v.condition} onChange={change} disabled={busy}>{Object.entries(maintenanceConditions).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
 <label>Neste kontrolldato (valgfritt)<input type="date" name="nextDueOn" value={v.nextDueOn} min={v.performedOn} onChange={change} disabled={busy}/></label>
 <label>Hva ble utført? Beskriv feil, tiltak og eventuelle deler.<textarea name="note" required minLength={10} maxLength={2000} rows={5} value={v.note} onChange={change} disabled={busy}/></label>
 <button type="submit" className="btn" disabled={busy||loading}>{busy?"Lagrer …":"Lagre i servicehistorikk"}</button></form>}
 <h3>Tidligere registreringer</h3>{limited&&<p>Viser de 100 nyeste etter utført dato.</p>}{events.map(x=><article key={x.id} style={{padding:"12px 0",borderTop:"1px solid #555"}}><b>{x.performed_on} · {maintenanceKinds[x.kind]}</b><p>{maintenanceConditions[x.condition]}</p><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{x.note}</p><small>{maintenanceDueLabel(x.next_due_on,today)}</small></article>)}</>}
 </section>;
}
