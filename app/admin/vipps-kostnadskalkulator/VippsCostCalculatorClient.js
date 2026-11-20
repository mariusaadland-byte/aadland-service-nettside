"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {
 calculateVippsCostPreview,VIPPS_COST_PAYMENT_PLANS
} from "../../../lib/vippsCostCalculator";
import styles from "./vippsCostCalculator.module.css";

const money=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2
}).format((Number(ore)||0)/100);

export default function VippsCostCalculatorClient(){
 const [type,setType]=useState("invoice");
 const [invoicePrice,setInvoicePrice]=useState("1000,00");
 const [rentalPrice,setRentalPrice]=useState("1500,00");
 const [deposit,setDeposit]=useState("2000,00");
 const [rate,setRate]=useState("2,99");
 const [fixed,setFixed]=useState("1,00");
 const [plan,setPlan]=useState("once");
 const [desired,setDesired]=useState("");
 const price=type==="rental"?rentalPrice:invoicePrice;
 const result=useMemo(()=>calculateVippsCostPreview({
  type,price,deposit,rate,fixed,plan,desired
 }),[type,price,deposit,rate,fixed,plan,desired]);
 const setPrice=type==="rental"?setRentalPrice:setInvoicePrice;
 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.header}>
    <Link href="/admin" className={styles.back}>← Adminoversikt</Link>
    <p className={styles.eyebrow}>AADLAND SERVICE / INTERN KALKYLE</p>
    <h1>Vipps-kostnad og utbetaling</h1>
    <p>Regn ut hva en faktura eller utleiebetaling koster i Vipps,
     og hvor mye bedriften forventes å få utbetalt. Ingen betaling opprettes.</p>
   </header>

   <div className={styles.tabs} role="group" aria-label="Velg hva som skal beregnes">
    <button type="button" className={type==="invoice"?styles.selected:""}
     aria-pressed={type==="invoice"} onClick={()=>{setType("invoice");setDesired("");}}>
     <span>Faktura</span><small>Én betaling eller delbetalinger</small>
    </button>
    <button type="button" className={type==="rental"?styles.selected:""}
     aria-pressed={type==="rental"} onClick={()=>{setType("rental");setDesired("");}}>
     <span>Utleie</span><small>Leiebeløp uten depositum</small>
    </button>
   </div>

   <div className={styles.layout}>
    <section className={styles.panel} aria-label="Beløp og Vipps-vilkår">
     <h2>1. Legg inn beløpene</h2>
     <label className={styles.field}>
      <strong>{type==="invoice"?"Fakturabeløp inkl. MVA (kr)":"Leiebeløp inkl. MVA (kr)"}</strong>
      <input type="text" inputMode="decimal" value={price}
       onChange={e=>setPrice(e.target.value)} placeholder="1000,00"/>
      <small>Beløpet kunden skal betale for {type==="invoice"?"fakturaen":"leien"}.</small>
     </label>
     {type==="rental"&&<label className={styles.field}>
      <strong>Depositum (kr) – holdes utenfor</strong>
      <input type="text" inputMode="decimal" value={deposit}
       onChange={e=>setDeposit(e.target.value)} placeholder="2000,00"/>
      <small>Depositum er sikkerhet, ikke leieinntekt. Det regnes ikke med i
       leiebeløpets Vipps-gebyr her. Hvis depositum betales via Vipps
       som en egen transaksjon, kan det også utløse et separat gebyr.</small>
     </label>}
     {type==="invoice"&&<label className={styles.field}>
      <strong>Antall betalinger på fakturaen</strong>
      <select value={plan} onChange={e=>setPlan(e.target.value)}>
       {Object.entries(VIPPS_COST_PAYMENT_PLANS).map(([id,p])=>
        <option key={id} value={id}>{p.label}</option>)}
      </select>
      <small>Fastgebyret regnes én gang per faktisk betaling.
       En betalingsplan er bare et eksempel frem til betalingene skjer.</small>
     </label>}
     <div className={styles.divider}/>
     <h2>2. Kontroller din Vipps-avtale</h2>
     <div className={styles.twoFields}>
      <label className={styles.field}>
       <strong>Vipps-gebyr (%)</strong>
       <input type="text" inputMode="decimal" value={rate}
        onChange={e=>setRate(e.target.value)} placeholder="2,99"/>
      </label>
      <label className={styles.field}>
       <strong>Fastgebyr per betaling (kr)</strong>
       <input type="text" inputMode="decimal" value={fixed}
        onChange={e=>setFixed(e.target.value)} placeholder="1,00"/>
      </label>
     </div>
     <p className={styles.warning}>
      <strong>Viktig:</strong> 2,99 % + 1 kr er kun et forhåndsutfylt
      beregningseksempel, ikke bekreftede vilkår i din Vipps-avtale.
      Endre feltene etter satsen du faktisk betaler.
     </p>
     <button type="button" className={styles.reset}
      onClick={()=>{setRate("2,99");setFixed("1,00");setPlan("once");setDesired("");}}>
      Nullstill gebyreksempelet
     </button>
    </section>

    <section className={styles.panel} aria-label="Beregnet kostnad og utbetaling">
     <h2>3. Beregnet resultat</h2>
     {!result.ok?<p className={styles.error} role="alert">{result.error}</p>:
      <div className={styles.summary} aria-live="polite">
       <div className={styles.figure}><span>Kunden betaler</span>
        <strong>{money(result.amountOre)}</strong></div>
       <div className={styles.figure}><span>Estimert Vipps-gebyr</span>
        <strong className={styles.fee}>− {money(result.feeOre)}</strong></div>
       <div className={styles.figurePrimary}>
        <span>Forventet utbetalt fra Vipps</span>
        <strong>{money(result.payoutOre)}</strong>
       </div>
       <div className={styles.details}>
        <span>Antall gebyrbelagte betalinger</span><strong>{result.paymentCount}</strong>
       </div>
       {type==="rental"&&<>
        <div className={styles.details}><span>Depositum (ikke med i gebyrgrunnlaget)</span>
         <strong>{money(result.depositOre)}</strong></div>
        <div className={styles.details}><span>Grunnlag for Vipps-gebyret</span>
         <strong>{money(result.feeBaseOre)}</strong></div>
       </>}
       {result.payoutOre<0&&<p className={styles.error}>
        Estimert gebyr er høyere enn beløpet. Kontroller vilkårene.
       </p>}
      </div>}
     <div className={styles.divider}/>
     <h2>4. Regn baklengs fra ønsket utbetaling</h2>
     <label className={styles.field}>
      <strong>Jeg vil sitte igjen med etter Vipps-gebyr (kr)</strong>
      <input type="text" inputMode="decimal" value={desired}
       onChange={e=>setDesired(e.target.value)} placeholder="F.eks. 1000,00"/>
      <small>Dette er et beregnet utbetalingsbeløp før skatt, MVA-oppgjør og
       øvrige kostnader – ikke bedriftens overskudd.</small>
     </label>
     {result.ok&&result.suggested&&<div className={styles.suggestion} aria-live="polite">
      <div><span>Foreslått kundepris inkl. MVA</span>
       <strong>{money(result.suggested.amountOre)}</strong></div>
      <div><span>Estimert Vipps-gebyr</span>
       <strong>{money(result.suggested.feeOre)}</strong></div>
      <div><span>Estimert utbetaling</span>
       <strong>{money(result.suggested.payoutOre)}</strong></div>
      <p>Beregningen endrer ikke fakturaer, leiepriser eller allerede
       avtalte kundepriser. Eventuell ny kundepris må avtales på forhånd.</p>
     </div>}
     <p className={styles.footnote}>Dette er en intern kostnadskalkulator.
      Faktiske Vipps-oppgjør, avtalevilkår, refusjoner og eventuelle
      særgebyrer kan gi andre tall. Ingen data overføres til Tripletex.</p>
    </section>
   </div>
   <nav className={styles.links} aria-label="Andre relevante adminområder">
    <Link href="/admin/faktura">Fakturakladder</Link>
    <Link href="/admin/utleie">Utleieutstyr</Link>
    <Link href="/admin/utviklingsplan">Tilbake til utviklingsplan</Link>
   </nav>
  </div>
 </main>;
}
