"use client";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
import {invoiceFollowUpState} from "../../../lib/invoiceFollowUpState";
import styles from "./InvoiceWorkspace.module.css";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
 .format((Number(ore)||0)/100);
export default function InvoiceQuickActions({invoice,today,onSwitch,onPrint,onSelectAction,selectedAction=null,disabled=false}){
 const payment=invoicePaymentState(invoice,today);
 const follow=invoiceFollowUpState(invoice,today);
 const pending=payment.outstanding>0;
 const canVipps=!invoice.split_group_id;
 const options=[
  {label:pending?"Registrer bank- eller kontantbetaling":"Se betalingshistorikk",
   target:"invoice-payment-actions",primary:pending},
  ...(canVipps?[{label:"Vipps og betalingsvalg",target:"invoice-vipps-payment"}]:[]),
  ...(pending?[{label:"Vennlig betalingspåminnelse",target:"invoice-friendly-reminder"},
   {label:"Purring eller inkassovarsel",target:"invoice-reminder-actions"}]:[]),
  {label:"Opprett / se kreditnota",target:"invoice-credit-note"},
  {label:"Samlet betalingsoversikt",target:"invoice-payment-statement"}
 ];
 return <section className={styles.actionHero} aria-label="Handlinger for valgt faktura">
  <div className={styles.heroHeading}>
   <div>
    <p className={styles.heroEyebrow}>Valgt utsendt faktura</p>
    <h2>Faktura {invoice.invoice_number||"uten nummer"}</h2>
    <p className={styles.heroCustomer}>{invoice.customer?.name||"Kunde ikke registrert"}
     {invoice.issued_date?" · Utstedt "+invoice.issued_date:""}
     {invoice.due_date?" · Forfall "+invoice.due_date:""}</p>
    <span className={styles.heroStatus} data-alert={payment.outstanding>0&&follow.requiresAction?"true":"false"}>
     {payment.label}{payment.outstanding>0&&follow.requiresAction?" · Trenger oppfølging":""}
    </span>
   </div>
   <button type="button" className={styles.changeInvoice} onClick={onSwitch}>
    Velg en annen faktura
   </button>
  </div>
  <div className={styles.summary}>
   <div><span>Fakturert</span><strong>{money(payment.gross)}</strong></div>
   <div><span>Innbetalt</span><strong>{money(payment.paid)}</strong></div>
   <div><span>Gjenstår</span><strong>{money(payment.outstanding)}</strong></div>
  </div>
  <h3 className={styles.actionTitle}>Hva vil du gjøre med fakturaen?</h3>
  <div className={styles.actionGrid}>
   {options.map(({label,target,primary})=><button type="button" key={target}
    className={styles.actionButton+(primary?" "+styles.actionPrimary:"")}
    aria-pressed={selectedAction===target}
    onClick={()=>onSelectAction(selectedAction===target?null:target)}>
    {label}<span aria-hidden="true" className={styles.arrow}>{selectedAction===target?"−":"›"}</span>
   </button>)}
   <a className={styles.actionButton}
    href="/admin/faktura/mva/tripletex#tripletex-fakturaer">
    Tripletex – klargjør fakturaimport
    <span aria-hidden="true" className={styles.arrow}>↗</span>
   </a>
   <a className={styles.actionButton}
    href={"/api/admin/invoices/pdf?id="+encodeURIComponent(invoice.id)}
    target="_blank" rel="noreferrer">Åpne faktura (PDF)
    <span aria-hidden="true" className={styles.arrow}>↗</span></a>
   <button type="button" disabled={disabled} className={styles.actionButton} onClick={onPrint}>
    Skriv ut faktura<span aria-hidden="true" className={styles.arrow}>›</span>
   </button>
  </div>
  <div className={styles.secondaryActions}>
   {[
    ["invoice-details","Fakturadetaljer"],
    ["invoice-followup-status","Oppfølgingsstatus"],
    ["invoice-settlement","Oppgjør og korrigeringer"],
    ["invoice-activity-timeline","Hendelseslogg"],
    ["invoice-administrative-close","Avslutt faktura administrativt"]
   ].map(([target,label])=><button key={target} type="button"
    aria-pressed={selectedAction===target}
    onClick={()=>onSelectAction(selectedAction===target?null:target)}>
    {label} {selectedAction===target?"−":"›"}
   </button>)}
  </div>
  <p style={{color:"#675e51",fontSize:12,lineHeight:1.6,margin:"15px 0 0"}}>
   Velg én handling. Bare den valgte åpnes under knappene. Ingenting sendes, registreres eller krediteres før du bekrefter det.
  </p>
 </section>;
}
