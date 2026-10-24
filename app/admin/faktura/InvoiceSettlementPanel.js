"use client";
import {invoiceSettlementInfo} from "../../../lib/invoiceSettlementInfo";
import {invoicePaymentProgress} from "../../../lib/invoicePartialPayments";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
export default function InvoiceSettlementPanel({invoice,today}){
 const a=invoice.activity;
 if(invoice.status==="draft")return null;
 const status=invoiceSettlementInfo(invoice,today);
 const progress=invoicePaymentProgress(status);
 return <section id="invoice-settlement" style={{padding:"18px 0",borderBottom:"1px solid #d8c9ae",marginBottom:16}}>
  <h2>Oppgjør og korrigeringer</h2>
  <p style={{margin:"6px 0 14px"}}>
   <strong style={{color:status.needsReview?"#983921":"inherit"}}>{status.label}</strong>
   {status.needsReview&&<span> – kontroller før videre betalingsoppfølging</span>}
  </p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:12}}>
   <div><small>Opprinnelig faktura</small><div><strong>{money(status.gross)}</strong></div></div>
   <div><small>Kreditert beløp</small><div><strong>{money(status.credited)}</strong></div></div>
   <div><small>Registrert netto innbetalt</small><div><strong>{money(status.paid)}</strong></div></div>
   {status.outstanding>0&&<div><small>Gjenstående krav</small><div><strong>{money(status.outstanding)}</strong></div></div>}
  </div>
  {progress.amount>0&&<div style={{margin:"10px 0 18px",padding:"12px 14px",border:"1px solid #e3d6bf",borderRadius:10}}>
   <div style={{display:"flex",gap:10,justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap"}}>
    <strong>{progress.paidPercent}% av korrigert fakturabeløp er betalt</strong>
    <small>{money(progress.paid)} av {money(progress.amount)}</small>
   </div>
   <div role="progressbar" aria-label="Andel av fakturabeløpet som er betalt" aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={progress.paidPercent} style={{height:12,background:"#e5dfd4",borderRadius:20,overflow:"hidden",marginTop:8}}>
    <div style={{height:"100%",background:"#836431",width:progress.paidPercent+"%"}}/>
   </div>
   {progress.outstanding>0&&<p style={{fontSize:13,margin:"8px 0 0"}}>Restbeløp: <strong>{money(progress.outstanding)}</strong>. Nye registrerte innbetalinger trekkes fra dette beløpet.</p>}
  </div>}
  {a&&<div style={{fontSize:13,lineHeight:1.6,marginBottom:12}}>
   {a.vippsCapturedOre>0&&<div>Vipps trukket: <strong>{money(a.vippsCapturedOre)}</strong></div>}
   {status.refunded>0&&<div>Refundert via Vipps: <strong>{money(status.refunded)}</strong></div>}
   {a.vippsCapturedOre>0&&<div>Vipps netto etter refusjoner: <strong>{money(status.netVipps)}</strong> <small>(inngår i innbetalt beløp over)</small></div>}
   {a.creditNoteCount>0&&<div>Kreditnotaer: <strong>{a.creditNoteCount}</strong> · Sendt på e-post: {a.creditNoteSentCount}</div>}
   {status.active>0&&<div>Åpne Vipps-forespørsler: <strong>{status.active}</strong></div>}
  </div>}
  {status.guidance&&<p role="status" style={{padding:12,background:"#fff4e6",border:"1px solid #e0bc87",borderRadius:8}}>
   <strong>Oppfølging:</strong> {status.guidance}
  </p>}
  {status.kind==="refundedOutstanding"&&<p style={{fontSize:13}}>
   <a href="#invoice-credit-note">Gå til kreditnota</a> dersom fakturabeløpet skal reduseres.
   Et utestående krav blir ikke slettet automatisk av en refusjon.
  </p>}
  {a&&<p className="muted" style={{fontSize:12}}>
   Tallene er registrert i fakturasystemet. Oppdater oversikten og kontroller Vipps-status ved nye betalinger eller refusjoner.
  </p>}
 </section>;
}
