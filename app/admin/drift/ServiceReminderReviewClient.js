"use client";
import {useCallback,useEffect,useState} from "react";
const statusNames={
 claimed:"Utsending forsøkt – kontroller Resend",
 needs_review:"Uavklart – må undersøkes manuelt",
 sent:"Resend aksepterte e-posten",
 cancelled:"Tidspunkt eller mottaker ble endret før sending",
 reviewed_sent:"Eier har bekreftet Resend-ID",
 reviewed_unsent:"Eier har kontrollert: ikke sendt"
};
const fmt=v=>{
 if(!v)return "–";
 const d=new Date(v);return Number.isFinite(d.getTime())?
 d.toLocaleString("nb-NO",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Oslo"}):"Ukjent";
};
export default function ServiceReminderReviewClient(){
 const [data,setData]=useState(null),[error,setError]=useState(""),
  [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const response=await fetch("/api/admin/service-reminders",{cache:"no-store"});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body.error||"Påminnelsesloggen kunne ikke lastes.");
  setData(body);
 },[]);
 useEffect(()=>{
  let active=true;
  fetch("/api/admin/service-reminders",{cache:"no-store"})
   .then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||"Kunne ikke hente logg.");return j})
   .then(j=>{if(active)setData(j)})
   .catch(e=>{if(active)setError(e.message||"Kunne ikke hente logg.")});
  return()=>{active=false};
 },[]);
 async function resolve(item,result){
  const phrase=result==="sent"?"BEKREFTET I RESEND":"IKKE SENDT";
  const promptText=result==="sent"?
   "Kontroller den faktiske meldingen i Resend. Skriv BEKREFTET I RESEND for å registrere leverandørens sendekvittering:":
   "Sjekk at ingen e-post ble akseptert i Resend. En gammel påminnelse vil IKKE bli sendt på nytt automatisk. Skriv IKKE SENDT:";
  const confirmation=window.prompt(promptText);
  if(confirmation!==phrase)return;
  const resendId=result==="sent"?(window.prompt("Lim inn nøyaktig meldings-ID fra Resend:")||"").trim():"";
  if(result==="sent"&&!resendId)return;
  const note=(window.prompt("Skriv hva du kontrollerte i Resend, minst 12 tegn:")||"").trim();
  if(note.length<12)return;
  setBusy(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/admin/service-reminders",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:item.id,outcome:result,resendId,note,confirmation})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||"Kontrollen ble ikke lagret.");
   setMessage(d.message||"Status oppdatert.");
   await load();
  }catch(e){setError(e.message||"Kontrollen mislyktes.");}
  finally{setBusy(false);}
 }
 const pending=(data?.attempts||[]).filter(a=>["claimed","needs_review"].includes(a.state));
 const others=(data?.attempts||[]).filter(a=>!["claimed","needs_review"].includes(a.state)).slice(0,8);
 return <section style={{background:"#fff",border:"1px solid #ddd3c5",borderRadius:13,padding:18,marginTop:16}}>
  <h2 style={{fontSize:20,margin:"0 0 8px"}}>Befaring og oppstart – sendekontroll</h2>
  <p style={{fontSize:13,lineHeight:1.6,color:"#51483f"}}>
   Egen, privat logg for planlagte påminnelser. En avbrutt e-postsending sendes aldri automatisk på nytt.
   «Sendt» betyr at Resend aksepterte forespørselen, ikke at e-posten nådde innboksen.
   Kontroller eventuelle uavklarte utsendinger direkte i Resend før du registrerer resultatet.
  </p>
  {error&&<p role="alert" style={{padding:10,border:"1px solid #b65c53",borderRadius:8}}>{error}</p>}
  {message&&<p role="status" style={{padding:10,background:"#e4efe6",color:"#1a4c2b",borderRadius:8}}>{message}</p>}
  {!data&&!error&&<p>Henter påminnelseslogg …</p>}
  {data&&<p role="status"><strong>{data.needsReview} uavklarte</strong> i gjennomgangen.{data.outstandingLimitReached?" Listen er begrenset til de 100 eldste uavklarte. Kontroller databasen for resten.":""}</p>}
  {data&&pending.length===0&&<p style={{fontSize:13,color:"#51483f"}}>Ingen uavklarte påminnelser registrert. Dette beviser ikke levering av eldre e-poster.</p>}
  {[...pending,...others].map(a=><article key={a.id} style={{borderTop:"1px solid #e8e1d7",padding:"14px 0"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
    <strong>{a.kind==="survey"?"Befaring":"Oppstart"} · {fmt(a.appointment_at)}</strong>
    <span style={{fontWeight:700,color:["claimed","needs_review"].includes(a.state)?"#994322":"#355736"}}>
     {statusNames[a.state]||a.state}
    </span>
   </div>
   <p style={{fontSize:12,color:"#51483f",margin:"7px 0",overflowWrap:"anywhere"}}>
    Oppdrag: {a.order_id} · Mottaker: {a.recipient_email} · Forsøk: {fmt(a.claimed_at)}
   </p>
   {a.resend_email_id&&<p style={{fontSize:12,overflowWrap:"anywhere"}}>Resend-ID: {a.resend_email_id}</p>}
   {a.last_issue&&<p style={{fontSize:12,color:"#774a15"}}>Krever kontroll: {a.last_issue}</p>}
   {["claimed","needs_review"].includes(a.state)&&
    <div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:10}}>
     <button disabled={busy} type="button" onClick={()=>resolve(a,"sent")}
      style={{padding:"9px 12px",border:"1px solid #bca680",borderRadius:8,background:"#f5efe3",color:"#30251a"}}>Bekreft Resend-ID</button>
     <button disabled={busy} type="button" onClick={()=>resolve(a,"unsent")}
      style={{padding:"9px 12px",border:"1px solid #bca680",borderRadius:8,background:"#fff",color:"#30251a"}}>Bekreft ikke sendt</button>
    </div>}
  </article>)}
  {data&&<button disabled={busy} type="button"
   onClick={()=>load().catch(e=>setError(e.message))}
   style={{marginTop:8,padding:"9px 14px",border:"1px solid #8f816e",borderRadius:8,background:"#fff",color:"#30251a"}}>
   {busy?"Kontrollerer …":"Oppdater sendeloggen"}
  </button>}
  <p style={{fontSize:12,color:"#51483f",lineHeight:1.55}}>
   «Ikke sendt» starter ingen ny e-post. Dersom kunden fortsatt trenger beskjed etter kontroll, ta kontakt manuelt.
   En omplanlagt og bekreftet avtale kan få en ny påminnelse for sitt nye tidspunkt.
  </p>
 </section>;
}
