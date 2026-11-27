"use client";
import {useState,useEffect} from "react";
import styles from "./rentalAccessories.module.css";
export default function RentalSigningControl({review,onChange,busy}){
 const [name,setName]=useState(""),[agreed,setAgreed]=useState(false),[witnessed,setWitnessed]=useState(false);
 const serialized=review?JSON.stringify(review):"";
 useEffect(()=>{onChange(serialized?{name,agreed,witnessed,review:serialized}:null);},[name,agreed,witnessed,serialized,onChange]);
 if(!review)return <section className={styles.panel}><h4>Kundens signering</h4><p>Fullfør kontrollpunkter og tilbehørsregistrering før kunden signerer.</p></section>;
 return <section className={styles.panel}><h4>Kundens signering – {review.phase==="active"?"utlevering":"retur"}</h4><p>Vis kunden hele rapporten. Kunden skriver selv inn navnet sitt på mobilen eller nettbrettet. Endringer i rapporten krever ny signering.</p><h4>{review.itemName}</h4><p>Booking {review.bookingNumber} · {review.startDate} – {review.endDate}</p>
 {review.checks.map(x=><p key={x}>✓ {x}</p>)}
 {review.legacy?<p>Eldre booking: opprinnelig tilbehørsliste mangler.</p>:review.accessories.length?review.accessories.map(x=><p key={x.name}>{x.name} · Utlevert {x.quantity}{review.phase==="returned"?" · Returnert "+x.returned+" · Skadet "+x.damaged+" · Mangler "+x.missing:""}</p>):<p>Ingen løse tilbehørsdeler registrert.</p>}
 <p>Avvik: {review.deviation?"Ja":"Nei"}</p><p>Kontrollmerknad: {review.note||"Ingen merknad"}</p><p><b>{review.statement}</b></p>
 <label className="field">Kundens fulle navn<input autoComplete="off" maxLength={120} value={name} onChange={e=>{setName(e.target.value);setAgreed(false);setWitnessed(false);}} disabled={busy}/></label>
 <label className={styles.check}><input type="checkbox" checked={agreed} onChange={e=>{setAgreed(e.target.checked);setWitnessed(false);}} disabled={busy}/> Jeg har lest rapporten og signerer med navnet mitt.</label>
 <label className={styles.check}><input type="checkbox" checked={witnessed} onChange={e=>setWitnessed(e.target.checked)} disabled={busy||!agreed}/> Utleier: Jeg bekrefter at kunden selv signerte i mitt nærvær.</label>
 <p>Dette er en enkel elektronisk navnesignatur, ikke BankID. Ingen betaling eller krav godkjennes gjennom signaturen.</p></section>;
}
