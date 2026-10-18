"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
export default function QuoteSettings(){
 const [minimum,setMinimum]=useState(15);
 const [defaultMarkup,setDefaultMarkup]=useState(15);
 const [message,setMessage]=useState("Henter innstillinger …");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  fetch("/api/admin/quote-preferences",{cache:"no-store"}).then(async response=>{
   const data=await response.json();if(!response.ok)throw Error(data.error||"Kunne ikke hente innstillinger.");
   setMinimum(data.minimumMaterialMarkup);setDefaultMarkup(data.defaultMaterialMarkup);setMessage("");
  }).catch(error=>setMessage(error.message));
 },[]);
 async function save(event){
  event.preventDefault();setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/admin/quote-preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({minimumMaterialMarkup:Number(minimum),defaultMaterialMarkup:Number(defaultMarkup)})});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Lagring feilet.");
   setMessage("Innstillingene er lagret for bedriften og brukes på PC og mobil.");
  }catch(error){setMessage(error.message)}finally{setBusy(false)}
 }
 return <main className="container" style={{maxWidth:760,paddingBlock:32}}>
  <Link href="/admin/tilbud">← Tilbake til tilbud</Link>
  <section className="card" style={{marginTop:20}}>
   <div className="kicker">TILBUD · INTERN KALKYLE</div>
   <h1>Kalkyleinnstillinger</h1>
   <p className="muted">Disse innstillingene gjelder for Aadland Service på alle enheter. Påslag beregnes på innkjøpspris eks. MVA.</p>
   <form onSubmit={save}>
    <div className="field"><label>Standard materialpåslag (%)</label><input type="number" min="0" max="1000" step="0.1" required value={defaultMarkup} onChange={e=>setDefaultMarkup(e.target.value)}/><small>Brukes som utgangspunkt ved prissetting fra materialkatalogen.</small></div>
    <div className="field"><label>Varselgrense – minste påslag (%)</label><input type="number" min="0" max="1000" step="0.1" required value={minimum} onChange={e=>setMinimum(e.target.value)}/><small>Viser advarsel dersom påslaget er lavere enn denne grensen.</small></div>
    <button className="btn" type="submit" disabled={busy}>{busy?"Lagrer …":"Lagre innstillinger"}</button>
    {message&&<p role="status">{message}</p>}
   </form>
  </section>
 </main>;
}
