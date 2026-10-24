"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
export default function SystimaConnectionClient(){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 async function refresh(){
  const res=await fetch("/api/admin/systima",{cache:"no-store"});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||"Kunne ikke hente Systima-status.");
  setStatus(data);
 }
 useEffect(()=>{
  let alive=true;
  fetch("/api/admin/systima",{cache:"no-store"}).then(async res=>{
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"Status er utilgjengelig.");
   if(alive)setStatus(data);
  }).catch(e=>{if(alive)setError(e.message);});
  const url=new URLSearchParams(window.location.search);
  const reason=url.get("status");
  const labels={
   authorized:"OAuth-tilgang er lagret sikkert. Bilagslesing er fortsatt sperret til lese-API-et er verifisert.",
   denied:"Tilkoblingen krever innlogging som eier.",
   disabled:"OAuth er deaktivert utenfor produksjon.",
   "not-configured":"Systima-konfigurasjonen er ikke ferdig.",
   "invalid-state":"Tilkoblingen ble avvist fordi sikkerhetskoden ikke stemte. Start på nytt.",
   "invalid-callback":"Systima sendte en ugyldig tilbakekobling.",
   "authorization-failed":"Systima-autorisasjonen kunne ikke bekreftes. Ingen tilkobling ble lagret.",
   "storage-error":"Tilgangen kunne ikke lagres sikkert. Ingen bilagslesing ble aktivert."
  };
  if(reason&&labels[reason])setNotice(labels[reason]);
  return()=>{alive=false};
 },[]);
 async function start(){
  if(busy||!status?.connectionAvailable)return;
  if(!window.confirm("Vil du gå til Systima for å godkjenne en OAuth-tilkobling? "+
   "Aadland Service lagrer tilgangstoken kryptert, men henter ingen fakturaer før lese-API er verifisert."))return;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/admin/systima",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"start",confirmed:true})
   });
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"Kunne ikke starte Systima-innlogging.");
   const next=new URL(data.authorizeUrl);
   if(next.origin!=="https://app.systima.no"||next.pathname!=="/oauth/login")
    throw Error("Uventet autorisasjonsadresse.");
   window.location.assign(next.toString());
  }catch(e){setError(e.message);setBusy(false);}
 }
 async function manage(action){
  if(busy||!status?.hasAuthorization)return;
  if(action==="refresh"&&!status.connectionAvailable)return;
  const question=action==="disconnect"?
   "Fjerne lagrede Systima-token fra Aadland Service? Dette stanser lokal bruk, men du må eventuelt trekke tilbake tilgangen i Systima også. Ingen regnskapsbilag slettes.":
   "Be Systima om nye tilgangstoken? Ingen fakturaer eller regnskapsdata blir hentet.";
  if(!window.confirm(question))return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/systima/credentials",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,confirmed:true})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Handlingen kunne ikke gjennomføres.");
   await refresh();
   setNotice(action==="disconnect"?
    "Den lokale Systima-tilkoblingen er fjernet. Opphev også tilgangen hos Systima ved behov.":
    "Tilgangstoken er fornyet. Lesing av leverandørbilag er fortsatt sperret.");
  }catch(e){setError(e.message||"Kunne ikke oppdatere Systima-tilkoblingen.");}
  finally{setBusy(false);}
 }
 return <main className="admin" style={{maxWidth:850,margin:"auto",padding:24}}>
  <p><Link href="/admin/faktura/mva">← Tilbake til MVA-avstemming</Link></p>
  <h1>Systima – tilkoblingskontroll</h1>
  <p>Her klargjør vi en framtidig <strong>lesebasert import av leverandørbilag</strong>.
   Dette er ikke en aktiv automatisk integrasjon, og ingenting blir bokført eller hentet ennå.</p>
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {!status?<p>Kontrollerer tilkoblingsstatus …</p>:<>
   <section className="card" style={{padding:18,marginBottom:16}}>
    <h2>Status</h2>
    <p><strong>Oppsett:</strong> {status.connectionAvailable?"Konfigurert for eiergodkjenning":
     status.enabled?"Delvis konfigurert – må fullføres":"Ikke aktivert"}</p>
    <p><strong>OAuth-godkjenning:</strong> {status.hasAuthorization?
     "Krypterte tilgangstoken lagret":"Ikke tilkoblet"}</p>
    {status.authorizedAt&&<p>Sist godkjent: {new Date(status.authorizedAt).toLocaleString("nb-NO")}</p>}
    <p><strong>Tokenstatus:</strong> {{
     not_connected:"Ingen lagrede tilgangstoken",
     token_stored:"Token lagret – ingen API-lesing aktivert",
     unknown_expiry:"Token lagret, men Systima-datoene kunne ikke verifiseres",
     expiring:"Tilgangstoken går snart ut",
     needs_refresh:"Tilgangstoken er utløpt og må fornyes",
     reauthorize:"Fornyingstoken er utløpt – godkjenn Systima på nytt",
     cannot_read:"Kan ikke kontrollere kryptert token – sjekk servernøkkel"
    }[status.tokenHealth?.status]||"Status er ukjent"}</p>
    {status.tokenHealth?.accessExpiresAt&&
     <p style={{fontSize:13}}>Tilgangstoken utløper: {
      new Date(status.tokenHealth.accessExpiresAt).toLocaleString("nb-NO")
     }</p>}
    {status.hasAuthorization&&<div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0"}}>
     <button type="button" onClick={()=>manage("refresh")}
      disabled={busy||!status.connectionAvailable||["cannot_read","reauthorize"].includes(status.tokenHealth?.status)}>
      {busy?"Oppdaterer …":"Forny tilgangstoken"}
     </button>
     <button type="button" onClick={()=>manage("disconnect")} disabled={busy}>
      Koble fra Systima lokalt
     </button>
    </div>}
    <p style={{fontSize:12}}>Frakobling fjerner bare lokale tilgangstoken.
     Selve autorisasjonen må eventuelt trekkes tilbake i Systima.</p>
    <p><strong>Lesing av leverandørfakturaer:</strong> Ikke aktivert.</p>
    <p style={{fontSize:13}}>{status.note}</p>
    {status.connectionAvailable&&<button type="button" disabled={busy} onClick={start}>
     {busy?"Åpner Systima …":"Start sikker Systima-innlogging"}
    </button>}

   </section>
   <section className="card" style={{padding:18,marginBottom:16}}>
    <h2>Dette må være på plass</h2>
    <ol>
     <li>Systima må godkjenne integrasjonen og opprette klient-ID og klienthemmelighet.</li>
     <li>Den tekniske serveren må få sikker tokenadresse, krypteringsnøkkel og riktig tilbakekoblingsadresse.</li>
     <li>Vi må verifisere at eksternt API faktisk støtter lesing av leverandørfakturaer for ditt selskap.</li>
     <li>Deretter kan vi koble bilagsdata til den eksisterende forhåndsvisningen med duplikatkontroll.</li>
    </ol>
    {status.missing?.length>0&&<p style={{fontSize:13}}>
     <strong>Manglende serverinnstillinger:</strong> {status.missing.join(", ")}.
     Verdiene må legges i sikre Vercel-miljøvariabler, aldri i et skjema på nettsiden.
    </p>}
    <p><strong>Tilbakekobling som registreres hos Systima:</strong>{" "}
     <code>https://www.aadland-service.no{status.callbackPath}</code></p>
    <p><a href="https://hjelp.systima.no/support/solutions/articles/150000171542-api-for-3rd-part-and-end-users-systima-"
     target="_blank" rel="noreferrer">Systimas offisielle API- og OAuth-veiledning</a></p>
   </section>
   <p style={{fontSize:13}}>I mellomtiden kan du fortsatt bruke
    <Link href="/admin/faktura/mva"> CSV-import med kontroll før registrering</Link>.
    Den eksisterende MVA-rapporten påvirkes ikke.</p>
  </>}
 </main>;
}
