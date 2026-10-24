"use client";
import {invoiceFollowUpState} from "../../../lib/invoiceFollowUpState";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
export default function InvoiceFollowUpPanel({invoice,today}){
 if(invoice.status==="draft")return null;
 const follow=invoiceFollowUpState(invoice,today);
 const payment=invoicePaymentState(invoice,today);
 return <section id="invoice-follow-up" style={{padding:"14px 16px",border:"1px solid #d9cbb4",borderRadius:10,marginBottom:18}}>
  <h2 style={{fontSize:18,margin:"0 0 9px"}}>Oppfølgingsstatus</h2>
  <p style={{margin:"0 0 7px"}}><strong>{follow.label}</strong></p>
  <p style={{fontSize:13,margin:"0 0 9px"}}>{follow.detail}</p>
  {follow.requiresAction&&payment.outstanding>0&&<p style={{fontSize:13,margin:"0 0 9px"}}>
   Restbeløp som må håndteres: <strong>{money(payment.outstanding)}</strong>
  </p>}
  {follow.href&&<a href={follow.href} style={{fontSize:13}}>
   {follow.key==="overdue"?"Se purring og oppfølging":
    follow.key==="ready"?"Kontroller oppgjør og dokumentasjon":
    follow.key==="closed"?"Se avslutningshistorikk":
    follow.key==="review"?"Gå til kontrollgrunnlaget":"Se innbetalinger"}
  </a>}
  {follow.key==="ready"&&<p style={{fontSize:12,margin:"10px 0 0",color:"#625747"}}>
   Fakturaen er ikke automatisk lukket eller bokført i eksternt regnskapssystem.
  </p>}
 </section>;
}
