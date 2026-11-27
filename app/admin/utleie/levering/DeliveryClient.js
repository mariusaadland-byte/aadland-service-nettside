"use client";
import {useState} from "react";
import {rentalDeliveryQuote,RENTAL_DELIVERY_POLICY as policy} from "../../../../lib/rentalDelivery.mjs";
import styles from "../eget-bruk/ownUse.module.css";
const blank={service:"delivery",distance:"",postcode:"",deliveryTolls:"",collectionTolls:"",rent:"",deposit:"",override:false,overridePrice:"",overrideReason:""};
const kr=v=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(v/100);
export default function DeliveryClient(){
 const [v,setV]=useState(blank),q=rentalDeliveryQuote(v);
 const edit=(k,value)=>setV(x=>({...x,[k]:value}));
 return <section className={styles.panel}><h2>Transportberegning</h2>
 <div className={styles.entry}><h3>Faste standardsatser</h3><p>12,50 kr/km inkl. mva. (10 kr eks. mva.) · Minst 150 kr · Maks 750 kr per tur-retur.</p><p>Maks 30 km én vei. Bom og ferge kommer i tillegg. Satsene lastes automatisk fra systemet.</p></div>
 <label>Tjeneste<select value={v.service} onChange={e=>edit("service",e.target.value)}><option value="delivery">Levering til kunden</option><option value="collection">Hente utstyr hos kunden</option><option value="both">Levering og henting hos kunden</option></select></label>
 <label>Kundens postnummer<input inputMode="numeric" maxLength={4} value={v.postcode} onChange={e=>edit("postcode",e.target.value)}/></label>
 <label>Kjøreavstand én vei (km)<input inputMode="decimal" value={v.distance} onChange={e=>edit("distance",e.target.value)} maxLength={12}/><small>Kontroller faktisk kjørerute, ikke luftlinje.</small></label>
 {v.service!=="collection"&&<label>Bom og ferge for levering, tur-retur (kr inkl. mva.)<input inputMode="decimal" value={v.deliveryTolls} onChange={e=>edit("deliveryTolls",e.target.value)} maxLength={12}/></label>}
 {v.service!=="delivery"&&<label>Bom og ferge for innhenting, tur-retur (kr inkl. mva.)<input inputMode="decimal" value={v.collectionTolls} onChange={e=>edit("collectionTolls",e.target.value)} maxLength={12}/></label>}
 <p>Kontroller bom/ferge for den faktiske ruten og tidspunktet. Skriv 0 bare dersom det ikke påløper kostnader. Levering og innhenting kan ha ulike tillegg.</p>
 <label>Avtalt leie inkl. mva. (kr)<input inputMode="decimal" value={v.rent} onChange={e=>edit("rent",e.target.value)} maxLength={12}/></label>
 <label>Depositum (kr)<input inputMode="decimal" value={v.deposit} onChange={e=>edit("deposit",e.target.value)} maxLength={12}/></label>
 <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" style={{width:22,minHeight:22}} checked={v.override} onChange={e=>edit("override",e.target.checked)}/> Overstyr transportpris for denne beregningen</label>
 {v.override&&<><label>Avtalt transportpris per tur-retur før bom og ferge<input inputMode="decimal" value={v.overridePrice} onChange={e=>edit("overridePrice",e.target.value)} maxLength={12}/></label><label>Begrunnelse<textarea rows={2} maxLength={300} value={v.overrideReason} onChange={e=>edit("overrideReason",e.target.value)}/></label></>}
 <h2>Resultat</h2>{!q?<p>Fyll inn avstand, postnummer, kostnader, leie og depositum. Ingen ukjent kostnad regnes automatisk som 0.</p>:!q.eligible?<p role="status">{q.reason}</p>:<div aria-live="polite"><p>Totalt kjørte kilometer: <b>{q.drivingKm.toLocaleString("nb-NO")}</b></p><p>Standardpris per tur-retur: <b>{kr(q.standardPerTripOre)}</b></p>{q.override&&<p>Overstyrt pris per tur-retur: <b>{kr(q.perTripOre)}</b> · {q.overrideReason}</p>}{v.service!=="collection"&&<p>Levering: <b>{kr(q.deliveryOre)}</b></p>}{v.service!=="delivery"&&<p>Innhenting: <b>{kr(q.collectionOre)}</b></p>}<p>Herav bom og ferge: {kr(q.tollsOre)}</p><p>Transport inkl. mva.: <b>{kr(q.transportOre)}</b></p><p>Leie inkl. mva.: <b>{kr(q.rentOre)}</b></p><h3>Leie og transport: {kr(q.totalOre)}</h3><p>Depositum separat: <b>{kr(q.depositOre)}</b></p><p>Intern prisberegning, ikke bekreftet booking. Prisversjon {policy.version}.</p></div>}
 <button type="button" onClick={()=>setV(blank)}>Nullstill beregning</button></section>;
}
