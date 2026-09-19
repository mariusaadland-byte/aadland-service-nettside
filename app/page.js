"use client";

import { useEffect, useState } from "react";

const emptyCustomer={name:"",email:"",phone:"",address:"",postalCode:"",city:"",note:"",deliveryWithinRadius:true};

const fallbackServices=[
 {id:null,title:"Oppussing og renovering",description:"Fra mindre oppgraderinger til større fornyelser i hjemmet.",slug:"renovation",kind:"service",active:true,showInMenu:true,showInFooter:true,showOnHome:true,hasPage:false,imageUrl:"",ctaLabel:"Les mer",ctaHref:"",formTitle:"Be om befaring",formPrompt:"Beskriv kort hva du ønsker hjelp med.",publishFrom:null,publishUntil:null,sortOrder:10},
 {id:null,title:"Uteområder og hage",description:"Terrasser, levegger, vedlikehold og praktiske løsninger ute.",slug:"outdoor",kind:"service",active:true,showInMenu:true,showInFooter:true,showOnHome:true,hasPage:false,imageUrl:"",ctaLabel:"Les mer",ctaHref:"",formTitle:"Be om befaring",formPrompt:"Beskriv kort hva du ønsker hjelp med.",publishFrom:null,publishUntil:null,sortOrder:20},
 {id:null,title:"Produkter på bestilling",description:"Benker, plantekasser og andre produkter tilpasset dine ønsker.",slug:"products",kind:"products",active:true,showInMenu:true,showInFooter:true,showOnHome:true,hasPage:false,imageUrl:"",ctaLabel:"Les mer",ctaHref:"",formTitle:"Be om befaring",formPrompt:"Beskriv kort hva du ønsker hjelp med.",publishFrom:null,publishUntil:null,sortOrder:30},
 {id:null,title:"Utleie av utstyr",description:"Lei utstyr til prosjektet når du trenger det.",slug:"rental",kind:"rental",active:true,showInMenu:true,showInFooter:true,showOnHome:true,hasPage:false,imageUrl:"",ctaLabel:"Les mer",ctaHref:"",formTitle:"Be om befaring",formPrompt:"Beskriv kort hva du ønsker hjelp med.",publishFrom:null,publishUntil:null,sortOrder:40},
 {id:null,title:"Vedlikehold og småjobber",description:"Reparasjoner, montering og oppgaver som må bli gjort.",slug:"maintenance",kind:"service",active:true,showInMenu:true,showInFooter:true,showOnHome:true,hasPage:false,imageUrl:"",ctaLabel:"Les mer",ctaHref:"",formTitle:"Be om befaring",formPrompt:"Beskriv kort hva du ønsker hjelp med.",publishFrom:null,publishUntil:null,sortOrder:50},
 {id:null,title:"Rådgivning og befaring",description:"Fortell oss om prosjektet, så finner vi en god vei videre.",slug:"survey",kind:"survey",active:true,showInMenu:true,showInFooter:true,showOnHome:false,hasPage:false,imageUrl:"",ctaLabel:"Les mer",ctaHref:"",formTitle:"Be om befaring",formPrompt:"Beskriv kort hva du ønsker hjelp med.",publishFrom:null,publishUntil:null,sortOrder:60},
];

function normalizeService(service,index=0){
 return {
  id:service.id??null,
  title:service.title||service.name||"Tjeneste",
  description:service.description||"",
  slug:service.slug||("tjeneste-"+index),
  kind:service.kind||"service",
  active:service.active!==false,
  showInMenu:service.showInMenu!==false,
  showInFooter:service.showInFooter!==false,
  showOnHome:service.showOnHome!==false,
  hasPage:service.hasPage===true,
  imageUrl:service.imageUrl||service.image_url||"",
  ctaLabel:service.ctaLabel||service.cta_label||"Les mer",
  ctaHref:service.ctaHref||service.cta_href||"",
  formTitle:service.formTitle||service.form_title||"Be om befaring",
  formPrompt:service.formPrompt||service.form_prompt||"Beskriv kort hva du ønsker hjelp med.",
  publishFrom:service.publishFrom||service.publish_from||null,
  publishUntil:service.publishUntil||service.publish_until||null,
  sortOrder:Number(service.sortOrder??service.sort_order??index)
 };
}

