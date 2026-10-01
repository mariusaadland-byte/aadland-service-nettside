"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

const labels={
 clientId:"client_id",
 clientSecret:"client_secret",
 subscriptionKey:"Ocp-Apim-Subscription-Key",
 msn:"Merchant Serial Number (MSN)"
};

export default function VippsStatusClient(){
 const [data,setData]=useState(null);
 const [error,setError]=useState("");

 useEffect(()=>{
  fetch("/api/admin/vipps-status")
   .then(async response=>{
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||"Vipps-status kunne ikke hentes.");
    return body;
   })
   .then(setData)
   .catch(err=>setError(err.message||"Vipps-status kunne ikke hentes."));
 },[]);

 return <main className="admin">
  <div className="adminPageTop">
   <div>
    <div className="kicker">BETALING</div>
    <h1>Vipps-oppsett</h1>
    <p className="muted">Kontrollside for de to salgsstedene. Ingen API-nøkler eller hemmeligheter vises her.</p>
   </div>
   <Link className="btn alt" href="/admin">← Backoffice</Link>
  </div>

  {error&&<p className="notice">{error}</p>}
  {!data&&!error&&<p className="muted">Laster Vipps-status …</p>}

  {data&&<>
   <div className="notice">
    <b>Miljø: {data.environment==="test"?"TEST":"PRODUKSJON"}</b><br/>
    <span>Selve ePayment-flyten er {data.paymentIntegrationImplemented?"implementert":"ikke aktivert ennå"}. Denne siden kontrollerer bare at salgsstedenes konfigurasjon holdes adskilt.</span>
   </div>

   <div className="grid" style={{alignItems:"start"}}>
    {data.units.map(unit=><section className="card" key={unit.unit}>
     <div className="kicker">{unit.unit==="rental"?"UTLEIE":"SERVICE"}</div>
     <h3>{unit.label}</h3>
     <p><b>{unit.configured?"✓ Konfigurasjon komplett":"Ikke ferdig konfigurert"}</b></p>
     <div className="customerCardMeta">
      <span><small>client_id</small><b>{unit.clientIdConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>client_secret</small><b>{unit.clientSecretConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>Subscription key</small><b>{unit.subscriptionKeyConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>MSN</small><b>{unit.msnConfigured?"✓ satt":"mangler"}</b></span>
     </div>
     {!unit.configured&&<p className="muted">Mangler: {unit.missing.map(key=>labels[key]||key).join(", ")}.</p>}
    </section>)}
   </div>

   <section className="card" style={{marginTop:24}}>
    <div className="kicker">PLANLAGT KOBLING</div>
    <h3>Automatisk valg av riktig salgssted</h3>
    <p><code>aadland-service.no</code> → Aadland Service</p>
    <p><code>aadlandutleie.no</code> → Aadland Utleie</p>
    <p className="muted">Når ePayment implementeres, hentes credentials server-side ut fra domenet/handelsflyten. Hemmelighetene skal aldri sendes til nettleseren.</p>
   </section>
  </>}
 </main>;
}
