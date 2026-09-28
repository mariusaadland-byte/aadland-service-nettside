"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

const labels={
 disabled:"Vipps er slått av",
 missing_configuration:"Vipps mangler konfigurasjon",
 environment_mismatch:"Vipps-miljøet er feil",
 ready:"Vipps er klar"
};

export default function VippsSetupClient(){
 const [data,setData]=useState(null);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 async function load(){
  setError("");
  const response=await fetch("/api/admin/vipps/setup",{cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){setError(result.error||"Vipps-oppsettet kunne ikke hentes.");return}
  setData(result);
 }

 useEffect(()=>{load()},[]);

 async function action(name,extra={}){
  setBusy(name);setMessage("");setError("");
  try{
   const response=await fetch("/api/admin/vipps/setup",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:name,...extra})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Handlingen feilet.");
   if(name==="test-connection")setMessage("Vipps-forbindelsen fungerer. Fant "+result.count+" registrerte webhook"+(result.count===1?"":"er")+".");
   if(name==="register-webhook")setMessage("Webhook er registrert hos Vipps og hemmeligheten er lagret privat i Supabase.");
   if(name==="delete-webhook")setMessage("Webhooken er slettet.");
   await load();
  }catch(err){setError(err.message||"Handlingen feilet.")}
  finally{setBusy("")}
 }

 if(!data&&!error)return <main className="admin"><section className="adminmain" style={{marginLeft:0,maxWidth:900}}><p>Henter Vipps-oppsett …</p></section></main>;

 const status=data?.status||{};
 const missing=Array.isArray(status.missing)?status.missing:[];

 return <main className="admin">
  <section className="adminmain" style={{marginLeft:0,maxWidth:900}}>
   <Link href="/admin">← Tilbake til backoffice</Link>
   <div className="kicker" style={{marginTop:28}}>BETALING</div>
   <h1>Vipps-oppsett</h1>

   {error&&<p className="notice">{error}</p>}
   {message&&<p className="success">{message}</p>}

   <div className="card">
    <h3>Status</h3>
    <div className="orderPaymentFacts">
     <span><small>Vipps</small><b>{labels[status.reason]||status.reason||"Ukjent"}</b></span>
     <span><small>Vipps-miljø</small><b>{status.environment==="production"?"Produksjon":"Test"}</b></span>
     <span><small>Vercel</small><b>{data?.vercelEnvironment||"Ukjent"}</b></span>
     <span><small>Webhook-bypass</small><b>{data?.bypassConfigured?"Klar":"Mangler"}</b></span>
    </div>
    {missing.length>0&&<div className="notice" style={{marginTop:16}}>
     <b>Mangler i Vercel-miljøet</b>
     <p style={{marginBottom:0}}>{missing.join(", ")}</p>
    </div>}
    {data?.connectionError&&<p className="notice">{data.connectionError}</p>}
    <div className="rentalBookingActions" style={{marginTop:16}}>
     <button className="btn alt" type="button" disabled={!status.enabled||busy} onClick={()=>action("test-connection")}>{busy==="test-connection"?"Tester …":"Test Vipps-forbindelsen"}</button>
     <button className="btn" type="button" disabled={!status.enabled||busy||(data?.vercelEnvironment==="preview"&&!data?.bypassConfigured)} onClick={()=>action("register-webhook")}>{busy==="register-webhook"?"Registrerer …":"Registrer webhook"}</button>
    </div>
   </div>

   <div className="card" style={{marginTop:18}}>
    <h3>Webhook</h3>
    {!data?.webhooks?.length?<p className="muted">Ingen webhooks er registrert for dette Vipps-miljøet ennå.</p>:
     <div className="grid">{data.webhooks.map(webhook=><div key={webhook.id} className="orderPaymentPanel">
      <b>{webhook.url||"Vipps webhook"}</b>
      <p className="muted" style={{wordBreak:"break-all"}}>ID: {webhook.id}</p>
      <p className="muted">{webhook.events?.length||0} eventtyper</p>
      <button className="btn alt" type="button" disabled={busy} onClick={()=>window.confirm("Slette denne webhooken hos Vipps?")&&action("delete-webhook",{webhookId:webhook.id})}>Slett webhook</button>
     </div>)}</div>}
   </div>

   <div className="card" style={{marginTop:18}}>
    <h3>Før test</h3>
    <p className="muted">Vipps er fortsatt av helt til Preview har testnøkler og <b>VIPPS_ENABLED=true</b>. Preview-beskyttelsen krever også Vercel Protection Bypass for Automation slik at Vipps kan nå webhooken.</p>
    <p className="muted">Webhook-hemmeligheten lagres automatisk i Supabase og vises ikke i nettleseren.</p>
   </div>
  </section>
 </main>;
}