function enquiryServiceName(service){
 return service?.title||"Generell befaring";
}

function serviceHref(service){
 if(service.ctaHref) return service.ctaHref;
 if(service.kind==="products") return "/produkter";
 if(service.kind==="rental") return "/utleie";
 if(service.kind==="survey") return "#befaring";
 if(service.hasPage) return "/tjenester/"+service.slug;
 return "#tjeneste-"+service.slug;
}

export default function Home(){
 const [customer,setCustomer]=useState(emptyCustomer);
 const [custom,setCustom]=useState("");
 const [message,setMessage]=useState(null);
 const [error,setError]=useState("");
 const [sending,setSending]=useState(false);
 const [contactImages,setContactImages]=useState([]);
 const [imageError,setImageError]=useState("");
 const [menuOpen,setMenuOpen]=useState(false);
 const [selectedService,setSelectedService]=useState("");
 const [apiServices,setApiServices]=useState(null);
 useEffect(()=>{
  const storedService=sessionStorage.getItem("aadland-service");
  if(storedService){
   setSelectedService(storedService);
   sessionStorage.removeItem("aadland-service");
  }
 },[]);

 useEffect(()=>{
  let alive=true;
  fetch("/api/services").then(r=>r.ok?r.json():null).then(data=>{
   if(alive&&Array.isArray(data?.services)&&data.services.length)setApiServices(data.services);
  }).catch(()=>{});
  return()=>{alive=false};
 },[]);

 const now=Date.now();
 const serviceSource=apiServices||fallbackServices;
 const services=serviceSource.map(normalizeService)
  .filter(service=>service.active!==false)
  .filter(service=>!service.publishFrom||new Date(service.publishFrom).getTime()<=now)
  .filter(service=>!service.publishUntil||new Date(service.publishUntil).getTime()>=now)
  .sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999));
 const homeServices=services.filter(service=>service.showOnHome!==false);
 const menuServices=services.filter(service=>service.showInMenu!==false);
 const footerServices=services.filter(service=>service.showInFooter!==false);

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
   const servicePrefix=selectedService?"Tjeneste: "+selectedService+"\n\n":"";
   const requestBase=servicePrefix+custom;
   const requestText=imageUrls.length?requestBase+"\n\nBilder:\n"+imageUrls.join("\n"):requestBase;
   const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderType:"custom",customRequest:requestText,customer,fulfillmentType:"pickup",deliveryWithinRadius:customer.deliveryWithinRadius})});
   const data=await response.json();
   if(!response.ok){setError(data.error||"Noe gikk galt.");return;}
   setMessage(data);setCustom("");setCustomer(emptyCustomer);setContactImages([]);setImageError("");setSelectedService("");
  }catch{setError("Noe gikk galt. Prøv igjen.");}finally{setSending(false);}
 }

 return <main className="newHome">
  <header className="homeTop homeHeader">
   <div className="homeWrap homeNav homeHeaderInner">
    <a className="homeBrand homeLogo" href="/"><img className="brandLogo" src="/aadland-service-logo.png" alt="Aadland Service"/></a>
    <button className="mobileMenuBtn" type="button" aria-label={menuOpen?"Lukk meny":"Åpne meny"} aria-expanded={menuOpen} aria-controls="hovedmeny" onClick={()=>setMenuOpen(!menuOpen)}><span></span><span></span><span></span></button><nav id="hovedmeny" className={"homeLinks "+(menuOpen?"menuOpen":"")} onClick={()=>setMenuOpen(false)}><a href="/">Hjem</a><a href="#tjenester">Tjenester</a><a href="/produkter">Produkter</a><a href="/utleie">Utleie</a><a href="#prosjekter">Tidligere oppdrag</a><a href="#om">Om oss</a><a href="#kontakt">Kontakt</a>{menuServices.filter(service=>service.hasPage && !["produkter","utleie"].includes(service.slug)).map(service=>(
 <a key={service.id||service.slug} href={serviceHref(service)} onClick={()=>setMenuOpen(false)}>{service.title}</a>
))}</nav>
    <a className="goldBtn navCta headerCta" href="#befaring" onClick={()=>setSelectedService(enquiryServiceName())}>Be om befaring →</a>
   </div>
  </header>

  <section className="homeHero heroSection">
   <div className="heroPhoto" aria-hidden="true"></div>
   <div className="heroShade"></div>
   <div className="homeWrap heroContent">
    <div className="eyebrow heroEyebrow">BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD</div>
    <h1>Kvalitet<br/><em>som varer.</em></h1>
    <p className="heroLead">Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.</p>
    <div className="heroActions"><a className="goldBtn" href="#befaring" onClick={()=>setSelectedService(enquiryServiceName())}>Be om befaring →</a><a className="outlineBtn" href="#tjenester">Se våre tjenester</a></div>
    <div className="heroTrust"><span>Lokalt håndverk – solide resultater</span></div>
   </div>
  </section>

  <section className="serviceStrip"><div className="homeWrap stripGrid serviceStripInner">
   {services.slice(0,6).map(service=><a href={serviceHref(service)} key={service.slug} className="serviceStripItem" onClick={()=>{if(service.kind==="survey")setSelectedService(enquiryServiceName(service))}}><span className={"serviceIcon "+service.slug} aria-hidden="true"></span><span>{service.title}</span></a>)}
  </div></section>

  <section id="tjenester" className="homeSection light servicesSection">
   <div className="homeWrap">
    <div className="sectionIntro servicesHeader"><div><span className="goldLabel">VÅRE TJENESTER</span><h2>Små og store prosjekter</h2></div><a className="textLink" href="#befaring">Se alle tjenester →</a></div>
    <div className="serviceCards">
     {homeServices.slice(0,5).map((service,index)=><article id={"tjeneste-"+service.slug} data-service={service.slug} className={"serviceCard serviceCard"+index} key={service.slug}>
      <div className={"serviceVisual serviceSlot"+index}><div className="visualScene"></div></div>
      <div className="serviceText serviceContent"><h3>{service.title}</h3><p>{service.description}</p><a href={service.kind==="products"?"/produkter":service.ctaHref||"#befaring"} onClick={()=>{if(service.kind!=="products")setSelectedService(enquiryServiceName(service))}}>{service.ctaLabel||"Les mer"} <b>→</b></a></div>
     </article>)}
    </div>
   </div>
  </section>

  <section id="om" className="craftSection">
   <div className="homeWrap craftGrid">
    <div className="craftCopy"><span className="goldLabel">AADLAND SERVICE</span><h2>Lokalt håndverk<br/>med stolthet.</h2><p>Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.</p><a className="goldBtn craftCta" href="#befaring" onClick={()=>setSelectedService(enquiryServiceName())}>Be om befaring →</a></div>
    <div className="craftVisual" aria-label="Håndverk og trearbeid"></div>
    <div className="craftChecklist"><ul className="craftChecks"><li>Kvalitet i alle ledd</li><li>Pålitelig og punktlig</li><li>Fleksible løsninger</li><li>Ryddig kommunikasjon</li><li>Lokalt i Bergen og omegn</li></ul></div>
   </div>
  </section>

  

  <section id="prosjekter" className="homeSection projects projectsSection"><div className="homeWrap">
   <div className="sectionIntro projectsHeader"><div><span className="goldLabel">UTVALGTE PROSJEKTER</span><h2>Resultater vi er stolte av</h2></div></div>
   <div className="projectGrid">
    <div className="projectTile projectCard projectDeck"><div className="projectCaption"><span>UTEOMRÅDE</span><strong>Terrasse og levegg</strong></div></div>
    <div className="projectTile projectCard projectBathroom"><div className="projectCaption"><span>OPPUSSING</span><strong>Oppusset bad</strong></div></div>
    <div className="projectTile projectCard projectSlats"><div className="projectCaption"><span>INNVENDIG</span><strong>Spilevegg og trapp</strong></div></div>
    <div className="projectTile projectCard projectPlanters"><div className="projectCaption"><span>PÅ BESTILLING</span><strong>Plantekasser</strong></div></div>
   </div>
  </div></section>

  <section id="befaring" className="contactSection"><div className="contactPhoto" aria-hidden="true"></div><div className="contactShade" aria-hidden="true"></div><div className="homeWrap contactGrid">
   <div className="contactCopy"><span className="goldLabel">KONTAKT OSS</span><h2>Har du et prosjekt<br/>i tankene?</h2><p>Beskriv hva du ønsker hjelp med. Vi tar kontakt for å avklare prosjektet og om det er behov for befaring.</p><div className="contactBenefits"><span><b aria-hidden="true">✓</b>Enkel befaring</span><span><b aria-hidden="true">✓</b>Rask tilbakemelding</span><span><b aria-hidden="true">✓</b>Bergen og omegn</span></div><div className="contactDetails"><a href="tel:+4747154898">471 54 898</a><a href="mailto:post@aadland-service.no">post@aadland-service.no</a></div></div>
   <form className="homeForm" onSubmit={customOrder} aria-busy={sending}>
    {selectedService&&<div className="selectedService">Gjelder: <b>{selectedService}</b></div>}
    {message&&<div className="success"><b>Forespørselen er mottatt</b>{message.orderNumber&&<p>Ordrenummer: {message.orderNumber}</p>}</div>}
    <div className="formTwo"><Field label="Navn *"><input autoComplete="name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></Field><Field label="Telefon *"><input type="tel" autoComplete="tel" required value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></Field></div>
    <Field label="E-post *"><input type="email" autoComplete="email" required value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></Field>
    <Field label="Adresse"><input autoComplete="street-address" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})} placeholder="Adresse for prosjektet"/></Field>
    <div className="formTwo"><Field label="Postnummer"><input inputMode="numeric" autoComplete="postal-code" value={customer.postalCode} onChange={e=>setCustomer({...customer,postalCode:e.target.value})}/></Field><Field label="Sted"><input autoComplete="address-level2" value={customer.city} onChange={e=>setCustomer({...customer,city:e.target.value})}/></Field></div>
    <Field label="Hva gjelder det? *"><textarea rows="5" required value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Beskriv kort hva du ønsker hjelp med …"/></Field>
    <label className="contactUpload"><span>Last opp bilder <small>(valgfritt)</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{const picked=Array.from(e.target.files||[]);const valid=picked.filter(file=>["image/jpeg","image/png","image/webp"].includes(file.type)&&file.size<=10*1024*1024).slice(0,8);setContactImages(valid);setImageError(valid.length!==picked.length?"Noen bilder ble ikke lagt til. Bruk JPG, PNG eller WebP, maks 10 MB per bilde og maks 8 bilder.":"");}}/><strong>Velg bilder</strong><em>{contactImages.length?`${contactImages.length} bilde${contactImages.length===1?"":"r"} valgt`:"Dra og slipp eller velg filer · JPG, PNG eller WebP · maks 8 bilder"}</em></label>
    {imageError&&<p className="contactImageError">{imageError}</p>}
    {contactImages.length>0&&<div className="contactImageSelected"><b>{contactImages.length} bilde{contactImages.length===1?"":"r"} klare</b><button type="button" onClick={()=>setContactImages([])}>Fjern bilder</button></div>}
    {error&&<p className="notice">{error}</p>}<button className="goldBtn submitBtn" disabled={sending} aria-disabled={sending}>{sending?"Sender forespørsel …":"Send forespørsel →"}</button><small>Vi bruker opplysningene kun for å svare på forespørselen din.</small>
   </form>
  </div></section>

  <footer id="kontakt" className="homeFooter"><div className="homeWrap footerGrid"><div className="footerIdentity"><div className="homeBrand"><img className="brandLogo footerLogo" src="/aadland-service-logo.png" alt="Aadland Service"/></div><p className="footerTagline">Lokalt håndverk – solide resultater</p></div><div><b>Kontakt</b><div className="footerServices"><a href="tel:+4747154898">471 54 898</a><a href="mailto:post@aadland-service.no">post@aadland-service.no</a></div></div><div><b>Tjenester</b><div className="footerServices">
 {footerServices.map(service=><a key={service.slug} href={serviceHref(service)}>{service.title}</a>)}
 </div></div><div><b>Firma</b><div className="footerServices"><a href="#om">Om oss</a><a href="#prosjekter">Tidligere oppdrag</a><a href="#befaring">Be om befaring</a></div><p>Org.nr. 937 781 873 MVA<br/>Bergen og omegn</p></div></div><div className="homeWrap footerBottom"><span>© Aadland Service</span><div><a href="/produkter">Produkter</a><a href="#tjenester">Tjenester</a><a href="#kontakt">Kontakt</a></div></div></footer>
 </main>;
}
function Field({label,children}){return <label className="homeField"><span>{label}</span>{children}</label>}
