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
 const [customerAccount,setCustomerAccount]=useState(null);
 const [custom,setCustom]=useState("");
 const [message,setMessage]=useState(null);
 const [error,setError]=useState("");
 const [sending,setSending]=useState(false);
 const [contactImages,setContactImages]=useState([]);
 const [imageError,setImageError]=useState("");
 const [menuOpen,setMenuOpen]=useState(false);
 const [selectedService,setSelectedService]=useState("");
 const [apiServices,setApiServices]=useState(null);
 const [apiProjects,setApiProjects]=useState([]);
 const [siteSettings,setSiteSettings]=useState({heroEyebrow:"BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD",heroTitle:"Kvalitet som varer.",seasonalTitle:"",seasonalText:"",seasonalCtaLabel:"",seasonalCtaHref:"",seasonalFrom:null,seasonalUntil:null,showSeasonal:false,heroText:"Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.",aboutTitle:"Lokalt håndverk med stolthet.",aboutText:"Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.",phone:"471 54 898",email:"post@aadland-service.no",orgNumber:"937 781 873 MVA",location:"Bergen og omegn",showServices:true,showProjects:true,showAbout:true,showSurvey:true});
 useEffect(()=>{
  fetch("/api/customer/profile")
   .then(async response=>{
    if(response.status===401)return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return null;
    return data.customer||null;
   })
   .then(profile=>{
    if(!profile)return;
    setCustomerAccount(profile);
    setCustomer(current=>({
     ...current,
     name:current.name||profile.name||"",
     email:current.email||profile.email||"",
     phone:current.phone||profile.phone||"",
     address:current.address||profile.address||""
    }));
   })
   .catch(()=>{});
 },[]);

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

 useEffect(()=>{fetch("/api/site-settings").then(r=>r.ok?r.json():null).then(d=>{if(d?.settings)setSiteSettings(d.settings)}).catch(()=>{})},[]);

 useEffect(()=>{
  let alive=true;
  fetch("/api/projects").then(r=>r.ok?r.json():null).then(data=>{
   if(alive&&Array.isArray(data?.projects))setApiProjects(data.projects.filter(project=>project.active!==false&&project.featured!==false).slice(0,4));
  }).catch(()=>{});
  return()=>{alive=false};
 },[]);

 const now=Date.now();
 const seasonalVisible=siteSettings.showSeasonal===true&&siteSettings.seasonalTitle&&(!siteSettings.seasonalFrom||new Date(siteSettings.seasonalFrom+"T00:00:00").getTime()<=now)&&(!siteSettings.seasonalUntil||new Date(siteSettings.seasonalUntil+"T23:59:59").getTime()>=now);
 const serviceSource=apiServices||fallbackServices;
 const services=serviceSource.map(normalizeService)
  .filter(service=>service.active!==false)
  .filter(service=>!service.publishFrom||new Date(service.publishFrom).getTime()<=now)
  .filter(service=>!service.publishUntil||new Date(service.publishUntil).getTime()>=now)
  .sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999));
 const homeServices=services.filter(service=>service.showOnHome!==false);
 const menuServices=services.filter(service=>service.showInMenu!==false);
 const footerServices=services.filter(service=>service.showInFooter!==false);

 async function cleanupContactImageRefs(refs){
  if(!Array.isArray(refs)||!refs.length)return;
  try{
   await fetch("/api/contact-images",{
    method:"DELETE",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({refs})
   });
  }catch{}
 }

 async function customOrder(e){
  e.preventDefault(); setError(""); setMessage(null); setSending(true);
  let imageUrls=[];
  try{
   if(contactImages.length){
    if(contactImages.length>8)throw new Error("Du kan laste opp maks 8 bilder.");
    try{
     for(const file of contactImages){
      if(file.size>4*1024*1024)throw new Error("Hvert bilde kan være maks 4 MB.");
      const formData=new FormData();
      formData.append("images",file);
      const upload=await fetch("/api/contact-images",{method:"POST",body:formData});
      const uploaded=await upload.json().catch(()=>({}));
      if(!upload.ok)throw new Error(uploaded.error||"Kunne ikke laste opp bildet.");
      imageUrls.push(...(uploaded.urls||[]));
     }
    }catch(uploadError){
     await cleanupContactImageRefs(imageUrls);
     throw uploadError;
    }
   }

   const servicePrefix=selectedService?"Tjeneste: "+selectedService+"\n\n":"";
   const requestBase=servicePrefix+custom;
   const requestText=imageUrls.length?requestBase+"\n\nBilder:\n"+imageUrls.join("\n"):requestBase;

   let response;
   try{
    response=await fetch("/api/orders",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      orderType:"custom",
      customRequest:requestText,
      customer,
      fulfillmentType:"pickup",
      deliveryWithinRadius:customer.deliveryWithinRadius
     })
    });
   }catch{
    setError("Nettverksfeil etter sending. Forespørselen kan ha blitt registrert; sjekk e-post eller Min side før du prøver igjen.");
    return;
   }

   const data=await response.json().catch(()=>({}));
   if(!response.ok){
    await cleanupContactImageRefs(imageUrls);
    setError(data.error||"Noe gikk galt.");
    return;
   }

   setMessage(data);setCustom("");setCustomer(customerAccount?{
    ...emptyCustomer,
    name:customerAccount.name||"",
    email:customerAccount.email||"",
    phone:customerAccount.phone||"",
    address:customerAccount.address||""
   }:emptyCustomer);setContactImages([]);setImageError("");setSelectedService("");
  }catch(e){
   setError(e?.message||"Noe gikk galt. Prøv igjen.");
  }finally{
   setSending(false);
  }
 }

 return <main className="newHome">
  <header className="homeTop homeHeader">
   <div className="homeWrap homeNav homeHeaderInner">
    <a className="homeBrand homeLogo" href="/"><img className="brandLogo" src="/aadland-service-logo.webp" alt="Aadland Service"/></a>
    <button className="mobileMenuBtn" type="button" aria-label={menuOpen?"Lukk meny":"Åpne meny"} aria-expanded={menuOpen} aria-controls="hovedmeny" onClick={()=>setMenuOpen(!menuOpen)}><span></span><span></span><span></span></button><nav id="hovedmeny" className={"homeLinks "+(menuOpen?"menuOpen":"")} onClick={()=>setMenuOpen(false)}><a href="/">Hjem</a><a href="/min-side">Min side</a><a href="#tjenester">Tjenester</a><a href="/produkter">Produkter</a><a href="/utleie">Utleie</a><a href="/prosjekter">Tidligere oppdrag</a><a href="#om">Om oss</a><a href="#kontakt">Kontakt</a>{menuServices.filter(service=>service.hasPage && !["produkter","utleie"].includes(service.slug)).map(service=>(
 <a key={service.id||service.slug} href={serviceHref(service)} onClick={()=>setMenuOpen(false)}>{service.title}</a>
))}</nav>
    <a className="goldBtn navCta headerCta" href="#befaring" onClick={()=>setSelectedService(enquiryServiceName())}>Gratis befaring →</a>
   </div>
  </header>

  <section className="homeHero heroSection">
   <div className="heroPhoto" aria-hidden="true"></div>
   <div className="heroShade"></div>
   <div className="homeWrap heroContent">
    <div className="eyebrow heroEyebrow">{siteSettings.heroEyebrow}</div>
    <h1>{siteSettings.heroTitle}</h1>
    <p className="heroLead">{siteSettings.heroText}</p>
    <div className="heroActions"><a className="goldBtn" href="#befaring" onClick={()=>setSelectedService(enquiryServiceName())}>Gratis befaring →</a><a className="outlineBtn" href="#tjenester">Se våre tjenester</a></div>
    <div className="heroTrust"><span>Lokalt håndverk – solide resultater</span></div>
   </div>
  </section>

  {seasonalVisible&&<section className="seasonalBanner"><div className="homeWrap"><div><span className="goldLabel">AKTUELT</span><h2>{siteSettings.seasonalTitle}</h2>{siteSettings.seasonalText&&<p>{siteSettings.seasonalText}</p>}</div>{siteSettings.seasonalCtaLabel&&siteSettings.seasonalCtaHref&&<a className="goldBtn" href={siteSettings.seasonalCtaHref}>{siteSettings.seasonalCtaLabel} →</a>}</div></section>}

  <section className="serviceStrip"><div className="homeWrap stripGrid serviceStripInner">
   {services.slice(0,6).map(service=><a href={serviceHref(service)} key={service.slug} className="serviceStripItem" onClick={()=>{if(service.kind==="survey")setSelectedService(enquiryServiceName(service))}}><span className={"serviceIcon "+service.slug} aria-hidden="true"></span><span>{service.title}</span></a>)}
  </div></section>

  {siteSettings.showServices!==false&&<section id="tjenester" className="homeSection light servicesSection">
   <div className="homeWrap">
    <div className="sectionIntro servicesHeader"><div><span className="goldLabel">VÅRE TJENESTER</span><h2>Små og store prosjekter</h2></div><a className="textLink" href="#befaring">Se alle tjenester →</a></div>
    <div className="serviceCards">
     {homeServices.slice(0,5).map((service,index)=><article id={"tjeneste-"+service.slug} data-service={service.slug} className={"serviceCard serviceCard"+index} key={service.slug}>
      <div className={"serviceVisual serviceSlot"+index+(service.imageUrl?" hasServiceImage":"")} style={service.imageUrl?{backgroundImage:"linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.08)), url("+service.imageUrl+")"}:undefined}><div className="visualScene"></div></div>
      <div className="serviceText serviceContent"><h3>{service.title}</h3><p>{service.description}</p><a href={serviceHref(service)}>{service.ctaLabel||"Les mer"} <b>→</b></a></div>
     </article>)}
    </div>
   </div>
  </section>}

  {siteSettings.showAbout!==false&&<section id="om" className="craftSection">
   <div className="homeWrap craftGrid">
    <div className="craftCopy"><span className="goldLabel">AADLAND SERVICE</span><h2>{siteSettings.aboutTitle}</h2><p>{siteSettings.aboutText}</p><a className="goldBtn craftCta" href="#befaring" onClick={()=>setSelectedService(enquiryServiceName())}>Gratis befaring →</a></div>
    <div className="craftVisual" aria-label="Håndverk og trearbeid"></div>
    <div className="craftChecklist"><ul className="craftChecks"><li>Kvalitet i alle ledd</li><li>Pålitelig og punktlig</li><li>Fleksible løsninger</li><li>Ryddig kommunikasjon</li><li>Lokalt i Bergen og omegn</li></ul></div>
   </div>
  </section>}

  

  {siteSettings.showProjects!==false&&<section id="prosjekter" className="homeSection projects projectsSection"><div className="homeWrap">
   <div className="sectionIntro projectsHeader"><div><span className="goldLabel">UTVALGTE PROSJEKTER</span><h2>Resultater vi er stolte av</h2></div><a className="textLink" href="/prosjekter">Se alle prosjekter →</a></div>
   <div className="projectGrid">
    {apiProjects.length?apiProjects.filter(project=>project.featured!==false).slice(0,4).map(project=><a href={"/prosjekter/"+project.slug} className={"projectTile projectCard "+(!project.imageUrls?.[0]?"projectCardNoImage":"")} key={project.id} style={project.imageUrls?.[0]?{backgroundImage:"url("+project.imageUrls[0]+")",backgroundSize:"cover",backgroundPosition:"center"}:{}}>{!project.imageUrls?.[0]&&<div className="projectNoImage"><img src="/aadland-service-logo.webp" alt=""/><span>Bilder kommer</span></div>}<div className="projectCaption"><span>{(project.category||"OPPDRAG").toUpperCase()}</span><strong>{project.title}</strong>{project.description&&<p>{project.description}</p>}<em>Se prosjekt →</em></div></a>):<a href="/prosjekter" className="projectEmptyTeaser"><img src="/aadland-service-logo.webp" alt="Aadland Service"/><div><span className="goldLabel">TIDLIGERE OPPDRAG</span><strong>Prosjekter publiseres fortløpende</strong><p>Når bilder legges inn i backoffice, vises de her og i det nye prosjektgalleriet.</p><em>Se prosjektgalleriet →</em></div></a>}
   </div>
  </div></section>}

  {siteSettings.showSurvey!==false&&<section id="befaring" className="contactSection"><div className="contactPhoto" aria-hidden="true"></div><div className="contactShade" aria-hidden="true"></div><div className="homeWrap contactGrid">
   <div className="contactCopy"><span className="goldLabel">KONTAKT OSS</span><h2>Har du et prosjekt<br/>i tankene?</h2><p>Beskriv hva du ønsker hjelp med. Befaringen er gratis og uforpliktende, og vi tar kontakt for å finne et tidspunkt som passer.</p><div className="contactBenefits"><span><b aria-hidden="true">✓</b>Gratis og uforpliktende befaring</span><span><b aria-hidden="true">✓</b>Rask tilbakemelding</span><span><b aria-hidden="true">✓</b>Bergen og omegn</span></div><div className="contactDetails"><a href={"tel:"+siteSettings.phone.replace(/\s/g,"")}>{siteSettings.phone}</a><a href={"mailto:"+siteSettings.email}>{siteSettings.email}</a></div></div>
   <form className="homeForm" onSubmit={customOrder} aria-busy={sending}>
    {customerAccount&&<p className="customerPrefillNote">✓ Kontaktopplysninger er hentet fra Min side. Du kan endre dem for denne forespørselen.</p>}
    <Field label="Hva gjelder det? *"><select required value={selectedService} onChange={e=>setSelectedService(e.target.value)}><option value="">Velg tjeneste</option>{services.filter(service=>service.kind!=="products"&&service.kind!=="rental").map(service=><option key={service.slug} value={service.title}>{service.title}</option>)}<option value="Annet">Annet</option></select></Field>
    {message&&<div className="success"><b>Forespørselen er mottatt</b>{message.orderNumber&&<p>Ordrenummer: {message.orderNumber}</p>}{customerAccount&&<p><a href="/min-side">Se forespørselen på Min side →</a></p>}</div>}
    <div className="formTwo"><Field label="Navn *"><input autoComplete="name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></Field><Field label="Telefon *"><input type="tel" autoComplete="tel" required value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></Field></div>
    <Field label="E-post *"><input type="email" autoComplete="email" required value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></Field>
    <Field label="Adresse"><input autoComplete="street-address" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})} placeholder="Adresse for prosjektet"/></Field>
    <div className="formTwo"><Field label="Postnummer"><input inputMode="numeric" autoComplete="postal-code" value={customer.postalCode} onChange={e=>setCustomer({...customer,postalCode:e.target.value})}/></Field><Field label="Sted"><input autoComplete="address-level2" value={customer.city} onChange={e=>setCustomer({...customer,city:e.target.value})}/></Field></div>
    <Field label="Beskriv hva du ønsker hjelp med *"><textarea rows="5" required value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Beskriv kort hva du ønsker hjelp med …"/></Field>
    <label className="contactUpload"><span>Last opp bilder <small>(valgfritt)</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{const picked=Array.from(e.target.files||[]);const valid=picked.filter(file=>["image/jpeg","image/png","image/webp"].includes(file.type)&&file.size<=4*1024*1024).slice(0,8);setContactImages(valid);setImageError(valid.length!==picked.length?"Noen bilder ble ikke lagt til. Bruk JPG, PNG eller WebP, maks 4 MB per bilde og maks 8 bilder.":"");}}/><strong>Velg bilder</strong><em>{contactImages.length?`${contactImages.length} bilde${contactImages.length===1?"":"r"} valgt`:"Dra og slipp eller velg filer · JPG, PNG eller WebP · maks 8 bilder"}</em></label>
    {imageError&&<p className="contactImageError">{imageError}</p>}
    {contactImages.length>0&&<div className="contactImageSelected"><b>{contactImages.length} bilde{contactImages.length===1?"":"r"} klare</b><button type="button" onClick={()=>setContactImages([])}>Fjern bilder</button></div>}
    {error&&<p className="notice">{error}</p>}<button className="goldBtn submitBtn" disabled={sending} aria-disabled={sending}>{sending?"Sender forespørsel …":"Send forespørsel →"}</button><small>Vi bruker opplysningene for å behandle og følge opp forespørselen din. Se <a href="/personvern">personvernerklæringen</a>.</small>
   </form>
  </div></section>}

  <footer id="kontakt" className="homeFooter"><div className="homeWrap footerGrid"><div className="footerIdentity"><div className="homeBrand"><img className="brandLogo footerLogo" src="/aadland-service-logo.webp" alt="Aadland Service"/></div><p className="footerTagline">Lokalt håndverk – solide resultater</p></div><div><b>Kontakt</b><div className="footerServices"><a href={"tel:"+siteSettings.phone.replace(/\s/g,"")}>{siteSettings.phone}</a><a href={"mailto:"+siteSettings.email}>{siteSettings.email}</a></div></div><div><b>Tjenester</b><div className="footerServices">
 {footerServices.map(service=><a key={service.slug} href={serviceHref(service)}>{service.title}</a>)}
 </div></div><div><b>Firma</b><div className="footerServices"><a href="#om">Om oss</a><a href="/prosjekter">Tidligere oppdrag</a><a href="#befaring">Gratis befaring</a><a href="/vilkar/utleie">Utleiebetingelser</a><a href="/vilkar/salg">Salgsbetingelser</a><a href="/personvern">Personvern</a></div><p>Org.nr. {siteSettings.orgNumber}<br/>{siteSettings.location}</p></div></div><div className="homeWrap footerBottom"><span>© Aadland Service</span><div><a href="/min-side">Min side</a><a href="/personvern">Personvern</a><a href="/produkter">Produkter</a><a href="#tjenester">Tjenester</a><a href="#kontakt">Kontakt</a></div></div></footer>
 </main>;
}
function Field({label,children}){return <label className="homeField"><span>{label}</span>{children}</label>}
