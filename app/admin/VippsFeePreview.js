"use client";
import {useId,useState} from "react";
import {vippsFeeEstimateForPayments,vippsPriceForPayoutWithPayments} from "../../lib/vippsFeeEstimate";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const parse=value=>{const s=String(value).trim().replace(",",".");return s?Number(s):NaN};
export default function VippsFeePreview({amountOre,title="Vipps – intern prisberegning",note="",onApply,applyLabel="Bruk beregnet pris",disabled=false,paymentPercentages=[100],allowPriceAdjustment=true,noPriceAdjustmentText="Ingen materialer eller andre varelinjer å justere. Timeprisen endres aldri; Vipps-kostnaden dekkes av bedriften."}){
 const id=useId(),[percent,setPercent]=useState("2.99"),[fixed,setFixed]=useState("1"),[target,setTarget]=useState("");
 const rawRate=parse(percent)*100,rawFixed=parse(fixed)*100;
 const terms={rateBps:Math.round(rawRate),fixedOre:Math.round(rawFixed)};
 const valid=Number.isFinite(rawRate)&&Number.isFinite(rawFixed);
 const estimate=valid?vippsFeeEstimateForPayments(Number(amountOre),paymentPercentages,terms):null;
 const desired=target.trim()?Math.round(parse(target)*100):null;
 const suggestion=allowPriceAdjustment&&valid&&desired!==null?vippsPriceForPayoutWithPayments(desired,paymentPercentages,terms):null;
 return <section aria-label={title} style={{padding:14,margin:"12px 0",background:"#f8f5ee",border:"1px solid #ddd0b9",borderRadius:10}}>
  <h4 style={{margin:"0 0 8px"}}>{title}</h4>
  {estimate?<div aria-live="polite"><div>Kundepris inkl. mva.: <b>{money(estimate.amountOre)}</b></div><div>Anslått Vipps-kostnad: <b>{money(estimate.feeOre)}</b></div><div>Anslått utbetalt etter Vipps: <b>{money(estimate.payoutOre)}</b></div></div>:<p>Kontroller beløp og gebyrsats.</p>}
  <p style={{fontSize:12,margin:"8px 0"}}>{estimate?.paymentCount>1?"Det er regnet "+estimate.paymentCount+" Vipps-betalinger etter betalingsplanen, med fastgebyr per betaling. ":""}Utbetalingen er før øvrige kostnader og mva-oppgjør. Standardsats for Integrert betaling: 2,99 % + 1 kr per betaling. Faktisk avtale og oppgjør kan avvike.{note?" "+note:""}</p>
  <details><summary>{allowPriceAdjustment?"Beregn pris fra ønsket utbetaling / endre beregningssats":"Endre Vipps-gebyrsats"}</summary>
   <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:10}}>
    <label htmlFor={id+"-percent"}>Vipps-sats (%)<input id={id+"-percent"} type="text" inputMode="decimal" value={percent} disabled={disabled} onChange={e=>setPercent(e.target.value)}/></label>
    <label htmlFor={id+"-fixed"}>Fast beløp per betaling (kr)<input id={id+"-fixed"} type="text" inputMode="decimal" value={fixed} disabled={disabled} onChange={e=>setFixed(e.target.value)}/></label>
   </div>
   {allowPriceAdjustment&&<label htmlFor={id+"-target"}>Ønsket utbetaling før mva-oppgjør (kr)<input id={id+"-target"} type="text" inputMode="decimal" value={target} disabled={disabled} onChange={e=>setTarget(e.target.value)}/></label>}
   {suggestion&&<div aria-live="polite"><p>Ordinær kundepris inkl. mva.: <b>{money(suggestion.amountOre)}</b><br/>Anslått Vipps-kostnad: {money(suggestion.feeOre)}<br/>Anslått utbetaling: <b>{money(suggestion.payoutOre)}</b></p>{onApply&&<button type="button" disabled={disabled} onClick={()=>onApply(suggestion.amountOre)}>{applyLabel}</button>}</div>}
   {allowPriceAdjustment&&target&&!suggestion&&<p role="status">Oppgi et gyldig beløp og en sats under 100 %.</p>}
   {!allowPriceAdjustment&&<p style={{fontSize:12}}>Ingen materialer eller andre varelinjer å justere. Timeprisen endres aldri; Vipps-kostnaden dekkes av bedriften.</p>}
   <p style={{fontSize:12}}>Beregningen er intern. Kunden ser den ordinære prisen, som må være avtalt før bestilling. Beregningssatsen lagres ikke i Vipps-avtalen.</p>
  </details>
 </section>;
}
