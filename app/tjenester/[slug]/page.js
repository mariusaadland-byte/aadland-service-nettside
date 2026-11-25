"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {CatalogFooter,CatalogHeader} from "../../produkter/ProductChrome";
import {safePublicImageUrl} from "../../../lib/publicContentImages";

const fallback={
 renovation:{title:"Oppussing og renovering",description:"Vi hjelper med oppgradering og fornyelse av hjemmet – fra mindre rom og overflater til større oppussingsjobber.",points:["Innvendig oppussing og fornyelse","Montering og praktiske byggearbeider","Tilpasninger og ferdigstilling"]},
 outdoor:{title:"Uteområder og hage",description:"Vi bygger og forbedrer uteområder med praktiske løsninger som er laget for å brukes og vare.",points:["Terrasser og plattinger","Levegger, rekkverk og skjerming","Hagearbeid, vedlikehold og praktiske uteprosjekter"]},
 maintenance:{title:"Vedlikehold og småjobber",description:"Vi tar hånd om reparasjoner, montering og de små og mellomstore jobbene som må bli gjort.",points:["Reparasjoner og vedlikehold","Montering og utskifting","Små bygge- og forbedringsjobber"]}
};
export default function ServicePage(){
 const params=useParams(),slug=decodeURIComponent(String(params?.slug||""));
 const [service,setService]=useState(null),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  setLoading(true);
  fetch("/api/services")
   .then(r=>{if(!r.ok)throw Error("Tjenestene kunne ikke hentes.");return r.json();})
   .then(data=>{
    if(!active)return;
    const found=(data?.services||[]).find(s=>s.slug===slug&&s.active!==false);
    // Old hard-coded pages exist only while no services have ever been configured.
    // Once content is administered, a hidden service must not remain public.
    setService(found||(data?.configured===false?fallback[slug]:null)||null);
   })
   .catch(()=>{if(active)setService(null);})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[slug]);
 if(loading)return <main className="catalogPage serviceDetail"><CatalogHeader/><div className="serviceDetailWrap"><p>Laster …</p></div><CatalogFooter/></main>;
 if(!service)return <main className="catalogPage serviceDetail"><CatalogHeader/><div className="serviceDetailWrap"><a href="/">← Forsiden</a><h1>Tjenesten ble ikke funnet</h1></div><CatalogFooter/></main>;
 const details=fallback[slug],points=details?.points||["Vi avklarer behov og ønsket resultat","Du får ryddig oppfølging gjennom prosjektet","Løsningen tilpasses jobben og stedet"];
 const heroImage=safePublicImageUrl(service.imageUrl||"");
 function survey(){sessionStorage.setItem("aadland-service",service.title)}
 return <main className="catalogPage serviceDetail">
  <CatalogHeader/>
  <section className="serviceDetailHero" style={heroImage?{backgroundImage:"linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.25)),url("+heroImage+")"}:{}}><div className="serviceDetailWrap"><span className="goldLabel">AADLAND SERVICE · TJENESTE</span><h1>{service.title}</h1><p>{service.description||details?.description}</p><a className="goldBtn" href="/#befaring" onClick={survey}>Be om gratis befaring →</a></div></section>
  <section className="serviceDetailBody"><div className="serviceDetailWrap serviceDetailGrid"><div><span className="goldLabel">DETTE KAN VI HJELPE MED</span><h2>En løsning tilpasset prosjektet ditt</h2><p>{details?.description||service.description}</p></div><ul>{points.map(p=><li key={p}>✓ {p}</li>)}</ul></div></section>
  <section className="serviceDetailCta"><div className="serviceDetailWrap"><h2>Usikker på hva som trengs?</h2><p>Befaringen er gratis og uforpliktende. Fortell oss kort om prosjektet, så tar vi kontakt.</p><a className="goldBtn" href="/#befaring" onClick={survey}>Gratis befaring →</a></div></section>
  <CatalogFooter/>
 </main>
}