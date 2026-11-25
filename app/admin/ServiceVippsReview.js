"use client";
import {useCallback,useEffect,useState} from "react";
const CONFIRM={effect:"UTFØRT I VIPPS",no_effect:"IKKE UTFØRT"};
const LABEL={capture:"Trekk betaling",cancel:"Kanseller reservasjon",refund:"Refusjon"};
const money=ore=>(Number(ore||0)/100).toLocaleString("nb-NO",{style:"currency",currency:"NOK"});
export default function ServiceVippsReview(){
 const [attempts,setAttempts]=useState([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [openId,setOpenId]=useState("");
 const [details,setDetails]=useState(null);
 const [outcome,setOutcome]=useState("");
 const [evidence,setEvidence]=useState("");
 const [note,setNote]=useState("");
 const [confirmation,setConfirmation]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/admin/vipps-service-review",{cache:"no-store"});
   const body=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(body.error||"Kunne ikke hente sendeloggen.");
   setAttempts(Array.isArray(body.attempts)?body.attempts:[]);
  }catch(e){setError(e.message||"Kunne ikke hente Vipps-oversikten.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);
 async function open(item){
  if(busy)return;
  if(item.id===openId){setOpenId("");setDetails(null);return;}
  setOpenId(item.id);setDetails(null);setOutcome("");setEvidence("");setNote("");setConfirmation("");
  setError("");setMessage("");
  setBusy(true);
  try{
   const r=await fetch("/api/admin/vipps-service-review?attemptId="+encodeURIComponent(item.id),{cache:"no-store"});
   const body=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(body.error||"Vipps kunne ikke kontrolleres.");
   setDetails(body);
  }catch(e){setError(e.message||"Vipps kunne ikke kontrolleres.");}
  finally{setBusy(false);}
 }
 async function review(item){
  if(busy||!item||!CONFIRM[outcome])return;
  if(confirmation!==CONFIRM[outcome]||note.length<16||evidence.trim().length<8){
   setError("Kontroller Vipps-hendelsene og fyll inn referanse, begrunnelse og bekreftelsestekst.");return;
  }
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/admin/vipps-service-review",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({attemptId:item.id,outcome,evidence,note,confirmation})
   });
   const body=await r.json().catch(()=>({}));
   if(!r.ok||!body.ok)throw Error(body.error||"Kontrollen kunne ikke lagres.");
   setOpenId("");setDetails(null);setMessage("Kontrollen er journalført. Ingen Vipps-transaksjon er utført.");
   await load();
  }catch(e){setError(e.message||"Kontrollen feilet.");}
  finally{setBusy(false);}
 }
 return <section style={{display:"grid",gap:14}}>
  <h2>Vipps Service – kontroll av betalinger og refusjoner</h2>
  <p>Her vises handlinger med ukjent resultat. Systemet sperrer nye belastninger og refusjoner på disse ordrene til du har kontrollert Vipps. <strong>Denne kontrollsiden flytter aldri penger.</strong></p>
  <button className="btn alt" type="button" disabled={loading||busy} onClick={load}>
   {loading?"Henter …":"Oppdater kontrolliste"}</button>
  {error&&<p role="alert" className="notice">{error}</p>}
  {message&&<p role="status" className="success">{message}</p>}
  {!loading&&!attempts.length&&<p>Ingen uavklarte Service-Vipps-handlinger.</p>}
  {attempts.map(item=><div className="card" style={{padding:16}} key={item.id}>
   <b>{LABEL[item.action]||item.action} – {money(item.amount_ore)}</b>
   <p>Vipps-referanse: {item.payment_reference}</p>
   <p>Forsøk: {new Date(item.claimed_at).toLocaleString("nb-NO")} · {item.state==="needs_review"?"Trenger kontroll":"Under behandling / usikkert"}</p>
   <button type="button" className="btn alt" disabled={busy} onClick={()=>open(item)}>{openId===item.id?"Lukk":"Kontroller mot Vipps"}</button>
   {openId===item.id&&<div style={{display:"grid",gap:12,marginTop:16}}>
    {!details?<p>Vipps-data kunne ikke hentes. Kontroller transaksjonen i Vipps-portalen før du registrerer et resultat.</p>:<>
     <p><strong>Vipps-status:</strong> Trukket {money(details.aggregates?.capturedOre)} · Refundert {money(details.aggregates?.refundedOre)} · Kansellert {money(details.aggregates?.cancelledOre)}</p>
     <p><strong>Hendelser:</strong> {details.events?.length||0} vist. Kontroller tidspunkt, beløp og idempotensnøkkel. Manglende hendelse betyr ikke automatisk at ingenting skjedde.</p>
     {(details.events||[]).slice(-12).map((ev,i)=><p key={i} style={{margin:0,fontSize:13}}>
      {ev.timestamp||"Ukjent tidspunkt"} · {ev.name} · {money(ev.amountOre)}
      {ev.matchesAttempt?" · Matcher dette forsøket":""} · {ev.success?"Godkjent":"Ikke bekreftet"}
     </p>)}
    </>}
    <p>Vent minst fem minutter etter handlingen. Oppgi referansen du kontrollerte og konklusjonen. Du må ikke anta at en timeout betyr at Vipps ikke gjennomførte handlingen.</p>
    <label>Resultat i Vipps
     <select value={outcome} onChange={e=>{setOutcome(e.target.value);setConfirmation("");}}>
      <option value="">Velg kontrollert resultat</option>
      <option value="effect">Vipps bekrefter at handlingen ble utført</option>
      <option value="no_effect">Vipps bekrefter at handlingen IKKE ble utført</option>
     </select>
    </label>
    <label>Vipps-hendelse eller referanse
     <input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Faktisk referanse / kontroll i Vipps"/>
    </label>
    <label>Begrunnelse (minst 16 tegn)
     <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)}/>
    </label>
    <label>Skriv {CONFIRM[outcome]||"bekreftelsesteksten"} for å lagre
     <input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>
    </label>
    <button type="button" className="btn" disabled={busy||!outcome} onClick={()=>review(item)}>
     Lagre kontroll – ingen Vipps-transaksjon
    </button>
   </div>}
  </div>)}
 </section>;
}
