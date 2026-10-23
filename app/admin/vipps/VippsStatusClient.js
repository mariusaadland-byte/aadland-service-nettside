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
 const [message,setMessage]=useState("");
 const [savingUnit,setSavingUnit]=useState("");
 const [diagnostics,setDiagnostics]=useState({});

 async function load(){
  const response=await fetch("/api/admin/vipps-status");
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||"Vipps-status kunne ikke hentes.");
  setData(body);
 }
 useEffect(()=>{load().catch(err=>setError(err.message||"Vipps-status kunne ikke hentes."))},[]);

 async function registerWebhook(unit,replace=false){
  setError("");setMessage("");
  if(replace&&!window.confirm("Registrere en ny webhook og erstatte den aktive for "+unit.label+"?"))return;
  setSavingUnit(unit.unit);
  try{
   const response=await fetch("/api/admin/vipps-webhook",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({unit:unit.unit,replace})
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.error||"Webhooken kunne ikke registreres.");
   setMessage((body.warning?body.warning+" ":"")+"Webhook er registrert for "+unit.label+".");
   await load();
  }catch(err){
   setError(err.message||"Webhooken kunne ikke registreres.");
  }finally{
   setSavingUnit("");
  }
 }

 async function testSetup(unit){
  setError("");setMessage("");
  setSavingUnit(unit.unit);
  try{
   const response=await fetch("/api/admin/vipps-diagnostics",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({unit:unit.unit})
   });
   const body=await response.json().catch(()=>({}));
   setDiagnostics(prev=>({...prev,[unit.unit]:body}));
   if(!response.ok)throw new Error(body.error||"Vipps-oppsettet kunne ikke testes.");
   setMessage(body.readyForEnable
    ?unit.label+" er teknisk klar for aktivering."
    :unit.label+" har kontakt med Vipps, men ett eller flere oppsettspunkter mangler.");
  }catch(err){
   setError(err.message||"Vipps-oppsettet kunne ikke testes.");
  }finally{
   setSavingUnit("");
  }
 }

 return <main className="admin adminStandalonePage">
  <div className="adminPageTop">
   <div>
    <div className="kicker">BETALING</div>
    <h1>Vipps-oppsett</h1>
    <p className="muted">Kontrollside for de to salgsstedene. Ingen API-nøkler eller hemmeligheter vises her.</p>
   </div>
   <div style={{display:"flex",flexWrap:"wrap",gap:8}}><Link className="btn" href="/admin/vipps/test">Prøvekjør Vipps uten betaling</Link><Link className="btn alt" href="/admin">← Backoffice</Link></div>
  </div>

  {error&&<p className="notice">{error}</p>}
  {message&&<p className="notice">{message}</p>}
  {!data&&!error&&<p className="muted">Laster Vipps-status …</p>}

  {data&&<>
   <div className="notice">
    <b>Miljø: {data.environment==="test"?"TEST":"PRODUKSJON"} · Aktivert: {(data.units||[]).filter(unit=>unit.enabled).length} av 2 salgssteder</b><br/>
    <span>Hvert salgssted kan aktiveres uavhengig. Lagrede API-nøkler betyr ikke at Vipps er aktivert. Test API-tilkobling og webhook for hvert salgssted før ekte betalinger slås på.</span>
   </div>

   <div className="grid" style={{alignItems:"start"}}>
    {data.units.map(unit=><section className="card" key={unit.unit}>
     <div className="kicker">{unit.unit==="rental"?"UTLEIE":"SERVICE"}</div>
     <h3>{unit.label}</h3>
     <p><b>Vipps-motor: {unit.enabled?"PÅ":"AV"}</b> · <b>Kundebetaling: {unit.publicEnabled?"PÅ":"AV"}</b></p>
     <p className="muted">{unit.publicEnabled?"Vanlig kunde-Vipps er tilgjengelig når webhooken er klar.":unit.enabled?"Vanlige kundebetalinger er sperret. Bare særskilt godkjent admin-pilot kan startes.":"Ingen ekte Vipps-betalinger kan startes fra dette salgsstedet."}</p>
     <p><b>{unit.configured&&unit.webhook?"✓ Teknisk konfigurasjon komplett":unit.configured?"API-nøkler klare · webhook mangler":"Ikke ferdig konfigurert"}</b></p>
     <div className="customerCardMeta">
      <span><small>client_id</small><b>{unit.clientIdConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>client_secret</small><b>{unit.clientSecretConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>Subscription key</small><b>{unit.subscriptionKeyConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>MSN</small><b>{unit.msnConfigured?"✓ satt":"mangler"}</b></span>
      <span><small>Webhook</small><b>{unit.webhook?"✓ registrert":"mangler"}</b></span>
     </div>
     {!unit.configured&&<p className="muted">Mangler: {unit.missing.map(key=>labels[key]||key).join(", ")}.</p>}
     <p className="muted"><small>Vercel: {unit.unit==="rental"
      ?"VIPPS_RENTAL_CLIENT_ID · VIPPS_RENTAL_CLIENT_SECRET · VIPPS_RENTAL_SUBSCRIPTION_KEY · VIPPS_RENTAL_MSN"
      :"VIPPS_SERVICE_CLIENT_ID · VIPPS_SERVICE_CLIENT_SECRET · VIPPS_SERVICE_SUBSCRIPTION_KEY · VIPPS_SERVICE_MSN"}</small></p>
     {unit.webhook&&<p className="muted">Webhook aktiv · sist oppdatert {unit.webhook.updatedAt?new Date(unit.webhook.updatedAt).toLocaleString("nb-NO"):"ukjent"}. Secret lagres privat og vises aldri.</p>}
     {unit.configured&&<div className="rentalBookingActions">
      <button className="btn alt" type="button" disabled={savingUnit===unit.unit} onClick={()=>testSetup(unit)}>{savingUnit===unit.unit?"Tester …":"Test oppsett"}</button>
      {!unit.webhook&&<button className="btn" type="button" disabled={savingUnit===unit.unit} onClick={()=>registerWebhook(unit)}>{savingUnit===unit.unit?"Registrerer …":"Registrer webhook"}</button>}
      {unit.webhook&&<button className="btn alt" type="button" disabled={savingUnit===unit.unit} onClick={()=>registerWebhook(unit,true)}>{savingUnit===unit.unit?"Registrerer …":"Registrer webhook på nytt"}</button>}
     </div>}
     {unit.configured&&!unit.enabled&&<p className="muted">Du kan teste API-nøkler og webhook mens dette salgsstedet er AV. Aktiver bare når «Test oppsett» er grønn for {unit.label}, og full betalingsflyt er godkjent. Det andre salgsstedet trenger ikke være klart.</p>}
     {unit.unit==="service"&&!unit.publicEnabled&&<div className="notice" style={{marginTop:14}}>
       <strong>Kontrollert prøvebetaling: 1,00 kr</strong>
       <p style={{margin:"8px 0"}}>{unit.pilotEmailConfigured?"Testmottaker er lagret sikkert på serveren.":"Testmottaker mangler på serveren; ingen pilotbetaling kan startes."} Mens vanlig kunde-Vipps er AV, tillater systemet kun en admin-bekreftet Vipps-faktura på nøyaktig 1 kr til den registrerte testadressen, og bare når Vipps-motoren senere er slått på for Service.</p>
       <p style={{margin:"8px 0"}}><b>Viktig:</b> Faktura og betaling blir ekte når piloten startes. Ikke opprett en fiktiv salgsfaktura bare for å teste. Avklar hvordan en eventuell reell testtransaksjon skal dokumenteres og bokføres.</p>
       <p style={{margin:0}}><Link href="/admin/faktura">Åpne fakturakladder</Link> · <Link href="/admin/vipps/test">Prøv simuleringen uten penger</Link></p>
     </div>}
     {diagnostics[unit.unit]&&<div className="customerPaymentConfirmation" style={{marginTop:14}}>
      <b>{diagnostics[unit.unit].readyForEnable?"✓ Klar for aktivering":"Oppsett må fullføres"}</b>
      <span>API-tilkobling: {diagnostics[unit.unit].apiConnection?"✓":"mangler"}</span>
      {diagnostics[unit.unit].checks&&<>
       <span>Webhook lagret lokalt: {diagnostics[unit.unit].checks.webhookStored?"✓":"mangler"}</span>
       <span>Webhook funnet hos Vipps: {diagnostics[unit.unit].checks.webhookFoundAtVipps?"✓":"mangler"}</span>
       <span>Webhook-ID samsvarer: {diagnostics[unit.unit].checks.webhookIdMatches?"✓":"mangler"}</span>
       <span>Callback-URL samsvarer: {diagnostics[unit.unit].checks.callbackUrlMatches?"✓":"mangler"}</span>
       <span>Nødvendige hendelser registrert: {diagnostics[unit.unit].checks.eventsComplete?"✓":"mangler"}</span>
       <span>MSN samsvarer: {diagnostics[unit.unit].checks.msnMatches?"✓":"mangler"}</span>
       <span>Ingen duplikat-webhook på samme URL: {diagnostics[unit.unit].checks.noDuplicateCallback?"✓":"må ryddes"}</span>
       <span>Én aktiv lokal webhook: {diagnostics[unit.unit].checks.oneLocalActiveWebhook?"✓":"må ryddes"}</span>
      </>}
     </div>}
    </section>)}
   </div>

   {Array.isArray(data.captureAlerts)&&data.captureAlerts.length>0&&<section className="card" style={{marginTop:24}}>
    <div className="kicker">MÅ FØLGES OPP</div>
    <h3>Vipps-reservasjoner nær capture-fristen</h3>
    <p className="muted">Viser reserverte betalinger der Vipps sin registrerte capture-frist er passert eller er mindre enn 48 timer unna.</p>
    <div className="adminList">
     {data.captureAlerts.map(item=>{
      const deadline=new Date(item.deadline);
      const hours=Math.round((deadline.getTime()-Date.now())/3600000);
      return <div className="adminListItem" key={item.unit+":"+item.id}>
       <div>
        <b>{item.reference}</b>
        <div className="muted">{item.unit==="rental"?"Aadland Utleie":"Aadland Service"} · Reservert {(Number(item.reservedOre||0)/100).toLocaleString("nb-NO",{style:"currency",currency:"NOK"})}</div>
       </div>
       <div style={{textAlign:"right"}}>
        <b>{item.expired?"UTLØPT":hours<=1?"UNDER 1 TIME":hours+" t igjen"}</b>
        <div className="muted">{deadline.toLocaleString("nb-NO")}</div>
       </div>
      </div>;
     })}
    </div>
    <p style={{marginTop:16}}><Link className="btn alt" href="/admin">Åpne backoffice →</Link></p>
   </section>}

   <section className="card" style={{marginTop:24}}>
    <div className="kicker">AKTIVERINGSREKKEFØLGE</div>
    <h3>Trygg vei fra test til live</h3>
    <div className="adminList">
     <div className="adminListItem"><div><b>1. Legg inn nøklene for ønsket salgssted</b><div className="muted">Aadland Service og Aadland Utleie bruker hver sine produksjonsnøkler og MSN. Ikke legg hemmelige nøkler i denne adminsiden.</div></div></div>
     <div className="adminListItem"><div><b>2. Hold betalingsmotoren AV</b><div className="muted">Webhook kan registreres og API-et kan testes uten at kundene får Vipps-knapper.</div></div></div>
     <div className="adminListItem"><div><b>3. Kjør «Test oppsett» for ønsket salgssted</b><div className="muted">API, webhook-ID, callback, hendelser og MSN må samsvare for salgsstedet du vil aktivere.</div></div></div>
     <div className="adminListItem"><div><b>4. Kjør Vipps testbetaling</b><div className="muted">Test reserve, retur, capture, kvittering, cancel og refund før produksjon.</div></div></div>
     <div className="adminListItem"><div><b>5. Bekreft produksjonsoppsett</b><div className="muted">Før aktivering skal produksjonsnøklene være lagt i Vercel og tilkobling/webhook testet. Produksjonsbuild krever komplett oppsett for salgsstedet som aktiveres.</div></div></div>
     <div className="adminListItem"><div><b>6. Gjennomfør først en isolert Service-test</b><div className="muted">For en avgrenset admin-pilot må <code>VIPPS_SERVICE_PILOT_EMAIL</code> være satt og bare <code>VIPPS_SERVICE_PAYMENTS_ENABLED=true</code> aktiveres. Kundebetalinger holdes fortsatt AV med <code>VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED=false</code>. En 1-kroners pilot begrenses server-side til testmottakeren.</div></div></div>
     <div className="adminListItem"><div><b>7. Åpne for kunder etter godkjent test</b><div className="muted">Først når hele betalings- og kvitteringsløpet fungerer, aktiver <code>VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED=true</code>. Aadland Utleie skal fortsatt være AV, med egne brytere <code>VIPPS_RENTAL_PAYMENTS_ENABLED=true</code> og <code>VIPPS_RENTAL_PUBLIC_PAYMENTS_ENABLED=true</code> først når Utleie er klar. Begge endringer krever ny produksjonsdeploy.</div></div></div>
    </div>
   </section>

   <section className="card" style={{marginTop:24}}>
    <div className="kicker">KOBLING</div>
    <h3>Automatisk valg av riktig salgssted</h3>
    <p><code>aadland-service.no</code> → Aadland Service</p>
    <p><code>aadlandutleie.no</code> → Aadland Utleie</p>
    <p className="muted">Serveren har egne ePayment-klienter for opprettelse, status, capture, cancel og refund. Kundeknappene vises bare når riktig salgssted, webhook og betalingsmotor faktisk er klare. Credentials hentes server-side og hemmeligheter sendes aldri til nettleseren.</p>
   </section>
  </>}
 </main>;
}
