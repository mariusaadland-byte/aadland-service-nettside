"use client";
import styles from "./VatTermPage.module.css";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);

export default function VatQuickBalance({report,settlement,onDetails,onRefresh}){
 const comparison=report.comparison||{};
 const output=comparison.outputVatOre,input=comparison.inputVatOre;
 const valid=Number.isSafeInteger(output)&&Number.isSafeInteger(input)&&
  Number.isSafeInteger(comparison.differenceOre)&&output-input===comparison.differenceOre;
 const direction=settlement?.direction;
 const directionLabel=direction==="payable"?"Du ligger an til å betale MVA":
  direction==="receivable"?"Du ligger an til å få MVA tilbake":
  "Foreløpig i balanse";
 return <section className={styles.balancePanel} aria-labelledby="vat-quick-balance">
  <div className={styles.balanceTop}>
   <h2 id="vat-quick-balance">Din MVA-status</h2>
   <span>{report.period?.title||"Valgt termin"}</span>
  </div>
  {settlement?<div aria-live="polite">
   <p className={styles.balanceDirection}>{directionLabel}</p>
   <strong className={styles.balanceAmount}>{money(settlement.amountOre)}</strong>
  </div>:<p role="status" className={styles.balanceUnverified}>
   <strong>Beløp å betale / til gode vises ikke ennå.</strong>{" "}
   {report.registrationReview?.message||"MVA-registreringen eller rapportgrunnlaget må kontrolleres."}
  </p>}
  {valid&&<dl className={styles.balanceBreakdown}>
   <div><dt>Utgående MVA fra registrerte salg</dt><dd>{money(output)}</dd></div>
   <div><dt>Fradragsberettiget MVA fra registrerte kjøp</dt><dd>{money(input)}</dd></div>
  </dl>}
  <p className={styles.balanceHelp}>
   {report.purchases?.documentCount??0} registrerte kjøpsbilag i terminen.
   {" "}Dette er bare en foreløpig beregning ut fra opplysningene i Aadland Service,
   ikke et betalingskrav eller bekreftet tilgodebeløp. Manglende bilag fra andre systemer
   kan endre resultatet.
  </p>
  <div className={styles.balanceActions}>
   <button type="button" onClick={onDetails}>Se hele MVA-oversikten</button>
   <button type="button" onClick={onRefresh}>Oppdater tall</button>
  </div>
 </section>;
}
