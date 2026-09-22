"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "../produkter/ProductChrome";

export default function ProjectsPage(){
 const [projects,setProjects]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [categoryFilter,setCategoryFilter]=useState("all");

 useEffect(()=>{
  fetch("/api/projects?all=1")
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Prosjektene kunne ikke hentes.");
    return data;
   })
   .then(data=>setProjects(Array.isArray(data.projects)?data.projects:[]))
   .catch(err=>setError(err.message||"Prosjektene kunne ikke hentes."))
   .finally(()=>setLoading(false));
 },[]);

 const categories=Array.from(new Set(projects.map(project=>String(project.category||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"nb"));
 const filteredProjects=categoryFilter==="all"?projects:projects.filter(project=>String(project.category||"").trim()===categoryFilter);

 return <main className="catalogPage projectGalleryPage">
  <CatalogHeader/>

  <section className="projectGalleryHero">
   <div className="catalogWrap projectGalleryHeroInner">
    <Link className="catalogBack" href="/">← Tilbake til forsiden</Link>
    <span className="catalogEyebrow">TIDLIGERE OPPDRAG</span>
    <h1>Resultater vi er stolte av</h1>
    <p>Se arbeid vi har utført. Åpne et prosjekt for å se hele bildegalleriet og mer informasjon om jobben.</p>
   </div>
  </section>

  <section className="projectGallerySection">
   <div className="catalogWrap">
    <div className="projectGalleryIntro">
     <div>
      <span className="catalogEyebrow">PROSJEKTER</span>
      <h2>Utførte oppdrag</h2>
     </div>
     {!loading&&!error&&projects.length>0&&<span className="projectGalleryCount">{filteredProjects.length} av {projects.length} {projects.length===1?"prosjekt":"prosjekter"}</span>}
    </div>

    {!loading&&!error&&categories.length>1&&<div className="projectGalleryFilters" aria-label="Filtrer prosjekter etter kategori">
     <button type="button" aria-pressed={categoryFilter==="all"} className={categoryFilter==="all"?"isActive":""} onClick={()=>setCategoryFilter("all")}>Alle</button>
     {categories.map(category=><button type="button" key={category} aria-pressed={categoryFilter===category} className={categoryFilter===category?"isActive":""} onClick={()=>setCategoryFilter(category)}>{category}</button>)}
    </div>}

    {loading&&<div className="catalogStatus">Laster prosjekter …</div>}
    {error&&<div className="catalogNotice"><b>Noe gikk galt</b><p>{error}</p></div>}
    {!loading&&!error&&projects.length===0&&<div className="catalogNotice"><b>Ingen prosjekter publisert ennå</b><p>Nye referanseprosjekter kommer her.</p></div>}

    {!loading&&!error&&projects.length>0&&filteredProjects.length===0&&<div className="catalogNotice"><b>Ingen prosjekter i denne kategorien</b><p>Velg en annen kategori for å se flere oppdrag.</p></div>}
    {!loading&&!error&&filteredProjects.length>0&&<div className="projectGalleryGrid">
     {filteredProjects.map((project,index)=>{
      const image=project.imageUrls?.[0];
      return <Link href={"/prosjekter/"+project.slug} className="projectGalleryCard" key={project.id||project.slug} aria-label={"Se prosjektet "+project.title}>
       <div className="projectGalleryMedia">
        {image?<img src={image} alt={project.title}/>:<CatalogPlaceholder label="Prosjektbilde kommer"/>}
        <span className="projectGalleryImageCount">{project.imageUrls?.length ? `${project.imageUrls.length} ${project.imageUrls.length===1?"bilde":"bilder"}` : "Bilder kommer"}</span>
       </div>
       <div className="projectGalleryCardBody">
        <span className="catalogEyebrow">{(project.category||"OPPDRAG").toUpperCase()}</span>
        <h3>{project.title}</h3>
        {project.description&&<p>{project.description}</p>}
        <span className="projectGalleryLink">Se prosjektet <b>→</b></span>
       </div>
      </Link>
     })}
    </div>}
   </div>
  </section>

  <section className="catalogCallout">
   <div className="catalogWrap catalogCalloutInner">
    <div>
     <span className="catalogEyebrow">DITT PROSJEKT</span>
     <h2>Har du noe lignende i tankene?</h2>
     <p>Send oss noen linjer om jobben, så finner vi en god vei videre.</p>
    </div>
    <Link href="/#befaring" className="catalogGoldButton">Gratis befaring →</Link>
   </div>
  </section>

  <CatalogFooter/>
 </main>;
}
