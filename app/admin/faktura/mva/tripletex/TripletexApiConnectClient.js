"use client";
import {useEffect,useState} from "react";
import styles from "./TripletexReceipts.module.css";

const url="/api/admin/tripletex/connection";
const empty={configured:false,environment:null,verifiedAt:null,directInvoiceTransferEnabled:false};

export default function TripletexApiConnectClient(){
 const [state,setState]=useState(empty);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [key,setKey]=useState(""),[environment,setEnvironment]=useState("production");
 const [error,setError]=useState(""),[info,setInfo]=useState(""),[access,setAccess]=useState(null);
 useEffect(()=>{
  let active=true;
  fetch(url,{cache:"no-store"}).then(async r=>{
   const v=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(v.error||"Kunne ikke hente API-status.");
   if(active)setState(v);
  }).catch(e=>{if(active)setError(e.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 async function run(action){
  if(busy)return;
  if(action==="connect"&&(key.trim().length<30||
   !window.confirm("Vil du kontrollere og lagre Tripletex API-nøkkelen kryptert på Aadland Service? "+
    "Velg riktig Tripletex-miljø. Dette overfører ingen fakturaer.")))return;
  if(action==="disconnect"&&!window.confirm(
   "Koble fra Tripletex API? Dette sletter kun nøkkelen, ikke fakturaene eller overføringshistorikken."))return;
  setBusy(true);setError("");setInfo("");
  try{
   const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     action,
     ...(action==="connect"?{refreshToken:key.trim(),environment}:{}),
     ...(action==="disconnect"?{confirmed:true}:{})
    })});
   const v=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(v.error||"Tripletex svarte ikke som forventet.");
   setState(v);setAccess(v.connectionTest?.access||null);
   if(action==="connect")setKey("");
   setInfo(v.message||(v.connectionTest?.connected?
    "Tilkoblingen ble testet mot Tripletex.":"API-status oppdatert."));
  }catch(e){setError(e.message||"Kunne ikke gjennomføre handlingen.")}
  finally{setBusy(false);}
 }
 const status=state.configured?"Tilkoblet":"Ikke koblet til";
 return <section className={styles.section} id="tripletex-api">
  <h2 style={{fontSize:22,margin:"0 0 8px"}}>Direktekobling til Tripletex (API)</h2>
  <p className={styles.hint}>Med API slipper du etter hvert å laste opp CSV-filer.
   Tilkoblingen settes opp først, og deretter kontrollerer vi kunder, avgiftskoder og betalinger
   før vi aktiverer direkte bokføring. <strong>Ingenting blir sendt til Tripletex bare ved å koble til.</strong></p>
  {loading&&<p role="status">Henter tilkoblingsstatus …</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {info&&<p role="status" className={styles.progress}>{info}</p>}
  {!loading&&<>
   <div className={styles.stats} style={{maxWidth:620}}>
    <div className={styles.stat}><strong style={{fontSize:18}}>{status}</strong><span>API-forbindelse</span></div>
    <div className={styles.stat}><strong style={{fontSize:18}}>{state.environment==="production"?"Produksjon":
     state.environment==="test"?"Test":"–"}</strong><span>Tripletex-miljø</span></div>
    <div className={styles.stat}><strong style={{fontSize:18}}>{state.directInvoiceTransferEnabled?"Klar":"Sperret"}</strong>
     <span>Direkte fakturabokføring</span></div>
   </div>
   {state.configured?<div className={styles.actions}>
    <button type="button" className={styles.primary} disabled={busy} onClick={()=>run("check")}>
     {busy?"Tester …":"Test API-tilkoblingen"}</button>
    <button type="button" disabled={busy} onClick={()=>run("disconnect")}>
     Koble fra API</button>
   </div>:<>
    <p className={styles.hint}><strong>Slik kobler du til:</strong> Åpne Tripletex → Bedrift → API-tokens.
     Opprett en JWT-nøkkel for Aadland Service. Integrasjoner må være aktivert i Tripletex.
     Lim nøkkelen inn i dette feltet, ikke i ChatGPT.
     <a className={styles.link} href="https://developer.tripletex.no/docs/documentation/authentication-and-tokens/"
      target="_blank" rel="noreferrer"> Tripletex sin veiledning</a>.</p>
    <div className={styles.inputs}>
     <label>Tripletex-miljø
      <select value={environment} disabled={busy}
       onChange={e=>setEnvironment(e.target.value)}>
       <option value="production">Min ekte Tripletex-konto</option>
       <option value="test">Tripletex testkonto</option>
      </select>
     </label>
     <label>JWT API-nøkkel
      <input type="password" value={key} autoComplete="new-password" spellCheck={false}
       placeholder="Lim inn nøkkelen fra Tripletex" disabled={busy}
       onChange={e=>setKey(e.target.value)}/>
     </label>
    </div>
    <div className={styles.actions}>
     <button type="button" className={styles.primary} disabled={busy||key.trim().length<30}
      onClick={()=>run("connect")}>{busy?"Kontrollerer …":"Koble til og test Tripletex"}</button>
    </div>
   </>}
   {access&&<p className={styles.hint} role="status">API-tilganger:
    {" "}Kunder {access.customer?"✓":"mangler"} · Fakturaer {access.invoices?"✓":"mangler"} ·
    Betalingstyper {access.paymentTypes?"✓":"mangler"} · MVA-koder {access.vatTypes?"✓":"mangler"}.
   </p>}
   {state.configured&&<p className={styles.hint}>Sist bekreftet:
    {" "}{state.verifiedAt?new Date(state.verifiedAt).toLocaleString("nb-NO"):"–"}.
    API-et kan nå testes. Direkte opprettelse av regnskapsfakturaer er fortsatt sperret
    frem til vi har verifisert mapping og gjennomført en kontrollert pilot.
    CSV-importen er fortsatt tilgjengelig.</p>}
  </>}
 </section>;
}
