"use client";
import {useEffect,useState} from "react";
import styles from "./TripletexReceipts.module.css";
import TripletexCustomerSyncClient from "./TripletexCustomerSyncClient";
import {transferTripletexInvoiceAsPaid} from "../../../../../lib/tripletexPaidInvoiceFlow";

const url="/api/admin/tripletex/connection";
const empty={configured:false,environment:null,verifiedAt:null,directInvoiceTransferEnabled:false};

export default function TripletexApiConnectClient(){
 const [state,setState]=useState(empty);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [key,setKey]=useState(""),[environment,setEnvironment]=useState("production");
 const [error,setError]=useState(""),[info,setInfo]=useState(""),[access,setAccess]=useState(null);
 const [invoiceOptions,setInvoiceOptions]=useState([]),[selectedInvoice,setSelectedInvoice]=useState("");
 const [preflight,setPreflight]=useState(null);
 const [directPilot,setDirectPilot]=useState(null);
 const [paymentTypes,setPaymentTypes]=useState([]);
 const [paymentTypeIds,setPaymentTypeIds]=useState({bank:"",vipps:""});
 const [paymentTypeError,setPaymentTypeError]=useState("");
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
 async function checkDirectPilot(action){
  if(busy||!selectedInvoice)return;
  const pilot=directPilot,invoiceId=selectedInvoice;
  const paidFlow=action==="transferPaid";
  const transfer=action==="transfer"||paidFlow;
  const paymentChoice={...paymentTypeIds};
  if(transfer){
   if(!pilot?.ready||pilot.invoiceId!==invoiceId)return;
   if(paidFlow){
    if(pilot.paidOre<=0||pilot.paymentCount<1||pilot.paymentCount>10){
     setError("Samlet betalingsoverføring krever 1–10 registrerte innbetalinger.");return;
    }
    if(!(pilot.paymentSources||[]).length||
     (pilot.paymentSources||[]).some(source=>
      !paymentTypes.some(x=>x.id===Number(paymentChoice[source])))){
     setError("Velg riktig Tripletex-betalingstype for bank/Vipps før overføring.");
     return;
    }
   }
   const money=new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"});
   const prompt=paidFlow?
    "OVERFØRE FAKTURAEN SOM BETALT TIL TRIPLETEX?"+
    "\n\nFaktura: "+pilot.sourceNumber+
    "\nTotalbeløp: "+money.format(Number(pilot.grossOre)/100)+
    "\nRegistrert betalt: "+money.format(Number(pilot.paidOre)/100)+
    "\nRegistrerte innbetalinger: "+pilot.paymentCount+
    "\n\nAadland Service bokfører fakturaen uten å sende den til kunden"+
    " og registrerer så innbetalingene med opprinnelige betalingsdatoer."+
    "\n\nDu har valgt riktig bank-/Vipps-konto i Tripletex. Bekreft at"+
    " verken fakturaen eller betalingene allerede er bokført der."+
    "\nVed uavklart feil stopper overføringen og må kontrolleres manuelt.":
    "OPPRETTE EN EKTE FAKTURA I TRIPLETEX?"+
    "\n\nFaktura: "+pilot.sourceNumber+
    "\nTotalbeløp: "+money.format(Number(pilot.grossOre)/100)+
    "\n\nFakturaen sendes IKKE til kunden på nytt."+
    (pilot.paidOre>0?"\nInnbetalinger må deretter registreres separat.":"")+
    "\n\nDette påvirker regnskap og MVA. Fortsett bare hvis fakturaen ikke finnes der fra før.";
   if(!window.confirm(prompt))return;
  }
  setBusy(true);setError("");setInfo("");
  if(paidFlow){
   try{
    const outcome=await transferTripletexInvoiceAsPaid({
     invoiceId,digest:pilot.digest,paymentCount:pilot.paymentCount,
     paymentTypesBySource:paymentChoice,
     onCreated:created=>{
      // The accounting invoice now exists regardless of what happens to
      // its payments. Remove it from all possible invoice-create actions.
      setDirectPilot(null);setPreflight(null);
      setInvoiceOptions(old=>old.filter(x=>x.id!==invoiceId));
      setSelectedInvoice("");
      setInfo("Faktura "+created.tripletexInvoiceNumber+
       " er opprettet. Registrerer "+pilot.paymentCount+" innbetaling(er) …");
     },
     onPayment:(count,total)=>setInfo("Fakturaen er opprettet. "+
      count+" av "+total+" innbetalinger er bekreftet i Tripletex.")
    });
    setInfo("Faktura "+pilot.sourceNumber+" er overført som betalt. "+
     outcome.posted+" innbetaling(er) er bokført med originale datoer."+
     " Tripletex-fakturanummer: "+outcome.created.tripletexInvoiceNumber+
     ". Restbeløpene stemmer i begge systemer.");
   }catch(error){
    if(error.invoiceAttempted){
     setDirectPilot(null);setPreflight(null);
     setInvoiceOptions(old=>old.filter(x=>x.id!==invoiceId));
     setSelectedInvoice("");
    }
    setError(error.message||"Overføringen er uavklart. Kontroller Tripletex.");
   }finally{setBusy(false);}
   return;
  }
  try{
   const resp=await fetch("/api/admin/tripletex/invoices/direct",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:transfer?"transfer":"check",invoiceId,
     ...(transfer?{confirmed:true,digest:pilot.digest}:{})})
   });
   const result=await resp.json().catch(()=>({}));
   if(!resp.ok)throw Error(result.error||"Direkte fakturakontroll feilet.");
   if(!transfer){
    setDirectPilot(result);setPaymentTypes([]);setPaymentTypeIds({bank:"",vipps:""});
    setPaymentTypeError("");
    if(result.paidOre>0&&result.paymentCount<=10){
     const response=await fetch("/api/admin/tripletex/invoices/payment-types",
      {cache:"no-store"});
     const types=await response.json().catch(()=>({}));
     if(!response.ok)
      setPaymentTypeError(types.error||"Kunne ikke hente betalingstyper fra Tripletex.");
     else setPaymentTypes(types.types||[]);
    }
   }else{
    setDirectPilot(null);setPreflight(null);
    setInfo(result.message+" Tripletex-fakturanummer: "+result.tripletexInvoiceNumber+
     ". Fakturaen er fjernet fra listen over gjenstående.");
    setInvoiceOptions(old=>old.filter(x=>x.id!==invoiceId));
    setSelectedInvoice("");
   }
  }catch(e){
   if(transfer)setDirectPilot(null);
   setError(e.message||"Fakturaoverføringen kunne ikke fullføres."+
    " Kontroller historikken før et nytt forsøk.");
  }finally{setBusy(false);}
 }
 async function checkInvoiceMapping(){
  if(busy||!selectedInvoice)return;
  setBusy(true);setError("");setPreflight(null);setDirectPilot(null);
  setPaymentTypes([]);setPaymentTypeIds({bank:"",vipps:""});setPaymentTypeError("");
  try{
   const r=await fetch("/api/admin/tripletex/preview",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({invoiceIds:[selectedInvoice]})
   });
   const out=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(out.error||"Kunne ikke kontrollere fakturaen.");
   setPreflight(out);
  }catch(e){setError(e.message||"Fakturakontroll feilet.")}
  finally{setBusy(false);}
 }
 useEffect(()=>{
  if(!state.configured)return;
  let active=true;
  Promise.all([
   fetch("/api/admin/invoices/tripletex/sales",{cache:"no-store"}),
   fetch("/api/admin/tripletex/invoices/direct",{cache:"no-store"})
  ]).then(async ([r,direct])=>{
    const [v,log]=await Promise.all([
     r.json().catch(()=>({})),direct.json().catch(()=>({}))
    ]);
    if(!r.ok||!direct.ok)throw Error(v.error||log.error||"Kunne ikke hente fakturaer.");
    if(active){
     const previously=new Set((log.claims||[]).map(x=>x.invoiceId));
     const arr=(v.rows||[]).filter(x=>(x.state==="paid"||x.state==="unpaid")&&!previously.has(x.id))
      .map(x=>({id:x.id,label:String(x.originalNumber||"Faktura")+" · "+
       String(x.customerName||"Kunde").slice(0,80)}));
     setInvoiceOptions(arr);
     setSelectedInvoice(old=>arr.some(x=>x.id===old)?old:(arr[0]?.id||""));
    }
   }).catch(()=>{});
  return()=>{active=false};
 },[state.configured]);
 const status=state.configured?"Tilkoblet":"Ikke koblet til";
 return <section className={styles.apiConnection} id="tripletex-api">
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
    <div className={styles.stat}><strong style={{fontSize:18}}>{state.directInvoiceTransferEnabled?"Klar":state.directInvoicePilotEnabled?"Pilot":"Sperret"}</strong>
     <span>Direkte fakturabokføring (generell)</span></div>
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
   {state.configured&&<TripletexCustomerSyncClient/>}
   {state.configured&&<div style={{borderTop:"1px solid #e3dfd9",paddingTop:14,marginTop:16}}>
    <h3 style={{fontSize:17,margin:"0 0 8px"}}>Forhåndskontroller én kundefaktura</h3>
    <p className={styles.hint}>Sjekker kunden, MVA-kodene og hva som gjenstår før en sikker direkteoverføring.
     Dette er bare lesing fra Tripletex og kan ikke bokføre noe.</p>
    <div className={styles.inputs}>
     <label>Faktura
      <select value={selectedInvoice} disabled={busy}
       onChange={e=>{setSelectedInvoice(e.target.value);setPreflight(null);
        setDirectPilot(null);setPaymentTypes([]);setPaymentTypeError("");
        setPaymentTypeIds({bank:"",vipps:""})}}>
       {invoiceOptions.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
     </label>
    </div>
    <div className={styles.actions}>
     <button type="button" disabled={busy||!selectedInvoice} onClick={checkInvoiceMapping}>
      {busy?"Kontrollerer …":"Kontroller fakturakoblingen"}
     </button>
    </div>
    {preflight?.results?.map(x=><p className={styles.hint} key={x.id} role="status">
     <strong>{x.ready?"Kunde/MVA mappet ✓":"Må avklares"}:</strong> {x.reason}
     {x.ready&&x.needsPaymentMapping&&
      " Fakturaen kan opprettes direkte, men registrerte innbetalinger må deretter føres én og én med riktig dato og betalingstype."}
    </p>)}
    {preflight?.results?.some(x=>x.id===selectedInvoice&&x.ready)&&<div>
     <p className={styles.hint}><strong>Direkte pilot:</strong> Én faktura om gangen.
      Fakturaer sendes ikke til kunden på nytt.
      For fakturaer med opptil 10 registrerte innbetalinger kan du velge
      betalingstype og trykke «Overfør som betalt». Da ordner Aadland Service både
      faktura og innbetalinger med originale datoer i én bekreftet arbeidsflyt.</p>
     <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={()=>checkDirectPilot("check")}>
       {busy?"Kontrollerer …":"Kontroller direkteoverføring (kun lesing)"}
      </button>
      {directPilot?.ready&&directPilot.invoiceId===selectedInvoice&&
       (directPilot.paidOre===0?
        <button type="button" disabled={busy} className={styles.primary}
         onClick={()=>checkDirectPilot("transfer")}>
         Opprett denne ubetalte fakturaen i Tripletex
        </button>:
        directPilot.paymentCount<=10?
        <button type="button" disabled={busy||!paymentTypes.length||
         (directPilot.paymentSources||[]).some(source=>!paymentTypeIds[source])}
         className={styles.primary} onClick={()=>checkDirectPilot("transferPaid")}>
         Overfør som betalt
        </button>:
        <button type="button" disabled={busy} className={styles.primary}
         onClick={()=>checkDirectPilot("transfer")}>
         Opprett faktura (bokfør betalingene separat)
        </button>)
      }
     </div>
     {directPilot?.ready&&<div>
      <p className={styles.hint}>Klart for én kontrollert overføring.
       Fakturabeløp: {(Number(directPilot.grossOre)/100).toLocaleString("nb-NO",{style:"currency",currency:"NOK"})}.
       {directPilot.paidOre>0&&<>
        {" "}Allerede registrert betalt:
        {" "}{(Number(directPilot.paidOre)/100).toLocaleString("nb-NO",{style:"currency",currency:"NOK"})}
        {" · "}{directPilot.paymentCount} innbetaling(er).
       </>}
       Det opprettes ikke noe i Tripletex før du godkjenner bokføringen.</p>
      {directPilot.paidOre>0&&directPilot.paymentCount<=10&&
       <div style={{display:"grid",gap:10,margin:"12px 0"}}>
        <p className={styles.hint}><strong>Velg hvordan innbetalingen ble mottatt.</strong>
         Dette bestemmer hvilken betalingstype/konto som brukes i Tripletex.
         Betalingsdato og beløp hentes automatisk fra Aadland Service.</p>
        {paymentTypeError&&<p role="alert" className={styles.error}>{paymentTypeError}</p>}
        {(directPilot.paymentSources||[]).map(source=>
         <label key={source} style={{display:"grid",gap:5}}>
          {source==="vipps"?"Vipps – betalingstype i Tripletex":
           "Bank/annen betaling – betalingstype i Tripletex"}
          <select value={paymentTypeIds[source]||""} disabled={busy||!paymentTypes.length}
           onChange={e=>setPaymentTypeIds(old=>({...old,[source]:e.target.value}))}>
           <option value="">Velg riktig betalingstype</option>
           {paymentTypes.map(type=><option key={type.id} value={String(type.id)}>
            {type.label} (ID {type.id})
           </option>)}
          </select>
         </label>
        )}
       </div>}
     </div>}
    </div>}
   </div>}
   {state.configured&&<p className={styles.hint}>Sist bekreftet:
    {" "}{state.verifiedAt?new Date(state.verifiedAt).toLocaleString("nb-NO"):"–"}.
    API-et kan testes. En utsendt faktura om gangen kan overføres direkte
    etter kontroll og bekreftelse. Når betalingstype er valgt, kan faktura og
    registrerte innbetalinger overføres som betalt med én bekreftelse.
    Hver innbetaling bokføres med original dato. Samlet overføring av alle
    fakturaer er fortsatt ikke aktiv; CSV-importen er tilgjengelig.</p>}
  </>}
 </section>;
}
