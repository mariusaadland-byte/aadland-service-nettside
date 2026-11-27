"use client";
import {useState} from "react";
import {rentalDeliveryQuote} from "../../../../lib/rentalDelivery.mjs";
import styles from "../eget-bruk/ownUse.module.css";
const blank={service:"delivery",distance:"",maxDistance:"",kmRate:"",base:"",extras:"",postcode:"",allowedPostcodes:"",rent:"",deposit:""};
const fields=[["distance","Kjøreavstand én vei (km)","Bruk faktisk kjørerute, ikke luftlinje."],["maxDistance","Maksimal leveringsavstand én vei (km)","Din egen grense."],["kmRate","Kilometerpris inkl. mva. (kr/km)","Pris per faktisk kjørte kilometer."],["base","Fast startpris per tur inkl. mva. (kr)","Sett 0 hvis ingen startpris."],["extras","Bom, ferge og øvrige tillegg per tur inkl. mva. (kr)","Samlet for tur-retur. Sett 0 hvis ingen tillegg."],["rent","Avtalt leie inkl. mva. (kr)","Leie uten transport."],["deposit","Depositum (kr)","Separat sikkerhet, ikke en del av leieprisen."]];
const kr=v=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(v/100);
export default function DeliveryClient(){
 const [v,setV]=useState(blank),q=rentalDeliveryQuote(v);
 const edit=(k,value)=>setV(x=>({...x,[k]:value}));
 return <section className={styles.panel}><h2>Transportberegning</h2><label>Tjeneste<select value={v.service} onChange={e=>edit("service",e.target.value)}><option value="delivery">Levering til kunden</option><option value="collection">Hente utstyr hos kunden</option><option value="both">Levering og henting hos kunden</option></select></label>
 <label>Kundens postnummer<input inputMode="numeric" maxLength={4} value={v.postcode} onChange={e=>edit("postcode",e.target.value)}/></label><label>Godkjente postnumre (valgfritt)<textarea rows={3} value={v.allowedPostcodes} onChange={e=>edit("allowedPostcodes",e.target.value)} placeholder="Skill postnumrene med mellomrom eller komma"/><small>Tom liste: kun avstandsgrensen brukes. Postnumre og avstander kontrolleres manuelt.</small></label>
 <div className={styles.dates}>{fields.map(([k,label,hint])=><label key={k}>{label}<input inputMode="decimal" value={v[k]} onChange={e=>edit(k,e.target.value)} maxLength={12}/><small>{hint}</small></label>)}</div>
 <p>En tjeneste regnes som tur-retur fra samme utgangspunkt. Ved levering og innhenting regnes to tur-retur-turer til samme adresse. Ved ulike kostnader beregnes turene separat.</p>
 <h2>Resultat</h2>{!q?<p>Fyll inn gyldige verdier i alle beløps- og avstandsfelter, inkludert 0 når noe ikke koster noe.</p>:!q.eligible?<p role="status">{q.reason}</p>:<div aria-live="polite"><p>Totalt kjørte kilometer: <b>{q.drivingKm.toLocaleString("nb-NO")}</b></p><p>Pris per tur-retur: <b>{kr(q.perTripOre)}</b></p><p>Antall tur-retur-turer: {q.trips}</p><p>Transport inkl. mva.: <b>{kr(q.transportOre)}</b></p><p>Leie inkl. mva.: <b>{kr(q.rentOre)}</b></p><h3>Leie og transport: {kr(q.totalOre)}</h3><p>Depositum separat: <b>{kr(q.depositOre)}</b></p><p>Intern prisberegning – ikke en bekreftet booking eller faktura.</p></div>}
 <button type="button" onClick={()=>setV(blank)}>Nullstill beregning</button></section>;
}
