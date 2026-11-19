"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./TripletexReceipts.module.css";
import VippsTripletexTransferPanel from "./VippsTripletexTransferPanel";
import VippsRetainedFeeTransferPanel from "./VippsRetainedFeeTransferPanel";
import VippsReconcilePanel from "./VippsReconcilePanel";
import VippsFeeQueuePanel from "./VippsFeeQueuePanel";
import {vippsPeriodBatches} from "../../../../../lib/vippsSettlementPeriod";
import {chunkVippsDays} from "../../../../../lib/vippsReportCache";
const dateAtOffset=days=>{
 const date=new Date(Date.now()+days*86400000);
 return new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",
  timeZone:"Europe/Oslo"}).format(date);
};
const kroner=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
 .format(Number(ore||0)/100);
const labels={
 "tripletex-bekreftet":"Betalings-API bekreftet",
 "funnet-i-aadland":"Funnet i Aadland Service",
 "ingen-sikker-kobling":"Må matches mot faktura",
 "flere-mulige-betalinger":"Flere mulige lokale betalinger"
};
const statusFor=row=>row.transferMismatch?
 "Beløpsavvik mot Tripletex – manuell kontroll":
 row.tripletexStatus==="confirmed"?"Bokført via Aadland Service":
 row.tripletexStatus==="needs_review"||row.tripletexStatus==="processing"?
 "Overføring må kontrolleres – ikke prøv på nytt":
 "Ingen registrert overføring via Aadland Service";
