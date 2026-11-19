"use client";
import {useState} from "react";
import styles from "./TripletexReceipts.module.css";
import {vippsPeriodBatches,combineVippsPeriodResponses} from "../../../../../lib/vippsSettlementPeriod";
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
export default function VippsSettlementClient(){
 const [unit,setUnit]=useState("service");
 const [from,setFrom]=useState(()=>dateAtOffset(-30));
 const [to,setTo]=useState(()=>dateAtOffset(-1));
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null);
 const [progress,setProgress]=useState("");
 async function load(){
  if(loading)return;
  setLoading(true);setError("");setResult(null);setProgress("");
  try{
   const batches=vippsPeriodBatches(from,to);
   if(!batches)throw Error("Velg en gyldig periode på maksimalt 31 dager.");
   const parts=[];
   for(let i=0;i<batches.length;i++){
    setProgress("Henter periode "+(i+1)+" av "+batches.length+" …");
    const params=new URLSearchParams({unit,...batches[i]});
    const response=await fetch("/api/admin/tripletex/vipps-settlement?"+params,{
     cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(
     "Del "+(i+1)+" av "+batches.length+" ("+batches[i].from+"–"+batches[i].to+") feilet: "+
     (data.error||"Vipps-oppgjøret kunne ikke hentes.")+
     " Ingen samlet rapport blir vist.");
    parts.push(data);
   }
   setResult(combineVippsPeriodResponses(parts,batches,unit));
  }catch(err){setError(err.message||"Vipps-rapporten kunne ikke kontrolleres.");}
  finally{setProgress("");setLoading(false);}
 }
 const totals=result?.totals||{};
 return <section className={styles.section} style={{paddingTop:0}}>
  <h2 style={{fontSize:20,margin:"0 0 7px"}}>Vipps-oppgjør og avstemming</h2>
  <p className={styles.hint}>
   Hent faktisk oppgjørsgrunnlag fra Vipps med de eksisterende API-nøklene.
   Se salg, refusjoner, gebyrer, planlagte bankutbetalinger og hvilke betalinger
   som har en sikker kobling til Aadland Service. Denne kontrollen oppretter
   ingen nye bilag i Tripletex.
  </p>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",margin:"12px 0"}}>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Salgssted
    <select value={unit} disabled={loading} onChange={event=>{
     setUnit(event.target.value);setResult(null);}}>
     <option value="service">Aadland Service</option>
     <option value="rental">Aadland Utleie</option>
    </select>
   </label>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Fra dato
    <input type="date" value={from} disabled={loading}
     onChange={event=>{setFrom(event.target.value);setResult(null);}}/>
   </label>
   <label style={{display:"grid",gap:4,fontSize:13}}>
    Til dato
    <input type="date" value={to} disabled={loading}
     onChange={event=>{setTo(event.target.value);setResult(null);}}/>
   </label>
   <button type="button" className={styles.primary} disabled={loading}
    onClick={load}>{loading?"Henter og kontrollerer …":"Hent Vipps-oppgjør"}</button>
  </div>
  <p className={styles.hint}>Velg opptil 31 dager med ett knappetrykk. Systemet henter automatisk uke for uke og viser bare et samlet resultat når alle periodene er hentet. Oppgjørsrapportene
   kan komme senere enn selve Vipps-betalingen. Er Vippsnummer brukt uten ePayment-tilgang,
   kan Vipps kreve en autorisert regnskapspartner for denne rapporten.</p>
  {loading&&progress&&<p className={styles.hint} role="status">{progress}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {result&&<div>
   <p role="status" className={styles.progress}>
    Vipps-rapport hentet for {result.from} til {result.to}.
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
   <p className={styles.hint}>{result.warning}</p>
   {result.unknownEntryTypes>0&&<p className={styles.error} role="alert">
    Rapporten inneholder {result.unknownEntryTypes} ukjente posttyper.
    Disse må vurderes før bokføring.</p>}
   {result.unreferencedCaptures>0&&<p className={styles.hint}>
    {result.unreferencedCaptures} betalinger mangler Vipps-referanse
    og kan ikke kobles automatisk til en faktura.</p>}
   <details style={{marginTop:12}}>
    <summary>Planlagte utbetalinger ({result.payoutRows.length})</summary>
    {!result.payoutRows.length?<p className={styles.hint}>Ingen planlagte utbetalinger i perioden.</p>:
     <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",marginTop:8}}>
       <thead><tr><th>Dato</th><th>Beløp</th><th>Referanse</th></tr></thead>
       <tbody>{result.payoutRows.map((row,i)=><tr key={row.reference+"-"+i}>
        <td>{row.date}</td><td>{kroner(row.amountOre)}</td>
        <td>{row.reference||"Ingen bankreferanse fra Vipps"}</td>
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
    <strong>Neste del:</strong> Når riktig Vipps-oppgjørskunde, gebyrkonto
    og bankkonto er kontrollert, kan vi koble dette til automatisk
    bilagsføring i Tripletex. Foreløpig er dette en lesekontroll, ikke
    en bekreftelse på at pengene har kommet inn på bankkontoen.
   </p>
  </div>}
 </section>;
}
