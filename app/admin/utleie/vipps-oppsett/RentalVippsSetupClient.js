"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import styles from "./rentalVippsSetup.module.css";

const CREDENTIALS=[
 ["VIPPS_RENTAL_CLIENT_ID","Client ID"],
 ["VIPPS_RENTAL_CLIENT_SECRET","Client Secret"],
 ["VIPPS_RENTAL_SUBSCRIPTION_KEY","Subscription Key"],
 ["VIPPS_RENTAL_MSN","Merchant Serial Number (MSN)"]
];
const FIELD_KEYS={
 clientId:"VIPPS_RENTAL_CLIENT_ID",
 clientSecret:"VIPPS_RENTAL_CLIENT_SECRET",
 subscriptionKey:"VIPPS_RENTAL_SUBSCRIPTION_KEY",
 msn:"VIPPS_RENTAL_MSN"
};
const CHECKS=[
 ["credentials","API-nøkler"],
 ["apiConnection","Vipps API-kontakt"],
 ["webhookStored","Webhook lagret"],
 ["webhookFoundAtVipps","Webhook registrert hos Vipps"],
 ["webhookIdMatches","Webhook-ID"],
 ["callbackUrlMatches","Callback-adresse"],
 ["eventsComplete","Betalingshendelser"],
 ["msnMatches","Riktig salgssted (MSN)"],
 ["noDuplicateCallback","Ingen duplikat-webhooks"],
 ["oneLocalActiveWebhook","Én aktiv webhook"]
];
export default function RentalVippsSetupClient(){
 const [status,setStatus]=useState(null);
 const [loading,setLoading]=useState(true);
 const [checking,setChecking]=useState(false);
 const [diagnostics,setDiagnostics]=useState(null);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  const response=await fetch("/api/admin/vipps-status",{cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"Vipps-status kunne ikke kontrolleres.");
  const rental=(data.units||[]).find(x=>x.unit==="rental");
  if(!rental)throw Error("Finner ikke status for Aadland Utleie.");
  setStatus({rental,environment:data.environment});
  return rental;
 },[]);
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{await load()}catch(e){if(active)setError(e.message)}
   finally{if(active)setLoading(false)}
  })();
  return()=>{active=false};
 },[load]);
 async function refresh(){
  setError("");setLoading(true);setDiagnostics(null);
  try{await load()}catch(e){setError(e.message)}
  finally{setLoading(false)}
 }
 async function verify(){
  if(checking||!status?.rental?.configured)return;
  setChecking(true);setError("");setDiagnostics(null);
  try{
   const response=await fetch("/api/admin/vipps-diagnostics",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({unit:"rental"}),cache:"no-store"
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)
    throw Error(data.error||"Vipps-kontrollen kunne ikke fullføres.");
   setDiagnostics(data);
  }catch(e){setError(e.message)}
  finally{setChecking(false)}
 }
 const rental=status?.rental;
 const missing=(rental?.missing||[]).map(key=>FIELD_KEYS[key]||key);
 const nextStep=!rental?0:!rental.configured?1:!rental.webhook?2:
  !diagnostics?.readyForEnable?3:4;
 const safeToTest=Boolean(rental?.configured&&rental?.webhook&&diagnostics?.readyForEnable);
 return <main className={styles.page}>
  <div className={styles.container}>
   <header className={styles.heading}>
    <Link href="/admin/utleie" className={styles.back}>← Utleieoversikt</Link>
    <p className={styles.eyebrow}>AADLAND UTLEIE · EGET VIPPS-SALGSSTED</p>
    <h1>Koble Vipps til utleie</h1>
    <p>Her ser du hva som er klart og hva som mangler.
     Aadland Service og Aadland Utleie holdes atskilt.
     Denne siden oppretter ingen betalinger og aktiverer ikke Vipps for kunder.</p>
   </header>
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {loading&&<p className={styles.loading} role="status">Kontrollerer Vipps-oppsett …</p>}
   {rental&&<section className={styles.status} aria-label="Vipps-status for Aadland Utleie">
    <div className={styles.statusHead}>
     <div><strong>Utleie: {rental.configured?"API-nøkler registrert":"venter på API-nøkler"}</strong>
      <p>{status.environment==="test"?"Testmiljø":"Produksjonsmiljø"} ·
       Webhook {rental.webhook?"registrert":"mangler"}</p>
     </div>
     <button type="button" onClick={refresh} disabled={loading||checking}>
      Oppdater status
     </button>
    </div>
    <div className={styles.flags}>
     <span>Betalingsmotor: <b>{rental.enabled?"PÅ":"AV"}</b></span>
     <span>Kundebetalinger: <b>{rental.publicEnabled?"PÅ":"AV"}</b></span>
     <span>Oppsett: <b>{rental.configured?"4 av 4 nøkler":"Ikke ferdig"}</b></span>
    </div>
    {(rental.enabled||rental.publicEnabled)&&!safeToTest&&
     <p className={styles.danger} role="alert">
      Betaling er aktivert før alle kontroller er godkjent. Ikke start
      en virkelig utleiebetaling før salgssted, webhook og kvitteringsflyt
      er bekreftet.
     </p>}
   </section>}
   <div className={styles.steps}>
    <section className={styles.step} aria-label="Trinn 1 Vipps-salgssted">
     <div className={styles.stepHead}>
      <strong>1. Opprett og finn utleiesalgsstedet</strong>
      <span>{nextStep>1?"Kontroller videre":"Gjør dette først"}</span>
     </div>
     <p>Logg inn i Vipps-bedriftsportalen og opprett eller velg
      salgsstedet <strong>Aadland Utleie</strong> med produktet
      <strong> Integrert betaling (ePayment)</strong>.
      Under «For utviklere» velger du produksjon og åpner nøklene
      for akkurat utleiesalgsstedet.</p>
     <a href="https://portal.vippsmobilepay.com" target="_blank"
      rel="noopener noreferrer" className={styles.primaryLink}>
      Åpne Vipps-bedriftsportalen
     </a>
    </section>
    <section className={styles.step} aria-label="Trinn 2 produksjonsnøkler">
     <div className={styles.stepHead}>
      <strong>2. Legg nøklene trygt inn i Vercel</strong>
      <span>{rental?.configured?"Kontrollert via server":"Mangler"}</span>
     </div>
     <p>Åpne <strong>Vercel → Aadland Service-prosjektet → Settings →
      Environment Variables</strong>. Legg inn verdiene for
      <strong> Production</strong> på disse fire variablene:</p>
     <div className={styles.keyList}>
      {CREDENTIALS.map(([key,label])=><div key={key}>
       <span>{label}</span>
       <code>{key}</code>
       <b>{rental?missing.includes(key)?"Mangler":"Registrert":"Sjekker"}</b>
      </div>)}
     </div>
     <p className={styles.tip}>Ikke send hemmelige nøkler eller passord i chatten,
      og ikke legg dem i kode eller i et synlig felt på hjemmesiden.
      Når Vercel-variablene er lagret, må prosjektet publiseres på nytt
      før serveren kan bruke dem.</p>
     <a href="https://vercel.com/dashboard" target="_blank"
      rel="noopener noreferrer" className={styles.secondaryLink}>
      Åpne Vercel-dashboard
     </a>
    </section>
    <section className={styles.step} aria-label="Trinn 3 Webhook">
     <div className={styles.stepHead}>
      <strong>3. Registrer utleie-webhook</strong>
      <span>{rental?.webhook?"Registrert":"Ikke bekreftet"}</span>
     </div>
     <p>Når de fire nøklene er registrert og produksjonsversjonen er oppdatert,
      åpner du eksisterende <strong>Vipps-oppsett</strong> på nettsiden.
      Velg <strong>Aadland Utleie → Registrer webhook</strong>.
      Webhook håndterer betalingsstatus, kvitteringer og refusjoner.
      Dette er et teknisk oppsett, ikke en betaling.</p>
     <Link href="/admin/vipps" className={styles.secondaryLink}>
      Åpne Vipps-oppsett
     </Link>
    </section>
    <section className={styles.step} aria-label="Trinn 4 teknisk kontroll">
     <div className={styles.stepHead}>
      <strong>4. Kontroller koblingen til Vipps</strong>
      <span>{diagnostics?.readyForEnable?"Teknisk klar":"Må testes"}</span>
     </div>
     <p>Knappen under kontrollerer API-tilgang, MSN, webhook,
      hendelsene og at det ikke finnes flere aktive registreringer.
      Den oppretter ikke en Vipps-betaling.</p>
     <button type="button" className={styles.verify}
      onClick={verify} disabled={checking||loading||!rental?.configured}>
      {checking?"Kontrollerer …":"Test oppsett uten betaling"}
     </button>
     {diagnostics&&<div className={styles.testResults} role="status">
      <strong>{diagnostics.readyForEnable?
       "Alle tekniske kontroller bestått":"Dette mangler fortsatt:"}</strong>
      {CHECKS.map(([key,label])=><div key={key}>
       <span>{label}</span>
       <b>{diagnostics.checks?.[key]?"OK":"Må rettes"}</b>
      </div>)}
     </div>}
    </section>
    <section className={styles.lastStep} aria-label="Trinn 5 ekte utleietest">
     <div className={styles.stepHead}>
      <strong>5. Siste test før godkjenning</strong>
      <span>{safeToTest?"Klar for kontrollert test":"Venter på oppsett"}</span>
     </div>
     <p>Før vi godkjenner hele utleieoppgaven, må vi kontrollere
      riktig salgssted og bank, en reell eller godkjent testbetaling,
      riktig leiebeløp, separat depositum, callback/webhook,
      bookingstatus og kvittering.</p>
     <p><strong>Viktig:</strong> VIPPS_RENTAL_PAYMENTS_ENABLED og
      VIPPS_RENTAL_PUBLIC_PAYMENTS_ENABLED skal forbli AV
      til du uttrykkelig godkjenner aktivering etter disse kontrollene.
      Å slå på ekte betaling krever en egen beslutning.</p>
     <div className={styles.actions}>
      <Link href="/admin/utviklingsplan" className={styles.secondaryLink}>
       Åpne siste godkjenningstest
      </Link>
      <Link href="/admin/utleie" className={styles.secondaryLink}>
       Åpne utleiekalender
      </Link>
     </div>
    </section>
   </div>
  </div>
 </main>;
}
