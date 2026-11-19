"use client";
import {useEffect,useState} from "react";
import styles from "./TripletexReceipts.module.css";

const kr=ore=>Number.isSafeInteger(ore)?new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"}).format(ore/100):"Ikke kjent";
const detailStatus={
 confirmed:"Bekreftet overført",
 missing:"Ikke registrert overført",
 review:"Må kontrolleres manuelt"
};
export default function VippsReconcilePanel({unit,from,to,cacheInfo,autoRunKey=0}){
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [check,setCheck]=useState(null);
 const available=unit==="service"&&Boolean(cacheInfo?.storedDays);
 const periodKey=unit+"|"+from+"|"+to+"|"+cacheInfo?.lastCheckedAt;
 useEffect(()=>{setCheck(null);setError("");},[periodKey]);
 async function reconcile(){
  if(!available||loading)return;
  setLoading(true);setError("");setCheck(null);
  try{
   const response=await fetch("/api/admin/tripletex/vipps-settlement/reconcile?"+
    new URLSearchParams({unit,from,to}),{cache:"no-store"});
   const json=await response.json().catch(()=>({}));
   if(!response.ok||!json.ok)
    throw Error(json.error||"Kunne ikke hente åpne poster fra Tripletex.");
   setCheck(json);
  }catch(e){setError(e.message||"Kunne ikke kontrollere saldo.");}
  finally{setLoading(false);}
 }
 // One-click "Sjekk Vipps og avstem": parent refreshes cached days, then raises this key.
 useEffect(()=>{
  if(autoRunKey>0&&available)reconcile();
  // Invoked only after the parent's Vipps sync completes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[autoRunKey]);
 return <section style={{margin:"16px 0",border:"1px solid #cad9d9",
  borderRadius:10,padding:14}}>
  <h3 style={{margin:"0 0 7px",fontSize:17}}>Saldokontroll mot Tripletex</h3>
  <p className={styles.hint} style={{margin:"0 0 12px"}}>
   Henter åpne poster på Vipps oppgjørskunde 10009, konto 1500, direkte fra
   Tripletex og sammenligner med lagret Vipps-sluttsaldo. Dette er kun lesing.
   Ingen bilag blir opprettet og ingen poster blir lukket.
  </p>
  {unit!=="service"?<p className={styles.hint}>
   Aadland Utleie avstemmes separat. Denne kontrollen gjelder Aadland Service.</p>:
   <button type="button" disabled={loading||!available} onClick={reconcile}
    className={styles.primary} style={{marginBottom:8}}>
    {loading?"Kontrollerer Tripletex …":"Kontroller lagret Vipps-saldo mot Tripletex"}
   </button>}
  {!cacheInfo?.complete&&unit==="service"&&<p className={styles.hint}>
   Perioden har manglende rapportdager. Hent disse før resultatet regnes som fullstendig.</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {check&&<div>
   <p style={{margin:"8px 0",fontWeight:700,
    color:check.status==="balance_matches"?"#1a664b":"#98401c"}}>
    {check.status==="balance_matches"?
     "Saldokontroll OK – beløpene stemmer":"Må følges opp – se kontrollpunktene nedenfor"}
   </p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
    {[
     ["Vipps-saldo",kr(check.vippsBalanceOre)],
     ["Tripletex åpne poster",kr(check.tripletexBalanceOre)],
     ["Differanse",kr(check.differenceOre)],
     ["Bekreftede overføringer",String(check.confirmedCount)],
     ["Mangler overføring",String(check.missingCount)],
     ["Må kontrolleres",String(check.reviewCount)]
    ].map(([name,value])=><div key={name} style={{padding:10,border:"1px solid #d7dedf",
     borderRadius:8}}><small style={{display:"block"}}>{name}</small>
     <strong>{value}</strong></div>)}
   </div>
   <p className={styles.hint} style={{marginTop:9}}>
    Saldo per {check.to}; siste Vipps-aktivitet {check.vippsLastActivityDate||"ikke kjent"}.
    {" "}{check.openPostingCount} åpne poster i Tripletex.
    Kontrollert {new Date(check.checkedAt).toLocaleString("nb-NO")}.
   </p>
   {check.issues?.length>0&&<div role="status" style={{
    borderTop:"1px solid #e1d6cf",paddingTop:7}}>
    <strong>Dette må følges opp:</strong>
    <ul style={{margin:"7px 0 0 20px",padding:0}}>
     {check.issues.map((issue,i)=><li key={i}>{issue}</li>)}
    </ul>
   </div>}
   <details style={{marginTop:11}}>
    <summary>Overføringer: gebyrer ({check.fees.length}) og utbetalinger ({check.payouts.length})</summary>
    <div style={{overflowX:"auto",marginTop:8}}>
     <table style={{width:"100%"}}>
      <thead><tr><th>Dato</th><th>Type</th><th>Beløp</th><th>Kontroll</th></tr></thead>
      <tbody>{[
       ...check.fees.map(x=>({...x,type:"Gebyr"})),
       ...check.payouts.map(x=>({...x,type:"Utbetaling"}))
      ].map((r,i)=><tr key={r.type+"-"+r.reference+"-"+i}>
       <td>{r.date}</td><td>{r.type}</td><td>{kr(r.amountOre)}</td>
       <td>{detailStatus[r.status]||"Må undersøkes"}
        {r.voucherId&&<small style={{display:"block"}}>Bilags-ID: {r.voucherId}</small>}</td>
      </tr>)}</tbody>
     </table>
    </div>
   </details>
   <details style={{marginTop:10}}>
    <summary>Vis åpne Tripletex-poster ({check.openPostingCount})</summary>
    <div style={{overflowX:"auto",marginTop:8}}>
     <table style={{width:"100%"}}>
      <thead><tr><th>Dato</th><th>Beskrivelse</th><th>Beløp</th></tr></thead>
      <tbody>{check.openPostings.map(x=><tr key={x.id}>
       <td>{x.date}</td><td>{x.description||"Bilag "+x.voucherId}</td>
       <td>{kr(x.amountOre)}</td>
      </tr>)}</tbody>
     </table>
    </div>
    {check.openPostingsTruncated&&<p>Viser de første 100. Summen er kontrollert
     mot alle {check.openPostingCount} åpne poster.</p>}
   </details>
   <p className={styles.hint} style={{marginTop:12}}>
    {check.disclaimer}
   </p>
  </div>}
 </section>;
}
