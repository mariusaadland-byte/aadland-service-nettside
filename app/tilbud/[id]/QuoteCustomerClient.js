"use client";

import {useEffect,useState} from "react";

const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100);
const typeLabels={work:"Arbeid",material:"Materiale",other:"Annet"};
const statusLabels={draft:"Kladd",sent:"Sendt",accepted:"Godkjent",declined:"Avslått",expired:"Utløpt",cancelled:"Avbrutt"};

export default function QuoteCustomerClient({quoteId,token}){
 const [quote,setQuote]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");

 async function load(){
  setLoading(true);setError("");
  const response=await fetch("/api/quotes/"+encodeURIComponent(quoteId)+"?token="+encodeURIComponent(token));
  const data=await response.json().catch(()=>({}));
  setLoading(false);
  if(!response.ok){setError(data.error||"Tilbudet kunne ikke åpnes.");return;}
  setQuote(data.quote);
 }

 useEffect(()=>{load()},[quoteId,token]);

 async function respond(action){
  const label=action==="accept"?"godkjenne":"avslå";
  if(!window.confirm("Vil du "+label+" dette tilbudet?"))return;
  setSaving(true);setError("");setMessage("");
  const response=await fetch("/api/quotes/"+encodeURIComponent(quoteId),{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({token,action})
  });
  const data=await response.json().catch(()=>({}));
  setSaving(false);
  if(!response.ok){setError(data.error||"Svaret kunne ikke lagres.");return;}
  setQuote(data.quote);
  setMessage(action==="accept"?"Takk. Tilbudet er godkjent. Aadland Service har fått beskjed.":"Tilbudet er registrert som avslått.");
 }

 if(loading)return <main className="customerQuoteShell"><div className="customerQuoteState">Laster tilbud …</div></main>;
 if(!quote)return <main className="customerQuoteShell"><div className="customerQuoteState"><h1>Tilbudet kunne ikke åpnes</h1><p>{error}</p><p>Kontakt Aadland Service på 471 54 898 hvis du trenger hjelp.</p></div></main>;

 const created=quote.createdAt?new Date(quote.createdAt).toLocaleDateString("nb-NO"):"";
 const valid=quote.validUntil?new Date(quote.validUntil+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const start=quote.plannedStartDate?new Date(quote.plannedStartDate+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const canRespond=!quote.isExpired&&!["accepted","declined","cancelled"].includes(quote.status);

 return <main className="customerQuoteShell">
  <div className="customerQuoteTop noPrint">
   <div>
    <b>AADLAND SERVICE</b>
    <span>{quote.quoteNumber}</span>
   </div>
   <div>
    <span className={"customerQuoteStatus customerQuoteStatus-"+quote.status}>{quote.isExpired?"Utløpt":statusLabels[quote.status]||quote.status}</span>
    <button className="btn alt" type="button" onClick={()=>window.print()}>Lagre som PDF</button>
   </div>
  </div>

  {message&&<div className="customerQuoteMessage success noPrint">{message}</div>}
  {error&&<div className="customerQuoteMessage notice noPrint">{error}</div>}

  <article className="quoteDocument customerQuoteDocument">
   <header className="quoteDocHeader">
    <div className="quoteDocBrand">
     <img className="quoteDocLogo" src="/aadland-service-logo.webp" alt="Aadland Service"/>
    </div>
    <div className="quoteDocCompany">
     <b>Marius Aadland</b>
     <span>Org.nr. 937 781 873 MVA</span>
     <span>471 54 898</span>
     <span>post@aadland-service.no</span>
    </div>
   </header>

   <section className="quoteDocTitle">
    <div><span className="quoteDocEyebrow">TILBUD</span><h1>{quote.title}</h1></div>
    <div className="quoteDocMeta">
     <span><small>Tilbudsnummer</small><b>{quote.quoteNumber}</b></span>
     <span><small>Dato</small><b>{created}</b></span>
     <span><small>Gyldig til</small><b>{valid||"—"}</b></span>
     <span><small>Planlagt oppstart</small><b>{start||"Avtales"}</b></span>
    </div>
   </section>

   <section className="quoteDocCustomer">
    <div>
     <span className="quoteDocEyebrow">TIL</span>
     <h2>{quote.customer?.name}</h2>
     {quote.customer?.address&&<p>{quote.customer.address}</p>}
    </div>
    <div>
     {quote.customer?.phone&&<span>{quote.customer.phone}</span>}
     {quote.customer?.email&&<span>{quote.customer.email}</span>}
    </div>
   </section>

   {quote.introText&&<p className="quoteDocIntro">{quote.introText}</p>}

   <section className="quoteDocLines">
    <div className="quoteDocLine quoteDocLineHead"><span>Beskrivelse</span><span>Antall</span><span>Pris eks.</span><span>MVA</span><span>Sum eks.</span></div>
    {quote.lineItems.map((line,index)=>{
     const net=Math.round((Number(line.quantity)||0)*(Number(line.unitPriceOre)||0));
     return <div className="quoteDocLine" key={line.id||index}>
      <span><small>{typeLabels[line.type]||"Linje"}</small><b>{line.description}</b></span>
      <span>{line.quantity} {line.unit}</span>
      <span>{nok(line.unitPriceOre)}</span>
      <span>{line.vatRate}%</span>
      <span><b>{nok(net)}</b></span>
     </div>;
    })}
   </section>

   <section className="quoteDocTotals">
    <div></div><div>
     <span><small>Sum eks. MVA</small><b>{nok(quote.subtotalExVatOre)}</b></span>
     <span><small>MVA</small><b>{nok(quote.vatOre)}</b></span>
     <span className="quoteDocGrandTotal"><small>Total inkl. MVA</small><b>{nok(quote.totalIncVatOre)}</b></span>
    </div>
   </section>

   <section className="quoteDocPayment">
    <span className="quoteDocEyebrow">BETALINGSPLAN</span>
    <h2>Delbetaling etter fremdrift</h2>
    <div className="quoteDocPaymentGrid">
     {quote.paymentPlan.map((row,index)=><div key={row.id||index}>
      <span>{row.percent}%</span>
      <h3>{row.label}</h3>
      <p>{row.trigger}</p>
      <b>{nok(quote.totalIncVatOre*(Number(row.percent)||0)/100)}</b>
     </div>)}
    </div>
   </section>

   {quote.notes&&<section className="quoteDocText"><span className="quoteDocEyebrow">TILLEGGSINFORMASJON</span><p>{quote.notes}</p></section>}
   {quote.terms&&<section className="quoteDocText quoteDocTerms"><span className="quoteDocEyebrow">VILKÅR</span><p>{quote.terms}</p></section>}

   <footer className="quoteDocFooter">
    <div><b>Aadland Service</b><span>Org.nr. 937 781 873 MVA</span></div>
    <div><span>471 54 898</span><span>post@aadland-service.no</span></div>
    <div><span>{quote.quoteNumber}</span><span>Side 1</span></div>
   </footer>
  </article>

  <section className="customerQuoteDecision noPrint">
   {quote.isExpired?<div><h2>Tilbudet er utløpt</h2><p>Kontakt Aadland Service dersom du ønsker et oppdatert tilbud.</p></div>:quote.status==="accepted"?<div className="customerQuoteAccepted"><h2>Tilbudet er godkjent ✓</h2><p>Vi tar kontakt om videre fremdrift.</p></div>:quote.status==="declined"?<div><h2>Tilbudet er avslått</h2><p>Ta gjerne kontakt hvis du ønsker endringer eller et nytt tilbud.</p></div>:quote.status==="cancelled"?<div><h2>Tilbudet er ikke lenger aktivt</h2></div>:<>
    <div><span className="quoteDocEyebrow">SVAR PÅ TILBUDET</span><h2>Ønsker du å gå videre?</h2><p>Ved godkjenning registreres tilbudet som akseptert hos Aadland Service.</p></div>
    {canRespond&&<div className="customerQuoteDecisionActions">
     <button className="btn customerQuoteAccept" disabled={saving} onClick={()=>respond("accept")}>{saving?"Lagrer …":"Godkjenn tilbud"}</button>
     <button className="btn alt" disabled={saving} onClick={()=>respond("decline")}>Avslå</button>
    </div>}
   </>}
  </section>
 </main>;
}
