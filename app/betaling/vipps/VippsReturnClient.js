"use client";

import {useEffect,useRef,useState} from "react";

const statusText={
 pending:{
  title:"Vi sjekker Vipps-betalingen",
  text:"Betalingen behandles fortsatt. Dette tar vanligvis bare noen sekunder."
 },
 authorized:{
  title:"Betalingen er godkjent",
  text:"Beløpet er reservert i Vipps. Det trekkes først når varen eller tjenesten kan leveres."
 },
 paid:{
  title:"Betalingen er registrert",
  text:"Betalingen er trukket og registrert."
 },
 partial:{
  title:"Betalingen behandles",
  text:"En del av betalingen er registrert. Vi oppdaterer statusen når resten er avklart."
 },
 refunded:{
  title:"Betalingen er tilbakebetalt",
  text:"Vipps viser at det trukne beløpet er tilbakebetalt."
 },
 cancelled:{
  title:"Betalingen ble ikke fullført",
  text:"Reservasjonen er avbrutt eller utløpt. Ingen ny betaling blir startet automatisk."
 }
};

export default function VippsReturnClient({unit,reference}){
 const [status,setStatus]=useState("pending");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const attempts=useRef(0);
 const refreshing=useRef(false);

 async function load(refresh=false){
  if(!reference)return;
  try{
   const response=await fetch("/api/vipps/payment-status?unit="+encodeURIComponent(unit)+"&reference="+encodeURIComponent(reference)+(refresh?"&refresh=1":""));
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Status kunne ikke hentes.");
   setStatus(data.status||"pending");
   setError("");
   return Boolean(data.terminal);
  }catch(err){
   setError(err.message||"Status kunne ikke hentes.");
   return false;
  }finally{
   setLoading(false);
  }
 }

 useEffect(()=>{
  if(!reference){setLoading(false);setError("Betalingsreferansen mangler.");return;}
  let cancelled=false;
  let timer;
  const run=async()=>{
   if(cancelled)return;
   attempts.current+=1;
   const useRefresh=attempts.current===3&&!refreshing.current;
   if(useRefresh)refreshing.current=true;
   const terminal=await load(useRefresh);
   if(cancelled||terminal||attempts.current>=10)return;
   timer=setTimeout(run,3000);
  };
  run();
  return()=>{cancelled=true;if(timer)clearTimeout(timer)};
 },[unit,reference]);

 const info=statusText[status]||statusText.pending;
 const backUrl=unit==="rental"?"/utleie":"/produkter";

 return <main className="catalogPage">
  <section className="section" style={{paddingTop:72,paddingBottom:72}}>
   <div className="wrap" style={{maxWidth:720}}>
    <div className="card">
     <div className="kicker">VIPPS</div>
     <h1>{loading?"Sjekker betaling …":info.title}</h1>
     <p className="muted" style={{fontSize:17,lineHeight:1.7}}>{info.text}</p>
     {reference&&<p><small className="muted">Referanse</small><br/><b>{reference}</b></p>}
     {error&&<p className="notice">{error}</p>}
     {!loading&&!["authorized","paid","refunded","cancelled"].includes(status)&&attempts.current>=10&&<p className="notice">Statusen bruker litt tid. Du kan trygt lukke siden; backoffice og Min side oppdateres når Vipps-statusen kommer inn.</p>}
     <div className="customerOrderSuccessActions">
      <a className="btn" href="/min-side">Åpne Min side</a>
      <a className="btn alt" href={backUrl}>{unit==="rental"?"Tilbake til utleie":"Tilbake til produkter"}</a>
     </div>
    </div>
   </div>
  </section>
 </main>;
}
