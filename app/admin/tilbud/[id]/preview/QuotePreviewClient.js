"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100);
const statusLabels={draft:"Kladd",sent:"Sendt",accepted:"Godkjent",declined:"Avslått",expired:"Utløpt",cancelled:"Avbrutt",superseded:"Erstattet"};
function paymentAmounts(quote){
 const plan=Array.isArray(quote.paymentPlan)?quote.paymentPlan:[];
 let allocated=0;
 return plan.map((row,index)=>{
  const amount=index===plan.length-1?Number(quote.totalIncVatOre||0)-allocated:Math.round(Number(quote.totalIncVatOre||0)*(Number(row.percent)||0)/100);
  allocated+=amount;
  return amount;
 });
}
const typeLabels={work:"Arbeid",material:"Materiale",other:"Annet"};

export default function QuotePreviewClient({quoteId}){
 const [quote,setQuote]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{
  let cancelled=false;
  fetch("/api/admin/quotes?id="+encodeURIComponent(quoteId))
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Tilbudet kunne ikke lastes.");
    return data.quote;
   })
   .then(data=>{if(!cancelled)setQuote(data)})
   .catch(err=>{if(!cancelled)setError(err.message||"Tilbudet kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[quoteId]);

 if(loading)return <main className="quotePreviewShell"><div className="card">Laster tilbud …</div></main>;
 if(!quote)return <main className="quotePreviewShell"><div className="card"><h1>Tilbudet ble ikke funnet</h1><p>{error}</p><Link className="btn" href="/admin/tilbud">Tilbake</Link></div></main>;

 const created=quote.createdAt?new Date(quote.createdAt).toLocaleDateString("nb-NO"):"";
 const valid=quote.validUntil?new Date(quote.validUntil+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const start=quote.plannedStartDate?new Date(quote.plannedStartDate+"T12:00:00").toLocaleDateString("nb-NO"):"";

 return <main className="quotePreviewShell">
  <div className="quotePreviewToolbar noPrint">
   <Link className="btn alt" href={"/admin/tilbud/"+quote.id}>← Rediger</Link>
   <span>{quote.quoteNumber} · {statusLabels[quote.status]||quote.status}</span>
   <a className="btn alt" href={"/api/admin/quotes/pdf?id="+encodeURIComponent(quote.id)}>Last ned PDF-kopi</a>
   <button className="btn" type="button" onClick={()=>window.print()}>Skriv ut / lagre som PDF</button>
  </div>

  <article className="quoteDocument">
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
    <div>
     <span className="quoteDocEyebrow">TILBUD{quote.revisionNumber>1?" · REVISJON "+quote.revisionNumber:""}</span>
     <h1>{quote.title}</h1>
    </div>
    <div className="quoteDocMeta">
     <span><small>Tilbudsnummer</small><b>{quote.quoteNumber}</b></span>
     <span><small>Dato</small><b>{created}</b></span>
     <span><small>Gyldig til</small><b>{valid||"—"}</b></span>
     <span><small>Tidligst oppstart</small><b>{start||"Avtales"}</b></span>
    </div>
   </section>

   <p className="quoteStartNotice">Tidligste oppstart er veiledende. Endelig oppstart avtales etter godkjenning.</p>

   <section className="quoteDocCustomer">
    <div>
     <span className="quoteDocEyebrow">TIL</span>
     <h2>{quote.customer?.name}</h2>
     {quote.customer?.customerType==="business"&&/^[0-9]{9}$/.test(String(quote.customer?.organizationNumber||""))&&
      <p>Org.nr. {quote.customer.organizationNumber}</p>}
     {quote.customer?.customerType==="business"&&quote.customer?.contactPerson&&
      <p>Kontaktperson: {quote.customer.contactPerson}</p>}
     {quote.customer?.address&&<p>{quote.customer.address}</p>}
    </div>
    <div>
     {quote.customer?.phone&&<span>{quote.customer.phone}</span>}
     {quote.customer?.email&&<span>{quote.customer.email}</span>}
    </div>
   </section>

   {quote.introText&&<p className="quoteDocIntro">{quote.introText}</p>}

   <section className="quoteDocLines">
    <div className="quoteDocLine quoteDocLineHead">
     <span>Beskrivelse</span><span>Antall</span><span>Pris eks.</span><span>MVA</span><span>Sum eks.</span>
    </div>
    {(() => {
     const items=Array.isArray(quote.lineItems)?quote.lineItems:[];
     const main=items.filter(line=>line.type==="material"&&!/^forbruksmateriell\\s*:/i.test(String(line.description||"")));
     const consumables=items.filter(line=>line.type==="material"&&/^forbruksmateriell\\s*:/i.test(String(line.description||"")));
     const sum=rows=>rows.reduce((total,line)=>total+Math.round((Number(line.quantity)||0)*(Number(line.unitPriceOre)||0)),0);
     const grouped=[...items.filter(line=>line.type!=="material")];
     if(main.length)grouped.push({id:"grouped-materials",type:"material",description:"Materialer",quantity:1,unit:"samlet",unitPriceOre:sum(main),vatRate:25});
     if(consumables.length)grouped.push({id:"grouped-consumables",type:"material",description:"Diverse forbruksmateriell",quantity:1,unit:"samlet",unitPriceOre:sum(consumables),vatRate:25});
     return grouped.map((line,index)=>{
     const net=Math.round((Number(line.quantity)||0)*(Number(line.unitPriceOre)||0));
     return <div className="quoteDocLine" key={line.id||index}>
      <span><small>{typeLabels[line.type]||"Linje"}</small><b>{line.description}</b></span>
      <span>{line.quantity} {line.unit}</span>
      <span>{nok(line.unitPriceOre)}</span>
      <span>{line.vatRate}%</span>
      <span><b>{nok(net)}</b></span>
     </div>;
    });})()}
   </section>

   <section className="quoteDocTotals">
    <div></div>
    <div>
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
      <b>{nok(paymentAmounts(quote)[index])}</b>
     </div>)}
    </div>
   </section>

   {quote.notes&&<section className="quoteDocText"><span className="quoteDocEyebrow">TILLEGGSINFORMASJON</span><p>{quote.notes}</p></section>}
   {quote.terms&&<section className="quoteDocText quoteDocTerms"><span className="quoteDocEyebrow">VILKÅR</span><p>{quote.terms}</p></section>}

   <section className="quotePaperAcceptance">
    <span className="quoteDocEyebrow">AKSEPT VED PAPIRUTGAVE</span>
    <h2>Godkjenning av tilbud</h2>
    <p>Fylles ut dersom tilbudet godkjennes på papir.</p>
    <div className="quotePaperAcceptanceFields">
     <span><small>Sted og dato</small><i></i></span>
     <span><small>Kundens navn</small><i></i></span>
     <span className="quotePaperSignature"><small>Signatur</small><i></i></span>
    </div>
   </section>

   <footer className="quoteDocFooter">
    <div><b>Aadland Service</b><span>Org.nr. 937 781 873 MVA</span></div>
    <div><span>471 54 898</span><span>post@aadland-service.no</span></div>
    <div><span>{quote.quoteNumber}</span><span>Tilbud</span></div>
   </footer>
  </article>
 </main>;
}
