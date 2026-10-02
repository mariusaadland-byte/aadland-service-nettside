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
    <b>Miljø: {data.environment==="test"?"TEST":"PRODUKSJON"} · Betalingsmotor: {data.enabled?"PÅ":"AV"}</b><br/>
    <span>ePayment-grunnmuren er {data.paymentIntegrationFoundation?"bygget":"ikke ferdig"}, mens kundebetalingen er {data.paymentIntegrationImplemented?"koblet inn":"fortsatt deaktivert"}. Betalingsmotoren må være AV til testnøkler/webhooks er kontrollert.</span>
   </div>

   <div className="grid" style={{alignItems:"start"}}>
    {data.units.map(unit=><section className="card" key={unit.unit}>
     <div className="kicker">{unit.unit==="rental"?"UTLEIE":"SERVICE"}</div>
     <h3>{unit.label}</h3>
     <p><b>{unit.configured&&unit.webhook?"✓ Teknisk konfigurasjon komplett":unit.configured?"API-nøkler klare · webhook mangler":"Ikke ferdig konfigurert"}</b></p>
     <div className="customerCardMeta">
      <span><small>client_id</small><b>{unit.clientIdConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>client_secret</small><b>{unit.clientSecretConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>Subscription key</small><b>{unit.subscriptionKeyConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>MSN</small><b>{unit.msnConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>Webhook</small><b>{unit.webhook?"✓ registrert":"mangler"}</b></span>
     </div>
     {!unit.configured&&<p className="muted">Mangler: {unit.missing.map(key=>labels[key]||key).join(", ")}.</p>}
     {unit.webhook&&<p className="muted">Webhook aktiv · sist oppdatert {unit.webhook.updatedAt?new Date(unit.webhook.updatedAt).toLocaleString("nb-NO"):"ukjent"}. Secret lagres privat og vises aldri.</p>}
    </section>)}
   </div>

   <section className="card" style={{marginTop:24}}>
    <div className="kicker">PLANLAGT KOBLING</div>
    <h3>Automatisk valg av riktig salgssted</h3>
    <p><code>aadland-service.no</code> → Aadland Service</p>
    <p><code>aadlandutleie.no</code> → Aadland Utleie</p>
    <p className="muted">Serveren har nå egne ePayment-klienter for opprettelse, status, capture, cancel og refund. Kundeknappene er fortsatt ikke aktivert. Credentials hentes server-side og hemmeligheter sendes aldri til nettleseren.</p>
   </section>
  </>}
 </main>;
}
