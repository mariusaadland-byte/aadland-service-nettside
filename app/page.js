"use client";

import { useEffect, useState } from "react";

const emptyCustomer={name:"",email:"",phone:"",address:"",postalCode:"",city:"",note:"",deliveryWithinRadius:true};

const fallbackServices=[
 ["Oppussing og renovering","Fra mindre oppgraderinger til større fornyelser i hjemmet.","renovation"],
 ["Uteområder og hage","Terrasser, levegger, vedlikehold og praktiske løsninger ute.","outdoor"],
 ["Produkter på bestilling","Benker, plantekasser og andre produkter tilpasset dine ønsker.","products"],
 ["Utleie av utstyr","Lei utstyr til prosjektet når du trenger det.","rental"],
 ["Vedlikehold og småjobber","Reparasjoner, montering og oppgaver som må bli gjort.","maintenance"],
 ["Rådgivning og befaring","Fortell oss om prosjektet, så finner vi en god vei videre.","survey"],
];

export default function Home(){
 const [customer,setCustomer]=useState(emptyCustomer);
 const [custom,setCustom]=useState("");
 const [message,setMessage]=useState(null);
 const [error,setError]=useState("");
 const [sending,setSending]=useState(false);
 const [contactImages,setContactImages]=useState([]);
 const [publicGroups,setPublicGroups]=useState([]);
 const services=fallbackServices;

 useEffect(()=>{
  fetch("/api/categories").then(r=>r.ok?r.json():null).then(data=>setPublicGroups(data?.categories||[])).catch(()=>{});
 },[]);

 async function customOrder(e){
  e.preventDefault(); setError(""); setMessage(null); setSending(true);
  try{
   let imageUrls=[];
   if(contactImages.length){
    const formData=new FormData();
    contactImages.forEach(file=>formData.append("images",file));
    const upload=await fetch("/api/contact-images",{method:"POST",body:formData});
    const uploaded=await upload.json();
    if(!upload.ok) throw new Error(uploaded.error||"Kunne ikke laste opp bilder.");
    imageUrls=uploaded.urls||[];
   }
   const requestText=imageUrls.length?custom+"\n\nBilder:\n"+imageUrls.join("\n"):custom;
   const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderType:"custom",customRequest:requestText,customer,fulfillmentType:"pickup",deliveryWithinRadius:customer.deliveryWithinRadius})});
   const data=await response.json();
   if(!response.ok){setError(data.error||"Noe gikk galt.");return;}
   setMessage(data);setCustom("");setCustomer(emptyCustomer);setContactImages([]);
  }catch{setError("Noe gikk galt. Prøv igjen.");}finally{setSending(false);}
 }

 return <main className="newHome">
  <header className="homeTop">
   <div className="homeWrap homeNav">
    <a className="homeBrand" href="/"><img className="brandLogo" src="/aadland-service-logo.png" alt="Aadland Service"/></a>
    <nav className="homeLinks"><a href="/">Hjem</a><a href="#tjenester">Tjenester</a><a href="/produkter">Produkter</a><a href="#tjenester">Utleie</a><a href="#prosjekter">Tidligere oppdrag</a><a href="#om">Om oss</a><a href="#kontakt">Kontakt</a></nav>
    <a className="goldBtn navCta" href="#befaring">Be om befaring →</a>
   </div>
  </header>

  <section className="homeHero">
   <div className="heroPhoto" aria-hidden="true"></div>
   <div className="heroShade"></div>
   <div className="homeWrap heroContent">
    <div className="eyebrow">BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD</div>
    <h1>Kvalitet<br/><em>som varer.</em></h1>
    <p>Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.</p>
    <div className="heroActions"><a className="goldBtn" href="#befaring">Be om befaring →</a><a className="outlineBtn" href="#tjenester">Se våre tjenester</a></div>
    <div className="heroTrust"><span>Lokalt håndverk – solide resultater</span></div>
   </div>
  </section>

  <section className="serviceStrip"><div className="homeWrap stripGrid">
   {services.slice(0,6).map(([title,,type])=><a href={type==="products"?"/produkter":"#befaring"} key={type}><span className={"serviceIcon "+type} aria-hidden="true"></span><span>{title}</span></a>)}
  </div></section>

  <section id="tjenester" className="homeSection light">
   <div className="homeWrap">
    <div className="sectionIntro"><div><span className="goldLabel">VÅRE TJENESTER</span><h2>Små og store prosjekter</h2></div><a className="textLink" href="#befaring">Se alle tjenester →</a></div>
    <div className="serviceCards">
     {services.slice(0,5).map(([title,text,type],index)=><article className="serviceCard" key={type}>
      <div className={"serviceVisual serviceSlot"+index}><div className="visualScene"></div></div>
      <div className="serviceText"><h3>{title}</h3><p>{text}</p><a href={type==="products"?"/produkter":"#befaring"}>Les mer <b>→</b></a></div>
     </article>)}
    </div>
   </div>
  </section>

  <section id="om" className="craftSection">
   <div className="homeWrap craftGrid">
    <div className="craftCopy"><span className="goldLabel">AADLAND SERVICE</span><h2>Lokalt håndverk<br/>med stolthet.</h2><p>Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.</p><a className="goldBtn craftCta" href="#befaring">Be om befaring →</a></div>
    <div className="craftVisual" aria-label="Håndverk og trearbeid"></div>
    <div className="craftChecklist"><ul className="craftChecks"><li>Kvalitet i alle ledd</li><li>Pålitelig og punktlig</li><li>Fleksible løsninger</li><li>Ryddig kommunikasjon</li><li>Lokalt i Bergen og omegn</li></ul></div>
   </div>
  </section>

  

  <section id="prosjekter" className="homeSection projects"><div className="homeWrap">
   <div className="sectionIntro"><div><span className="goldLabel">UTVALGTE PROSJEKTER</span><h2>Resultater vi er stolte av</h2></div></div>
   <div className="projectGrid">
    <div className="projectTile projectDeck"><span>UTEOMRÅDE</span><strong>Terrasse og levegg</strong></div>
    <div className="projectTile projectBathroom"><span>OPPUSSING</span><strong>Oppusset bad</strong></div>
    <div className="projectTile projectSlats"><span>INNVENDIG</span><strong>Spilevegg og trapp</strong></div>
    <div className="projectTile projectPlanters"><span>PÅ BESTILLING</span><strong>Plantekasser</strong></div>
   </div>
  </div></section>

  <section id="befaring" className="contactSection"><div className="contactPhoto" aria-hidden="true"></div><div className="contactShade" aria-hidden="true"></div><div className="homeWrap contactGrid">
   <div className="contactCopy"><span className="goldLabel">KONTAKT OSS</span><h2>Har du et prosjekt<br/>i tankene?</h2><p>Beskriv hva du ønsker hjelp med. Vi tar kontakt for å avklare prosjektet og om det er behov for befaring.</p><div className="contactBenefits"><span>Enkel befaring</span><span>Rask tilbakemelding</span><span>Bergen og omegn</span></div><div className="contactDetails"><a href="tel:+4747154898">471 54 898</a><a href="mailto:post@aadland-service.no">post@aadland-service.no</a></div></div>
   <form className="homeForm" onSubmit={customOrder}>
    {message&&<div className="success"><b>Forespørselen er mottatt</b>{message.orderNumber&&<p>Ordrenummer: {message.orderNumber}</p>}</div>}
    <div className="formTwo"><Field label="Navn *"><input required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></Field><Field label="Telefon *"><input required value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></Field></div>
    <Field label="E-post *"><input type="email" required value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></Field>
    <Field label="Adresse"><input value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})} placeholder="Adresse for prosjektet"/></Field>
    <div className="formTwo"><Field label="Postnummer"><input inputMode="numeric" value={customer.postalCode} onChange={e=>setCustomer({...customer,postalCode:e.target.value})}/></Field><Field label="Sted"><input value={customer.city} onChange={e=>setCustomer({...customer,city:e.target.value})}/></Field></div>
    <Field label="Hva kan vi hjelpe deg med? *"><textarea rows="5" required value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Fortell kort om prosjektet, hvor det er og hva du ønsker gjort …"/></Field>
    <label className="contactUpload"><span>Last opp bilder <small>(valgfritt)</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setContactImages(Array.from(e.target.files||[]).slice(0,8))}/><strong>Velg bilder</strong><em>{contactImages.length?`${contactImages.length} bilde${contactImages.length===1?"":"r"} valgt`:"Du kan velge opptil 8 bilder"}</em></label>
    {contactImages.length>0&&<div className="contactImageSelected"><b>{contactImages.length} bilde{contactImages.length===1?"":"r"} klare</b><button type="button" onClick={()=>setContactImages([])}>Fjern bilder</button></div>}
    {error&&<p className="notice">{error}</p>}<button className="goldBtn submitBtn" disabled={sending}>{sending?"Sender...":"Send forespørsel →"}</button><small>Vi bruker opplysningene kun for å svare på forespørselen din.</small>
   </form>
  </div></section>

  <footer id="kontakt" className="homeFooter"><div className="homeWrap footerGrid"><div className="footerIdentity"><div className="homeBrand"><img className="brandLogo footerLogo" src="/aadland-service-logo.png" alt="Aadland Service"/></div><p className="footerTagline">Lokalt håndverk – solide resultater</p></div><div><b>Kontakt</b><p>471 54 898<br/>post@aadland-service.no</p></div><div><b>Tjenester</b><div className="footerServices">
 {services.map(([title,,type])=><a key={type} href={type==="products"?"/produkter":"#befaring"}>{title}</a>)}
 </div></div><div><b>Firma</b><p>Org.nr. 937 781 873 MVA<br/>Bergen og omegn</p></div></div></footer>
 </main>;
}
function Field({label,children}){return <label className="homeField"><span>{label}</span>{children}</label>}
