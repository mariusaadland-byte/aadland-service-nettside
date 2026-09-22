"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "../../produkter/ProductChrome";

export default function ProjectDetailPage(){
 const params=useParams();
 const slug=decodeURIComponent(String(params?.slug||""));
 const [project,setProject]=useState(null);
 const [previousProject,setPreviousProject]=useState(null);
 const [nextProject,setNextProject]=useState(null);
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
   .then(data=>{
    setProject(data.project||null);
    setPreviousProject(data.previousProject||null);
    setNextProject(data.nextProject||null);
   })
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
 const storyBlocks=Array.isArray(project.contentBlocks)&&project.contentBlocks.length
  ? project.contentBlocks.filter(block=>block&&((block.type==="image"&&block.url)||(block.type==="text"&&(block.eyebrow||block.title||block.body))))
  : images.map((url,index)=>({id:"image-"+index,type:"image",url}));

 const storySections=[];
 let pendingImages=[];
 storyBlocks.forEach((block,index)=>{
  if(block.type==="image"){
   pendingImages.push({...block,_storyIndex:index});
   return;
  }
  if(pendingImages.length){
   storySections.push({type:"images",id:"images-"+index,items:pendingImages});
   pendingImages=[];
  }
  storySections.push({...block,_storyIndex:index});
 });
 if(pendingImages.length)storySections.push({type:"images",id:"images-end",items:pendingImages});

 function openStoryImage(url){
  const index=images.indexOf(url);
  if(index>=0)setActiveImage(index);
 }

 const activeStoryImage=activeImage===null?null:storyBlocks.find(block=>block.type==="image"&&block.url===images[activeImage]);

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

    {storyBlocks.length===0?(
     <div className="projectDetailPlaceholder"><CatalogPlaceholder label="Bilder kommer"/></div>
    ):(
     <div className="projectStory">
      {storySections.map((section,index)=>section.type==="text"?(
       <section className="projectStoryText" key={section.id||("text-"+index)}>
        {section.eyebrow&&<span className="catalogEyebrow">{section.eyebrow}</span>}
        {section.title&&<h3>{section.title}</h3>}
        {section.body&&<p>{section.body}</p>}
       </section>
      ):(
       <div className={"projectStoryImageGroup imageCount"+section.items.length} key={section.id||("images-"+index)}>
        {section.items.map((block,imageIndex)=>(
         <button
          className={"projectStoryImage "+(section.items.length%2===1&&imageIndex===section.items.length-1?"isLastOdd":"")}
          key={block.id||block.url||imageIndex}
          type="button"
          onClick={()=>openStoryImage(block.url)}
          aria-label={"Åpne prosjektbilde "+(images.indexOf(block.url)+1)}
         >
          <img src={block.url} alt={block.alt||project.title+" – prosjektbilde "+(images.indexOf(block.url)+1)}/>
          <span className="projectStoryOpen">Se bilde</span>
          {block.caption&&<small className="projectStoryCaption">{block.caption}</small>}
         </button>
        ))}
       </div>
      ))}
     </div>
    )}
   </div>
  </section>

  {(previousProject||nextProject)&&<section className="projectDetailMore">
   <div className="catalogWrap">
    <div className="projectGalleryIntro">
     <div><span className="catalogEyebrow">FLERE OPPDRAG</span><h2>Se flere prosjekter</h2></div>
     <Link href="/prosjekter" className="projectGalleryLink">Alle prosjekter <b>→</b></Link>
    </div>
    <div className="projectDetailNavGrid">
     {previousProject&&<Link href={"/prosjekter/"+previousProject.slug} className="projectDetailNavCard previous">
      <div className="projectDetailNavMedia">
       {previousProject.imageUrl?<img src={previousProject.imageUrl} alt=""/>:<CatalogPlaceholder label="Prosjektbilde kommer"/>}
      </div>
      <div><span>← Forrige prosjekt</span><b>{previousProject.title}</b>{previousProject.category&&<small>{previousProject.category}</small>}</div>
     </Link>}
     {nextProject&&<Link href={"/prosjekter/"+nextProject.slug} className="projectDetailNavCard next">
      <div><span>Neste prosjekt →</span><b>{nextProject.title}</b>{nextProject.category&&<small>{nextProject.category}</small>}</div>
      <div className="projectDetailNavMedia">
       {nextProject.imageUrl?<img src={nextProject.imageUrl} alt=""/>:<CatalogPlaceholder label="Prosjektbilde kommer"/>}
      </div>
     </Link>}
    </div>
   </div>
  </section>}

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
    <img src={images[activeImage]} alt={activeStoryImage?.alt||project.title+" – bilde "+(activeImage+1)}/>
    {activeStoryImage?.caption&&<div className="projectLightboxCaption">{activeStoryImage.caption}</div>}
    {images.length>1&&<button className="projectLightboxNext" type="button" aria-label="Neste bilde" onClick={()=>setActiveImage((activeImage+1)%images.length)}>→</button>}
    <div className="projectLightboxCount">{activeImage+1} / {images.length}</div>
   </div>
  </div>}
 </main>;
}
