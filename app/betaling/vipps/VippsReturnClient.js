"use client";

import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";

const finalStates=new Set(["AUTHORIZED","ABORTED","EXPIRED","TERMINATED","CANCELLED"]);

export default function VippsReturnClient(){
 const params=useSearchParams();
 const reference=String(params.get("reference")||"");
 const [status,setStatus]=useState({loading:true,state:"",paymentStatus:"",orderNumber:""});
 const [error,setError]=useState("");

 useEffect(()=>{
  if(!/^[a-zA-Z0-9-]{8,64}$/.test(reference)){setStatus({loading:false});setError("Betalingsreferansen mangler eller er ugyldig.");return}
  let cancelled=false,timer=null,attempt=0;
  async function poll(){
   if(cancelled)return;
   attempt+=1;
   try{
    const response=await fetch("/api/payments/vipps/status?reference="+encodeURIComponent(reference),{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Betalingsstatus kunne ikke hentes.");
    if(cancelled)return;
    setStatus({loading:false,...data});
    setError("");
    if(finalStates.has(String(data.state||"").toUpperCase())||["paid","refunded","cancelled"].includes(data.paymentStatus))return;
   }catch(err){
    if(!cancelled&&attempt>2)setError(err.message||"Betalingsstatus kunne ikke bekreftes akkurat nå.");
   }
   if(!cancelled&&attempt<25)timer=setTimeout(poll,attempt===1?5000:2000);
  }
  poll();
  return()=>{cancelled=true;if(timer)clearTimeout(timer)};
 },[reference]);

 const state=String(status.state||"").toUpperCase();
 const authorized=state==="AUTHORIZED"||status.paymentStatus==="authorized"||status.paymentStatus==="paid";
 const stopped=["ABORTED","EXPIRED","TERMINATED","CANCELLED"].includes(state)||status.paymentStatus==="cancelled";

 return <main className="catalogPage">
  <section className="section vippsReturnSection">
   <div className="wrap">
    <div className="card vippsReturnCard">
     <div className="kicker">VIPPS</div>
     {status.loading&&!error&&<><h1>Sjekker betalingen …</h1><p className="muted">Vi bekrefter status direkte mot Vipps.</p></>}
     {!status.loading&&authorized&&<><h1>Betalingen er godkjent</h1><p>Beløpet er reservert i Vipps. Det trekkes senere når varen eller tjenesten kan belastes.</p>{status.orderNumber&&<p><b>Ordrenummer:</b> {status.orderNumber}</p>}<div className="customerOrderSuccessActions"><a className="btn" href="/min-side">Åpne Min side</a><a className="btn alt" href="/produkter">Tilbake til produkter</a></div></>}
     {!status.loading&&stopped&&<><h1>Betalingen ble ikke fullført</h1><p className="muted">Ingen betaling er trukket. Lagerreservasjonen frigjøres automatisk når Vipps bekrefter at betalingen er avbrutt eller utløpt.</p><a className="btn" href="/produkter">Tilbake til produkter</a></>}
     {!status.loading&&!authorized&&!stopped&&!error&&<><h1>Venter på bekreftelse</h1><p className="muted">Vipps har ikke bekreftet betalingen ennå. Denne siden oppdaterer status automatisk.</p></>}
     {error&&<><h1>Vi fikk ikke bekreftet status</h1><p className="notice">{error}</p><p className="muted">Bestillingen kan fortsatt være registrert. Du kan kontrollere den på Min side eller prøve igjen om litt.</p><div className="customerOrderSuccessActions"><a className="btn" href="/min-side">Åpne Min side</a><a className="btn alt" href="/produkter">Tilbake til produkter</a></div></>}
    </div>
   </div>
  </section>
 </main>;
}
