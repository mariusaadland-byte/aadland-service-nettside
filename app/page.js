"use client";

import { useState } from "react";

const emptyCustomer={name:"",email:"",phone:"",address:"",postalCode:"",city:"",note:"",deliveryWithinRadius:true};

const services=[
 ["Oppussing og renovering","Fra mindre oppgraderinger til større fornyelser i hjemmet.","01","renovation"],
 ["Uteområder og hage","Terrasser, levegger, vedlikehold og praktiske løsninger ute.","02","outdoor"],
 ["Produkter på bestilling","Benker, plantekasser og andre produkter tilpasset dine ønsker.","03","products"],
 ["Utleie av utstyr","Lei utstyr til prosjektet når du trenger det.","04","rental"],
 ["Vedlikehold og småjobber","Reparasjoner, montering og oppgaver som må bli gjort.","05","maintenance"],
 ["Rådgivning og befaring","Fortell oss om prosjektet, så finner vi en god vei videre.","06","survey"],
];

export default function Home(){
 const [customer,setCustomer]=useState(emptyCustomer);
 const [custom,setCustom]=useState("");
 const [message,setMessage]=useState(null);
 const [error,setError]=useState("");
 const [sending,setSending]=useState(false);

 async function customOrder(e){
  e.preventDefault(); setError(""); setMessage(null); setSending(true);
  try{
   const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderType:"custom",customRequest:custom,customer,fulfillmentType:"pickup",deliveryWithinRadius:customer.deliveryWithinRadius})});
   const data=await response.json();
   if(!response.ok){setError(data.error||"Noe gikk galt.");return;}
   setMessage(data);setCustom("");setCustomer(emptyCustomer);
  }catch{setError("Noe gikk galt. Prøv igjen.");}finally{setSending(false);}
 }

 return <main className="newHome">
  <header className="homeTop">
   <div className="homeWrap homeNav">
    <a className="homeBrand" href="/"><img className="brandLogo" src="/aadland-service-logo.png" alt="Aadland Service"/></a>
    <nav className="homeLinks"><a href="#tjenester">Tjenester</a><a href="/produkter">Produkter</a><a href="#prosjekter">Tidligere oppdrag</a><a href="#om">Om oss</a><a href="#kontakt">Kontakt</a></nav>
    <a className="goldBtn navCta" href="#befaring">Be om befaring</a>
   </div>
  </header>

  <section className="homeHero">
   <div className="heroPhoto" aria-hidden="true"><div className="heroBeam"></div><div className="heroMeasure"></div><div className="heroHand"></div></div>
   <div className="heroShade"></div>
   <div className="homeWrap heroContent">
    <div className="eyebrow">Aadland Service · Bergen og omegn</div>
    <h1>Kvalitet<br/><em>som varer.</em></h1>
    <p>Oppussing, vedlikehold, uteområder og produkter på bestilling. Praktiske løsninger med fokus på solid utførelse.</p>
    <div className="heroActions"><a className="goldBtn" href="#befaring">Be om befaring</a><a className="outlineBtn" href="#tjenester">Se våre tjenester</a></div>
    <div className="heroTrust"><span><b>01</b> Lokalt i Bergen</span><span><b>02</b> Tydelig avtale</span><span><b>03</b> Solid utførelse</span></div>
   </div>
  </section>

  <section className="serviceStrip"><div className="homeWrap stripGrid">
   {services.map(([title,,n])=><a href={n==="03"?"/produkter":"#tjenester"} key={n}><b>{n}</b><span>{title}</span></a>)}
  </div></section>

  <section id="tjenester" className="homeSection light">
   <div className="homeWrap">
    <div className="sectionIntro"><div><span className="goldLabel">TJENESTER</span><h2>Hva kan vi hjelpe deg med?</h2></div><p>Små og store oppdrag – med løsninger tilpasset behovet ditt.</p></div>
    <div className="serviceCards">
     {services.slice(0,5).map(([title,text,n,type])=><article className="serviceCard" key={n}>
      <div className={"serviceVisual "+type}><span className="cardNo">{n}</span><div className="visualScene"></div></div>
      <div className="serviceText"><h3>{title}</h3><p>{text}</p><a href={n==="03"?"/produkter":"#befaring"}>Les mer <b>→</b></a></div>
     </article>)}
    </div>
   </div>
  </section>

  <section id="om" className="craftSection">
   <div className="homeWrap craftGrid">
    <div className="craftVisual"><div className="woodPiece"></div><div className="ruler"></div><div className="pencil"></div><span>GODT HÅNDVERK STARTER<br/>MED GODE FORBEREDELSER.</span></div>
    <div className="craftCopy"><span className="goldLabel">AADLAND SERVICE</span><h2>Lokalt håndverk<br/>med stolthet.</h2><p>Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.</p><a className="textLink" href="#befaring">Fortell oss om prosjektet ditt →</a></div>
   </div>
  </section>

  <section id="prosjekter" className="homeSection projects"><div className="homeWrap">
   <div className="sectionIntro"><div><span className="goldLabel">TIDLIGERE OPPDRAG</span><h2>Arbeid vi er stolte av.</h2></div><p>Et utvalg av arbeid. Egne prosjektbilder kan legges inn her etter hvert.</p></div>
   <div className="projectGrid">
    <div className="projectTile projectDeck large"><div className="deckScene"></div><span>UTEOMRÅDE</span><strong>Terrasse og trearbeid</strong></div>
    <div className="projectTile projectBefore"><div className="beforeScene"></div><span>VEDLIKEHOLD</span><strong>Før og etter</strong></div>
    <div className="projectTile projectBench"><div className="benchScene"></div><span>PÅ BESTILLING</span><strong>Tilpassede produkter</strong></div>
   </div>
  </div></section>

  <section className="processSection"><div className="homeWrap">
   <div className="processIntro"><span className="goldLabel">ENKELT Å KOMME I GANG</span><h2>Fra idé til ferdig jobb.</h2></div>
   <div className="processGrid">
    <div className="processStep"><b>01</b><h3>Send forespørsel</h3><p>Fortell kort hva du ønsker hjelp med.</p></div>
    <div className="processStep"><b>02</b><h3>Vi avklarer jobben</h3><p>Vi tar kontakt og avtaler befaring når det er nødvendig.</p></div>
    <div className="processStep"><b>03</b><h3>Du får en tydelig avtale</h3><p>Omfang og pris avklares før arbeidet starter.</p></div>
   </div>
  </div></section>

  <section id="befaring" className="contactSection"><div className="homeWrap contactGrid">
   <div className="contactCopy"><span className="goldLabel">KONTAKT OSS</span><h2>Har du et prosjekt<br/>i tankene?</h2><p>Beskriv hva du ønsker hjelp med. Vi tar kontakt for å avklare prosjektet og om det er behov for befaring.</p><div className="contactDetails"><a href="tel:+4747154898">471 54 898</a><a href="mailto:post@aadland-service.no">post@aadland-service.no</a></div></div>
   <form className="homeForm" onSubmit={customOrder}>
    {message&&<div className="success"><b>Forespørselen er mottatt</b>{message.orderNumber&&<p>Ordrenummer: {message.orderNumber}</p>}</div>}
    <div className="formTwo"><Field label="Navn *"><input required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></Field><Field label="Telefon *"><input required value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></Field></div>
    <Field label="E-post *"><input type="email" required value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></Field>
    <Field label="Hva kan vi hjelpe deg med? *"><textarea rows="5" required value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Fortell kort om prosjektet, hvor det er og hva du ønsker gjort …"/></Field>
    {error&&<p className="notice">{error}</p>}<button className="goldBtn submitBtn" disabled={sending}>{sending?"Sender...":"Send forespørsel →"}</button><small>Vi bruker opplysningene kun for å svare på forespørselen din.</small>
   </form>
  </div></section>

  <footer id="kontakt" className="homeFooter"><div className="homeWrap footerGrid"><div className="homeBrand"><img className="brandLogo footerLogo" src="/aadland-service-logo.png" alt="Aadland Service"/></div><div><b>Kontakt</b><p>471 54 898<br/>post@aadland-service.no</p></div><div><b>Tjenester</b><p>Oppussing · Vedlikehold<br/>Uteområder · Produkter</p></div><div><b>Firma</b><p>Org.nr. 937 781 873 MVA<br/>Bergen og omegn</p></div></div></footer>
 </main>;
}
function Field({label,children}){return <label className="homeField"><span>{label}</span>{children}</label>}
