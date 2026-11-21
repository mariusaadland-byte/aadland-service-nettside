"use client";
import {vippsServiceSettlementReview} from "../../../../../lib/vippsServiceSettlementReview";
import styles from "./TripletexReceipts.module.css";

const kroner=ore=>Number.isSafeInteger(ore)?
 new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100):
 "Ikke kjent";

export default function VippsServiceSettlementReview({unit,cacheInfo,report}){
 const audit=vippsServiceSettlementReview({unit,cacheInfo,report});
 if(!audit)return null; // The rental settlement must remain untouched.
 return <section aria-label="Vipps Service – kontroll av oppgjørsgrunnlag"
  style={{border:"1px solid #b5c0c7",borderRadius:10,padding:"14px",
   margin:"14px 0",minWidth:0}}>
  <h3 style={{fontSize:17,margin:"0 0 8px"}}>
   Vipps Service – hva er faktisk overført?
  </h3>
  <strong role="status" style={{display:"block",fontSize:15,marginBottom:7}}>
   {audit.title}
  </strong>
  <p className={styles.hint} style={{margin:"4px 0 10px"}}>{audit.message}</p>
  {Number.isInteger(audit.storedDays)&&<div
   style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",
    gap:8,marginBottom:9}}>
   {[
    ["Lagrede rapportdager",audit.storedDays+" / "+audit.totalDays],
    ["Vipps-betalinger",kroner(audit.capturesOre)],
    ["Trukne gebyrer",kroner(-audit.retainedFeesOre)],
    ["Gebyroverføringer loggført",audit.feesConfirmed+" / "+audit.feeCount],
    ["Planlagte bankutbetalinger",String(audit.payoutCount)],
    ["Bekreftede oppgjørsbilag",String(audit.payoutsConfirmed)],
    ["Siste Vipps-saldo",kroner(audit.lastVippsBalanceOre)]
   ].map(([label,value])=><div key={label} style={{
    border:"1px solid #d9dee0",borderRadius:8,padding:"8px 10px",minWidth:0}}>
    <small style={{display:"block",lineHeight:1.4}}>{label}</small>
    <strong style={{display:"block",overflowWrap:"anywhere"}}>{value}</strong>
   </div>)}
  </div>}
  <p className={styles.hint} style={{margin:"5px 0"}}>
   Gjelder kun den valgte perioden {audit.periodFrom||"–"}–{audit.periodTo||"–"}.
   {audit.lastActivityDate&&" Siste Vipps-post: "+audit.lastActivityDate+"."}
   {!audit.complete&&" Rapporter mangler; hent de resterende dagene før avstemming."}
  </p>
  <p className={styles.hint} style={{margin:"7px 0 0"}}>
   <strong>Viktig:</strong> «Bekreftet» betyr bekreftet i Aadland Services
   overføringslogg. For uavhengig kontroll av bokføringen, bruk «Kontroller lagret
   Vipps-saldo mot Tripletex» under «Saldokontroll mot Tripletex».
   Ingen poster bokføres eller matches automatisk her.
  </p>
 </section>;
}