export default function VippsSettlementClient(){
 const [unit,setUnit]=useState("service");
 const [from,setFrom]=useState(()=>dateAtOffset(-30));
 const [to,setTo]=useState(()=>dateAtOffset(-1));
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null);
 const [progress,setProgress]=useState("");
 const [cacheInfo,setCacheInfo]=useState(null);
 const [loadingSaved,setLoadingSaved]=useState(false);
 const [lastCheck,setLastCheck]=useState(null);
 const [yearPreset,setYearPreset]=useState("");
 const [reconcileAutoRunKey,setReconcileAutoRunKey]=useState(0);
 const [feeBatchBusy,setFeeBatchBusy]=useState(false);
 const abortRef=useRef(null);
 useEffect(()=>()=>abortRef.current?.abort(),[]);
 const currentYear=Number(dateAtOffset(0).slice(0,4));
 const yearOptions=Array.from({length:7},(_,i)=>currentYear-i);
 function chooseYear(value){
  setYearPreset(value);setResult(null);setCacheInfo(null);setLastCheck(null);setError("");
  if(!value)return;
  setFrom(value+"-01-01");
  setTo(Number(value)===currentYear?dateAtOffset(-1):value+"-12-31");
 }
 function asReport(snapshot){
  if(!snapshot?.result)return null;
  return {unit:snapshot.unit,from:snapshot.from,to:snapshot.to,...snapshot.result};
 }
 function cacheUrl(){
  return "/api/admin/tripletex/vipps-settlement/cache?"+
   new URLSearchParams({unit,from,to});
 }
 async function fetchSaved(signal){
  const response=await fetch(cacheUrl(),{cache:"no-store",signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(data.error||"Kunne ikke lese lagrede Vipps-rapporter.");
  return data;
 }
 // Showing saved reports never calls Vipps. A year previously fetched before
 // persistent caching was introduced must be imported once.
 useEffect(()=>{
  if(!vippsPeriodBatches(from,to)||to>dateAtOffset(-1)){
   setCacheInfo(null);setResult(null);return;
  }
  const controller=new AbortController();
  setLoadingSaved(true);
  setCacheInfo(null);setResult(null);setError("");
  fetchSaved(controller.signal).then(data=>{
   if(controller.signal.aborted)return;
   setCacheInfo(data);setResult(asReport(data));
  }).catch(err=>{
   if(!controller.signal.aborted)
    setError(err.message||"Lagrede Vipps-rapporter kunne ikke vises.");
  }).finally(()=>{if(!controller.signal.aborted)setLoadingSaved(false);});
  return ()=>controller.abort();
 },[unit,from,to]);
 function cancelLoad(){abortRef.current?.abort();}
 async function load({reconcileAfter=false}={}){
  if(loading)return;
  const controller=new AbortController();
  abortRef.current=controller;
  setLoading(true);setError("");setLastCheck(null);setProgress("");
  try{
   if(!vippsPeriodBatches(from,to))
    throw Error("Velg en gyldig periode på maksimalt ett år (366 dager).");
   if(to>dateAtOffset(-1))
    throw Error("Velg senest gårsdagens dato. Dagens oppgjør kan være ufullstendig.");
   const before=await fetchSaved(controller.signal);
   const batches=chunkVippsDays(before.checkDays||[]);
   const totals={newDays:0,changedDays:0,unchangedDays:0,checkedDays:0,skippedDays:0};
   for(let i=0;i<batches.length;i++){
    if(controller.signal.aborted)throw Error("Hentingen ble avbrutt.");
    const days=batches[i];
    setProgress("Sjekker kun manglende eller nylige datoer: "+
     (i+1)+" av "+batches.length+" ("+days[0]+"–"+days.at(-1)+") …");
    const response=await fetch("/api/admin/tripletex/vipps-settlement/cache",{
     method:"POST",headers:{"Content-Type":"application/json"},
     cache:"no-store",signal:controller.signal,
     body:JSON.stringify({action:"check-new",unit,days})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)
     throw Error("Kontrollen for "+days[0]+"–"+days.at(-1)+" feilet: "+
      (data.error||"Kunne ikke hente endringer fra Vipps.")+
      " Allerede lagrede dager beholdes. Du kan prøve kontrollen igjen.");
    for(const key of Object.keys(totals))totals[key]+=Number(data[key]||0);
   }
   if(controller.signal.aborted)throw Error("Hentingen ble avbrutt.");
   setProgress("Oppdaterer lagret oversikt og status fra Tripletex …");
   const after=await fetchSaved(controller.signal);
   if(controller.signal.aborted)throw Error("Hentingen ble avbrutt.");
   setCacheInfo(after);setResult(asReport(after));setLastCheck(totals);
   if(reconcileAfter)setReconcileAutoRunKey(n=>n+1);
  }catch(err){
   setError(controller.signal.aborted||err?.name==="AbortError"?
    "Kontrollen ble avbrutt. Dager som allerede er lagret, beholdes; du kan fortsette senere.":
    err.message||"Kunne ikke kontrollere endringer fra Vipps.");
  }finally{
   if(abortRef.current===controller)abortRef.current=null;
   setProgress("");setLoading(false);
  }
 }
 async function reloadSaved(){
  if(loading)return;
  setError("");setLoadingSaved(true);
  try{
   const fresh=await fetchSaved();
   setCacheInfo(fresh);setResult(asReport(fresh));
  }catch(err){setError(err.message||"Lagrede rapporter kunne ikke oppdateres.");}
  finally{setLoadingSaved(false);}
 }
 const totals=result?.totals||{};
 return <section className={styles.section} style={{paddingTop:0}}>
  <h2 style={{fontSize:20,margin:"0 0 7px"}}>Vipps-oppgjør og avstemming</h2>
  <p className={styles.hint}>
   Rapportene lagres i Aadland Service første gang de hentes. Ved neste kontroll
   sjekkes bare manglende dager og nylig aktivitet. Se det som allerede er lagret,
   gebyrer og hvilke oppgjør som er overført via Aadland Service til Tripletex.
   En rapportkontroll bokfører ingen nye bilag.
  </p>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",margin:"12px 0"}}>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Salgssted
    <select value={unit} disabled={loading||feeBatchBusy} onChange={event=>{
     setUnit(event.target.value);setResult(null);}}>
     <option value="service">Aadland Service</option>
     <option value="rental">Aadland Utleie</option>
    </select>
   </label>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Velg regnskapsår
    <select value={yearPreset} disabled={loading||feeBatchBusy} onChange={event=>chooseYear(event.target.value)}>
     <option value="">Egendefinert periode</option>
     {yearOptions.map(year=><option key={year} value={String(year)}>
      {year===currentYear?year+" – hittil i år":year+" – hele året"}
     </option>)}
    </select>
   </label>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Fra dato
    <input type="date" value={from} disabled={loading||feeBatchBusy}
     onChange={event=>{setFrom(event.target.value);setYearPreset("");setCacheInfo(null);setLastCheck(null);setResult(null);}}/>
   </label>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Til dato
    <input type="date" value={to} disabled={loading||feeBatchBusy}
     onChange={event=>{setTo(event.target.value);setYearPreset("");setCacheInfo(null);setLastCheck(null);setResult(null);}}/>
   </label>
   <button type="button" className={styles.primary} disabled={loading||loadingSaved||feeBatchBusy}
    onClick={()=>load()}>{loading?"Sjekker endringer …":"Sjekk hva som er nytt fra Vipps"}</button>
    <button type="button" disabled={loading||loadingSaved||feeBatchBusy||unit!=="service"}
     onClick={()=>load({reconcileAfter:true})}>
     {loading?"Kontrollerer Vipps …":"Sjekk Vipps og avstem mot Tripletex"}</button>
   <button type="button" disabled={loading||loadingSaved||feeBatchBusy} onClick={reloadSaved}>
    Vis lagrede rapporter
   </button>
   {loading&&<button type="button" onClick={cancelLoad} style={{padding:"10px 14px",borderRadius:8}}>
    Avbryt henting
   </button>}
  </div>
  <p className={styles.hint}>Velg opptil ett år (366 dager). Lagrede perioder vises direkte
   uten å hente dem fra Vipps igjen. Når du trykker «Sjekk hva som er nytt», hentes kun
   dager som mangler og de siste 14 dagene dersom de ikke nylig er kontrollert.
   Tidligere rapporter hentet før denne lagringsfunksjonen må importeres én gang.
   Ved første årsimport må du beholde siden åpen. Ingen regnskapsbilag sendes av denne knappen.</p>
  {loadingSaved&&<p role="status" className={styles.hint}>Åpner lagrede Vipps-rapporter …</p>}
  {cacheInfo&&<div style={{border:"1px solid #d8dedf",borderRadius:9,padding:13,
   margin:"12px 0",fontSize:13}}>
   <strong>Lagret hos Aadland Service: {cacheInfo.storedDays} av {cacheInfo.totalDays} dager</strong>
   <p style={{margin:"6px 0"}}>
    {cacheInfo.complete?"Hele perioden finnes lagret.":"Det mangler "+cacheInfo.missingDays.length+
     " dager i lagringen. De blir hentet ved neste kontroll."}
    {" "} {cacheInfo.checkDays.length} datoer skal kontrolleres mot Vipps.
   </p>
   {cacheInfo.lastCheckedAt&&<p style={{margin:"6px 0"}}>
    Sist kontrollert: {new Date(cacheInfo.lastCheckedAt).toLocaleString("nb-NO")}
   </p>}
   {cacheInfo.transferCounts&&<p style={{margin:"6px 0"}}>
    Tripletex via Aadland Service: {cacheInfo.transferCounts.feesConfirmed} gebyrer og
    {" "}{cacheInfo.transferCounts.payoutsConfirmed} utbetalinger bekreftet bokført.
    {" "}{cacheInfo.transferCounts.feesNotTransferred} gebyrer og
    {" "}{cacheInfo.transferCounts.payoutsNotTransferred} utbetalinger mangler
    registrert overføring fra Aadland Service.
    {(cacheInfo.transferCounts.feesToReview+cacheInfo.transferCounts.payoutsToReview)>0&&
     <span style={{color:"#a7412f"}}> Noen tidligere overføringer må kontrolleres manuelt.</span>}
   </p>}
   {!cacheInfo.complete&&<p style={{margin:"6px 0",fontWeight:600}}>
    Tallene nedenfor gjelder bare lagrede dager, ikke hele den valgte perioden.
   </p>}
  </div>}
  <VippsReconcilePanel unit={unit} from={from} to={to}
   cacheInfo={cacheInfo} autoRunKey={reconcileAutoRunKey}/>
  {lastCheck&&<p role="status" className={styles.progress}>
   Kontroll ferdig: {lastCheck.newDays} nye dager lagret, {lastCheck.changedDays} dager
   med endret innhold, {lastCheck.unchangedDays} uendrede kontrollerte dager
   og {lastCheck.skippedDays} allerede nylig kontrollert.
   Ingen bilag er sendt til Tripletex.
  </p>}
  {loading&&progress&&<p className={styles.hint} role="status">{progress}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {result&&<div>
   <p role="status" className={styles.progress}>
    Viser lagrede Vipps-rapporter for {result.from} til {result.to}.
    {result.tripletexConnected?" Tripletex er tilkoblet.":" Tripletex er ikke tilkoblet."}
    Ingen nye bilag er bokført.
   </p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",
    gap:12,margin:"14px 0"}}>
    {[
     ["Vipps-betalinger",kroner(totals.capturesOre)],
     ["Refusjoner",kroner(totals.refundsOre)],
     ["Gebyrer trukket",kroner(totals.retainedFeesOre)],
     ["Gebyrer spesifisert",kroner(totals.feesChargedOre)],
     ["Planlagte utbetalinger",kroner(totals.payoutScheduledOre)]
    ].map(([label,value])=><div key={label} style={{
     padding:12,border:"1px solid #ded9d1",borderRadius:8}}>
     <small style={{display:"block"}}>{label}</small>
     <strong>{value}</strong>
    </div>)}
   </div>
   {Number.isSafeInteger(result.lastVippsBalanceOre)&&result.lastVippsBalanceDate&&
    <p style={{margin:"10px 0",fontSize:14}}>
     <strong>Saldo hos Vipps etter siste registrerte post ({result.lastVippsBalanceDate}):
      {" "}{kroner(result.lastVippsBalanceOre)}</strong>
     <span style={{display:"block",fontSize:12,opacity:0.8}}>
      {result.lastVippsBalanceOre<0?
       "Negativ saldo betyr at Vipps har trukket mer enn saldoen, eller at andre poster har redusert den. Dette er ikke en bankutbetaling.":
       "Dette er saldo på Vipps oppgjørskonto, ikke bekreftet saldo i banken."}
     </span>
    </p>}
   <p className={styles.hint}>{result.warning}</p>
   <VippsFeeQueuePanel unit={result.unit} from={result.from} to={result.to}
    feeRows={result.feeRows||[]} complete={Boolean(cacheInfo?.complete)}
    unknownEntryTypes={result.unknownEntryTypes||0}
    onBusyChange={setFeeBatchBusy}
    onRefresh={async()=>{
     await reloadSaved();
     setReconcileAutoRunKey(n=>n+1);
    }}/>
   
   {!cacheInfo?.complete&&<p className={styles.hint} style={{fontWeight:700}}>
    Delvis oversikt: kontrollér manglende datoer før perioden brukes som komplett regnskapsgrunnlag.
   </p>}
   {result.unknownEntryTypes>0&&<p className={styles.error} role="alert">
    Rapporten inneholder {result.unknownEntryTypes} ukjente posttyper.
    Disse må vurderes før bokføring.</p>}
   {result.matchingLimited&&<p className={styles.hint} role="status">
    Vipps hadde flere betalingsreferanser enn vi viser i detaljvisningen for én eller flere uker.
    Beløpssummene er for hele den hentede perioden, men alle referanser kan ikke bekreftes enkeltvis her.
   </p>}
   {result.unreferencedCaptures>0&&<p className={styles.hint}>
    {result.unreferencedCaptures} betalinger mangler Vipps-referanse
    og kan ikke kobles automatisk til en faktura.</p>}
   <details style={{marginTop:12}} open={!result.payoutRows.length&&Boolean(result.feeRows?.length)}>
    <summary>Gebyrer trukket fra Vipps-saldo ({result.feeRows?.length||0})</summary>
    {!result.feeRows?.length?<p className={styles.hint}>
     Ingen gebyrer er registrert som trukket fra Vipps-saldoen i perioden.
     Gebyrer som bare er spesifisert, men ikke trukket, må kontrolleres mot
     eventuelle separate gebyrfakturaer.</p>:
     <div style={{overflowX:"auto"}}>
      <p className={styles.hint}>Disse gebyrene kan være trukket selv om Vipps ikke har
       utbetalt noe til banken. Kontroller ett gebyr om gangen. Ingen fiktiv
       bankinnbetaling blir opprettet.</p>
      <table style={{width:"100%",marginTop:8}}>
       <thead><tr><th>Dato</th><th>Trukket gebyr</th><th>Referanse og bokføring</th></tr></thead>
       <tbody>{result.feeRows.map((row,i)=><tr key={row.date+"-"+row.pspReference+"-"+i}>
        <td>{row.date}</td><td>{kroner(row.amountOre)}</td>
        <td>{row.pspReference||"Ingen gebyrreferanse"}
         <small style={{display:"block",margin:"4px 0",fontWeight:600}}>
          {statusFor(row)}</small>
         {row.kind==="trukket"&&row.tripletexStatus==="not_transferred"?
          <VippsRetainedFeeTransferPanel row={row} unit={result.unit}/>:
          row.kind!=="trukket"?
          <small>Gebyrkorrigering – må kontrolleres manuelt</small>:null}
        </td>
       </tr>)}</tbody>
      </table>
     </div>}
   </details>
   <details style={{marginTop:12}}>
    <summary>Planlagte utbetalinger ({result.payoutRows.length})</summary>
    {!result.payoutRows.length?<p className={styles.hint}>Ingen planlagte utbetalinger i perioden.</p>:
     <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",marginTop:8}}>
       <thead><tr><th>Dato</th><th>Beløp</th><th>Referanse og overføring</th></tr></thead>
       <tbody>{result.payoutRows.map((row,i)=><tr key={row.reference+"-"+i}>
        <td>{row.date}</td><td>{kroner(row.amountOre)}</td>
        <td>{row.reference||"Ingen bankreferanse fra Vipps"}
         <small style={{display:"block",margin:"4px 0",fontWeight:600}}>
          {statusFor(row)}</small>
         {row.tripletexStatus==="not_transferred"&&
          <VippsTripletexTransferPanel row={row} unit={result.unit}/>}
        </td>
       </tr>)}</tbody>
      </table>
     </div>}
   </details>
   <details style={{marginTop:12}}>
    <summary>Kontrollerte betalingsreferanser ({result.matching.length})</summary>
    {!result.matching.length?<p className={styles.hint}>
     Ingen Vipps-betalinger med gjenkjennbar referanse i perioden.</p>:
     <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",marginTop:8}}>
       <thead><tr><th>Vipps-referanse</th><th>Sum</th><th>Kontrollstatus</th></tr></thead>
       <tbody>{result.matching.map((row,i)=><tr key={row.reference+"-"+i}>
        <td>{row.reference}</td><td>{kroner(row.capturedOre)}</td>
        <td>{labels[row.status]||"Må kontrolleres"}</td>
       </tr>)}</tbody>
      </table>
     </div>}
   </details>
   <p className={styles.hint} style={{marginTop:12}}>
    <strong>Overføring til Tripletex:</strong> Under «Planlagte utbetalinger» kan du
    kontrollere ett oppgjør om gangen og overføre det med en knapp.
    Gebyrer trukket fra Vipps kan bokføres separat ovenfor, også når ingen
    bankutbetaling har skjedd. For ordinære bankutbetalinger må hver
    fakturabetaling allerede være bekreftet i Tripletex og riktig bankkonto
    kontrollert. Gebyrer som er bokført separat, blir ikke bokført dobbelt
    ved senere bankoppgjør. Åpne poster på Vipps oppgjørskunde må fremdeles
    lukkes i kundereskontroen.
   </p>
  </div>}
 </section>;
}
