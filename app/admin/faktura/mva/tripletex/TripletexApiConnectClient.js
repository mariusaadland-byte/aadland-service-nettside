"use client";
import {useEffect,useState} from "react";
import styles from "./TripletexReceipts.module.css";
import TripletexCustomerSyncClient from "./TripletexCustomerSyncClient";

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
 async function syncPaidInvoicePayments(invoiceId,pilot,selectedTypes){
  let posted=0;
  for(let i=0;i<pilot.paymentCount;i++){
   const read=await fetch("/api/admin/tripletex/invoices/payments?invoiceId="+
    encodeURIComponent(invoiceId),{cache:"no-store"});
   const review=await read.json().catch(()=>({}));
   if(!read.ok||!review.ready||!review.next)
    throw Error(review.reason||review.error||
     "Fakturaen er opprettet, men neste innbetaling kunne ikke avstemmes.");
   const paymentTypeId=Number(selectedTypes[review.next.source]);
   if(!paymentTypes.some(x=>x.id===paymentTypeId))
    throw Error("Ingen gyldig betalingstype valgt for "+review.next.source+".");
   const sent=await fetch("/api/admin/tripletex/invoices/payments",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"record",confirmed:true,invoiceId,
     paymentId:review.next.id,paymentTypeId,
     expectedRemoteOutstandingOre:review.remoteOutstandingOre})
   });
   const result=await sent.json().catch(()=>({}));
   if(!sent.ok||!result.ok)
    throw Error(result.error||
     "Tripletex bekreftet ikke innbetalingen. Stopp uten å sende på nytt.");
   posted++;
   setInfo("Fakturaen er opprettet i Tripletex. "+posted+" av "+
    pilot.paymentCount+" innbetalinger er bekreftet.");
  }
  const final=await fetch("/api/admin/tripletex/invoices/payments?invoiceId="+
   encodeURIComponent(invoiceId),{cache:"no-store"});
  const checked=await final.json().catch(()=>({}));
  if(!final.ok||checked.remainingCount!==0||
   checked.remoteOutstandingOre!==checked.localOutstandingOre)
   throw Error("Innbetalingene er sendt, men endelig restsaldo er ikke avstemt.");
  const reconcile=await fetch("/api/admin/tripletex/invoices/reconcile",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({invoiceId,action:"check"})
  });
  const result=await reconcile.json().catch(()=>({}));
  if(!reconcile.ok||result.comparison!=="match")
   throw Error("Innbetalingene er bekreftet, men sluttavstemmingen må kontrolleres.");
  return posted;
 }
 async function checkDirectPilot(action){
  if(busy||!selectedInvoice)return;
  const paidFlow=action==="transferPaid";
  const transfer=action==="transfer"||paidFlow;
  const pilot=directPilot;
  const invoiceId=selectedInvoice;
  const types={...paymentTypeIds};
  if(transfer){
   if(!pilot?.ready||pilot.invoiceId!==invoiceId)return;
   if(paidFlow){
    if(pilot.paidOre<=0||pilot.paymentCount<1||pilot.paymentCount>10){
     setError("Samlet betalingsoverføring krever 1–10 registrerte innbetalinger.");return;
    }
    const sources=pilot.paymentSources||[];
    if(!sources.length||sources.some(source=>!paymentTypes.some(x=>
     x.id===Number(types[source])))){
     setError("Velg riktig Tripletex-betalingstype for alle registrerte betalingsmåter.");return;
    }
   }
   const money=new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
    .format(Number(pilot.grossOre||0)/100);
   const prompt=paidFlow?
    "OVERFØRE FAKTURAEN SOM BETALT TIL TRIPLETEX?"+
    "\n\nOpprinnelig faktura: "+pilot.sourceNumber+
    "\nFakturabeløp: "+money+
    "\nRegistrert betalt: "+
      new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
       .format(Number(pilot.paidOre||0)/100)+
    "\nInnbetalinger: "+pilot.paymentCount+
    "\n\nAadland Service oppretter først regnskapsfakturaen i Tripletex uten"+
    " å sende den til kunden på nytt. Deretter bokføres innbetalingene "+
    "med opprinnelig betalingsdato og valgt betalingstype."+
    "\n\nDette er ekte bokføring. Hvis en del feiler, stoppes resten og"+
    " resultatet må kontrolleres i overføringshistorikken."+
    "\n\nBekrefter du at faktura og betalinger ikke er registrert i Tripletex fra før?":
    "OPPRETTE EN EKTE REGNSKAPSFØRT FAKTURA I TRIPLETEX?"+
    "\n\nOpprinnelig faktura: "+pilot.sourceNumber+
    "\nBeløp inkl. MVA: "+money+
    "\nFakturadato: "+pilot.issuedDate+
    "\n\nFakturaen sendes IKKE til kunden på nytt."+
    "\nTripletex lager et eget regnskapsnummer."+
    "\n\nDette påvirker regnskapet og MVA. Bekreft bare hvis fakturaen ikke finnes der fra før.";
   if(!window.confirm(prompt))return;
  }
  setBusy(true);setError("");setInfo("");
  let invoiceCreated=false,createdNumber=null;
  let posted=0;
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
     const options=await fetch("/api/admin/tripletex/invoices/payment-types",{
      cache:"no-store"
     });
     const types=await options.json().catch(()=>({}));
     if(!options.ok){
      setPaymentTypeError(types.error||"Kunne ikke hente betalingstyper fra Tripletex.");
     }else setPaymentTypes(types.types||[]);
    }
    return;
   }
   invoiceCreated=true;
   createdNumber=result.tripletexInvoiceNumber;
   // This invoice exists in the real ledger now, whether the browser succeeds
   // in posting the subsequent payments or not. Never show it as transferable.
   setDirectPilot(null);setPreflight(null);
   setInvoiceOptions(old=>old.filter(x=>x.id!==invoiceId));
   setSelectedInvoice("");
   if(paidFlow){
    // Each payment POST has a unique database claim and a fresh balance check.
    // Browser interruption is recoverable manually in transfer history;
    // NEVER automatically retry an uncertain payment.
    for(let i=0;i<pilot.paymentCount;i++){
     const reviewResponse=await fetch(
      "/api/admin/tripletex/invoices/payments?invoiceId="+encodeURIComponent(invoiceId),
      {cache:"no-store"});
     const review=await reviewResponse.json().catch(()=>({}));
     if(!reviewResponse.ok||!review.ready||!review.next)
      throw Error(review.reason||review.error||
       "Neste betaling er ikke klar for bokføring.");
     const paymentTypeId=Number(types[review.next.source]);
     if(!paymentTypes.some(type=>type.id===paymentTypeId))
      throw Error("Betalingstypen kan ikke bekreftes.");
     const response=await fetch("/api/admin/tripletex/invoices/payments",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"record",confirmed:true,invoiceId,
       paymentId:review.next.id,paymentTypeId,
       expectedRemoteOutstandingOre:review.remoteOutstandingOre})
     });
     const booked=await response.json().catch(()=>({}));
     if(!response.ok||!booked.ok)
      throw Error(booked.error||"Innbetalingen ble ikke bekreftet i Tripletex.");
     posted++;
     setInfo("Fakturaen er opprettet. "+posted+" av "+pilot.paymentCount+
      " betalinger er bekreftet i Tripletex.");
    }
    const checkedResponse=await fetch(
     "/api/admin/tripletex/invoices/payments?invoiceId="+encodeURIComponent(invoiceId),
     {cache:"no-store"});
    const checked=await checkedResponse.json().catch(()=>({}));
    if(!checkedResponse.ok||checked.remainingCount!==0||
     checked.remoteOutstandingOre!==checked.localOutstandingOre)
     throw Error("Betalingene er sendt, men sluttavstemmingen må kontrolleres.");
    const reconcileResponse=await fetch("/api/admin/tripletex/invoices/reconcile",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({invoiceId,action:"check"})
    });
    const reconciled=await reconcileResponse.json().catch(()=>({}));
    if(!reconcileResponse.ok||reconciled.comparison!=="match")
     throw Error("Betalingene er bokført, men sluttavstemmingen må kontrolleres.");
    setInfo("Faktura "+result.sourceNumber+" er overført som betalt. "+
     posted+" innbetaling(er) er bekreftet med opprinnelige datoer. "+
     "Restbeløpet stemmer i begge systemer. Tripletex-fakturanummer: "+createdNumber+".");
   }else{
    setInfo(result.message+" Tripletex-fakturanummer: "+createdNumber+
     ". Fakturaen er fjernet fra listen over gjenstående.");
   }
  }catch(e){
   if(transfer)setDirectPilot(null);
   const reason=e.message||"Fakturaoverføringen kunne ikke fullføres.";
   if(invoiceCreated){
    setError("Fakturaen er opprettet i Tripletex (nr. "+createdNumber+
     "), men bare "+posted+" av "+pilot.paymentCount+
     " innbetaling(er) er bekreftet i denne overføringen. "+
     reason+" Ikke opprett fakturaen på nytt. "+
     "Åpne overføringshistorikken og kontroller før du eventuelt fortsetter.");
   }else setError(reason);
  }finally{setBusy(false);}
 }
 async function checkInvoiceMapping(){
  if(busy||!selectedInvoice)return;
  setBusy(true);setError("");setPreflight(null);setDirectPilot(null);
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
       onChange={e=>{setSelectedInvoice(e.target.value);setPreflight(null);setDirectPilot(null)}}>
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
      Tripletex lager sitt eget regnskapsnummer, men sender ingenting til kunden.
      Fakturaer som allerede har innbetalinger, opprettes først som ubetalte i Tripletex;
      innbetalingene bokføres deretter separat med riktig dato og betalingstype.</p>
     <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={()=>checkDirectPilot("check")}>
       {busy?"Kontrollerer …":"Kontroller direkteoverføring (kun lesing)"}
      </button>
      {directPilot?.ready&&directPilot.invoiceId===selectedInvoice&&
       <button type="button" disabled={busy} className={styles.primary}
        onClick={()=>checkDirectPilot("transfer")}>
        {directPilot.paidOre>0?"Opprett faktura (bokfør innbetalinger etterpå)":
         "Opprett denne ubetalte fakturaen i Tripletex"}
       </button>}
     </div>
     {directPilot?.ready&&<p className={styles.hint}>Klart for én kontrollert
      overføring. Beløp: {(Number(directPilot.grossOre)/100).toLocaleString("nb-NO",{style:"currency",currency:"NOK"})}.
      {directPilot.paidOre>0&&<>
       {" "}Registrert betalt i Aadland Service:
       {" "}{(Number(directPilot.paidOre)/100).toLocaleString("nb-NO",{style:"currency",currency:"NOK"})}
       {" · "}{directPilot.paymentCount} innbetaling(er) må overføres separat.
      </>}
      Dette er en ekte bokføring først når du trykker opprett og bekrefter.</p>}
    </div>}
   </div>}
   {state.configured&&<p className={styles.hint}>Sist bekreftet:
    {" "}{state.verifiedAt?new Date(state.verifiedAt).toLocaleString("nb-NO"):"–"}.
    API-et kan testes. En utsendt faktura om gangen kan overføres direkte
    etter egen kontroll og bekreftelse. For allerede betalte fakturaer overføres
    innbetalingene separat med originale datoer. Samlet automatisk bokføring er
    fortsatt ikke aktiv; CSV-importen er tilgjengelig.</p>}
  </>}
 </section>;
}
