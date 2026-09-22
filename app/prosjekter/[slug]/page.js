"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "../../produkter/ProductChrome";

export default function ProjectDetailPage(){
 const params=useParams();
 const slug=decodeURIComponent(String(params?.slug||""));
 const [project,setProject]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [activeImage,setActiveImage]=useState(null);

 useEffect(()=>{
  if(!slug)return;
  fetch("/api/projects?slug="+encodeURIComponent(slug))
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Prosjektet kunne ikke hentes.");
    return data;
   })
   .then(data=>setProject(data.project||null))
   .catch(err=>setError(err.message||"Prosjektet kunne ikke hentes."))
   .finally(()=>setLoading(false));
 },[slug]);

 useEffect(()=>{
  if(activeImage===null)return;
  const gallery=Array.isArray(project?.imageUrls)?project.imageUrls.filter(Boolean):[];
  if(!gallery.length)return;

  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";

  function onKeyDown(event){
   if(event.key==="Escape")setActiveImage(null);
   if(event.key==="ArrowLeft")setActiveImage(current=>current===null?null:(current-1+gallery.length)%gallery.length);
   if(event.key==="ArrowRight")setActiveImage(current=>current===null?null:(current+1)%gallery.length);
  }

  window.addEventListener("keydown",onKeyDown);
  return()=>{
   window.removeEventListener("keydown",onKeyDown);
   document.body.style.overflow=previousOverflow;
  };
 },[activeImage,project]);

 if(loading)return <main className="catalogPage projectDetailPage"><CatalogHeader/><section className="projectGallerySection"><div className="catalogWrap"><div className="catalogStatus">Laster prosjekt …</div></div></section><CatalogFooter/></main>;

 if(error||!project)return <main className="catalogPage projectDetailPage"><CatalogHeader/><section className="projectGallerySection"><div className="catalogWrap"><Link className="catalogBack" href="/prosjekter">← Tilbake til prosjekter</Link><div className="catalogNotice projectDetailNotice"><b>{error?"Noe gikk galt":"Prosjektet finnes ikke"}</b><p>{error||"Prosjektet kan ha blitt fjernet eller skjult."}</p><Link className="catalogGoldButton" href="/prosjekter">Se alle prosjekter →</Link></div></div></section><CatalogFooter/></main>;

 const images=Array.isArray(project.imageUrls)?project.imageUrls.filter(Boolean):[];

 return <main className="catalogPage projectDetailPage">
  <CatalogHeader/>

  <section className={"projectDetailHero "+(images[0]?"hasImage":"")} style={images[0]?{"--project-cover":`url("${images[0]}")`}:undefined}>
   <div className="catalogWrap projectDetailHeroInner">
    <Link className="catalogBack" href="/prosjekter">← Alle prosjekter</Link>
    <span className="catalogEyebrow">{(project.category||"TIDLIGERE OPPDRAG").toUpperCase()}</span>
    <h1>{project.title}</h1>
    {project.description&&<p>{project.description}</p>}
    {images.length>0&&<div className="projectDetailMeta">{images.length} {images.length===1?"bilde":"bilder"} i galleriet</div>}
   </div>
  </section>

  <section className="projectGallerySection projectDetailGallerySection">
   <div className="catalogWrap">
    <div className="projectGalleryIntro">
     <div><span className="catalogEyebrow">BILDEGALLERI</span><h2>Fra prosjektet</h2></div>
    </div>

    {images.length===0?(
     <div className="projectDetailPlaceholder"><CatalogPlaceholder label="Bilder kommer"/></div>
    ):(
     <div className={"projectDetailGrid "+(images.length===1?"single":"")}>
      {images.map((image,index)=>(
       <button className="projectDetailImage" key={image+"-"+index} type="button" onClick={()=>setActiveImage(index)} aria-label={"Åpne bilde "+(index+1)+" av "+images.length}>
        <img src={image} alt={project.title+" – bilde "+(index+1)}/>
        <span>{String(index+1).padStart(2,"0")}</span>
       </button>
      ))}
     </div>
    )}
   </div>
  </section>

  <section className="projectDetailCta">
   <div className="catalogWrap projectDetailCtaInner">
    <div><span className="catalogEyebrow">AADLAND SERVICE</span><h2>Ønsker du hjelp med et lignende prosjekt?</h2><p>Vi tilbyr gratis og uforpliktende befaring i Bergen og omegn.</p></div>
    <Link href="/#befaring" className="catalogGoldButton">Gratis befaring →</Link>
   </div>
  </section>

  <CatalogFooter/>

  {activeImage!==null&&images[activeImage]&&<div className="projectLightbox" role="presentation" onClick={()=>setActiveImage(null)}>
   <div className="projectLightboxInner" role="dialog" aria-modal="true" aria-label={"Bilde "+(activeImage+1)+" av "+images.length} onClick={e=>e.stopPropagation()}>
    <button className="projectLightboxClose" type="button" aria-label="Lukk bilde" autoFocus onClick={()=>setActiveImage(null)}>×</button>
    {images.length>1&&<button className="projectLightboxPrev" type="button" aria-label="Forrige bilde" onClick={()=>setActiveImage((activeImage-1+images.length)%images.length)}>←</button>}
    <img src={images[activeImage]} alt={project.title+" – bilde "+(activeImage+1)}/>
    {images.length>1&&<button className="projectLightboxNext" type="button" aria-label="Neste bilde" onClick={()=>setActiveImage((activeImage+1)%images.length)}>→</button>}
    <div className="projectLightboxCount">{activeImage+1} / {images.length}</div>
   </div>
  </div>}
 </main>;
}
