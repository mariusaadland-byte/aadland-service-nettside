"use client";
import {useState} from "react";
import {rentalProfitability} from "../../../../lib/rentalProfitability.mjs";
import styles from "./profitability.module.css";
const empty={purchase:"",daily:"",variable:"",fixed:"",days:"",earned:"",spent:""};
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const fields=[
 ["purchase","Innkjøpspris per maskin (kr)","Anskaffelseskostnad etter eventuell fradragsberettiget mva."],
 ["daily","Gjennomsnittlig leieinntekt per utleid dag (kr)","Etter rabatt, eks. mva."],
 ["variable","Variable kostnader per utleid dag (kr)","Gebyrer, slitasje, forbruk og andre direkte kostnader."],
 ["fixed","Faste kostnader per måned (kr)","Fordelt andel av forsikring, lager og planlagt vedlikehold."],
 ["days","Forventede utleiedager per 30-dagers måned","0–30 hele dager."],
 ["earned","Opptjent leieinntekt hittil (kr)","Kun denne maskinen, eks. mva., etter refusjoner."],
 ["spent","Driftskostnader hittil (kr)","Kun denne maskinen, uten innkjøpsprisen."]
];
export default function ProfitabilityClient(){
 const [v,setV]=useState(empty);
 const result=rentalProfitability(v);
 return <section className={styles.panel}><h2>Din beregning</h2><p>Bruk beløp uten fradragsberettiget mva. Fyll inn 0 der kostnad eller historikk faktisk er null. Ikke ta med depositum eller forventede inntekter i historiske beløp.</p><div className={styles.fields}>{fields.map(([k,label,hint])=><label key={k}>{label}<input inputMode={k==="days"?"numeric":"decimal"} value={v[k]} onChange={e=>setV(x=>({...x,[k]:e.target.value}))} placeholder="" maxLength={12}/><small>{hint}</small></label>)}</div>
 <button type="button" className="btn alt" onClick={()=>setV(empty)}>Nullstill beregningen</button>
 {!result?<p role="status">Fyll inn alle feltene med gyldige beløp og antall dager. Innkjøpspris og leieinntekt per dag må være større enn null.</p>:<div aria-live="polite"><h2>Resultat før skatt</h2><div className={styles.stats}>
 {[
 ["Dekningsbidrag per utleid dag",money(result.dailyContribution)],
 ["Forventet leieinntekt per måned",money(result.monthlyRevenue)],
 ["Forventet bidrag per måned etter kostnader",money(result.monthlyContribution)],
 ["Historisk bidrag etter driftskostnader",money(result.recovered)],
 ["Gjenstår å dekke innkjøpet",money(result.remaining)],
 ["Forventet tid til inndekning",result.months===null?"Ingen inndekning med disse tallene":result.months===0?"Allerede dekket":result.months.toLocaleString("nb-NO",{maximumFractionDigits:1})+" måneder"],
 ["Forventede utleiedager til inndekning",result.projectedDays===null?"—":String(result.projectedDays)],
 ["Utleiedager for å dekke faste månedskostnader",result.breakEvenDays===null?"Ikke mulig med disse tallene":result.breakEvenDays+" dager"]
 ].map(([l,n])=><div key={l}><small>{l}</small><b>{n}</b></div>)}</div><p>Dette er en forenklet kontantbidragsberegning, ikke regnskapsmessig overskudd. Skatt, avskrivninger, finansiering og restverdi er ikke automatisk inkludert. Forutsetter samme pris, kostnad og utleiegrad fremover.</p></div>}
 </section>;
}
