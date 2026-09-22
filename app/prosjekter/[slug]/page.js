import {notFound} from "next/navigation";
import {db} from "../../../lib/supabase";

export const dynamic="force-dynamic";

function normalizeGallery(value){
 return (Array.isArray(value)?value:[]).map(item=>{
  if(typeof item==="string")return {url:item,caption:""};
  return {url:item?.url||"",caption:item?.caption||""};
 }).filter(item=>item.url);
}

export default async function ProjectPage({params}){
 const {slug}=await params;
 const client=db();
 if(!client)notFound();
 const {data:project,error}=await client.from("projects").select("*").eq("slug",slug).eq("active",true).maybeSingle();
 if(error||!project)notFound();

 const gallery=normalizeGallery(project.image_urls);
 const hero=gallery[0];

 return <main className="projectDetailPage">
  <header className="projectDetailHeader">
   <div className="projectDetailNav">
    <a href="/" className="projectDetailLogo"><img src="/aadland-service-logo.webp" alt="Aadland Service"/></a>
    <nav><a href="/">Hjem</a><a href="/#tjenester">Tjenester</a><a href="/#prosjekter">Tidligere oppdrag</a><a href="/#befaring">Kontakt</a></nav>
    <a className="goldBtn projectDetailCta" href="/#befaring">Gratis befaring →</a>
   </div>
  </header>

  <section className="projectDetailHero">
   {hero&&<img src={hero.url} alt={project.title}/>}
   <div className="projectDetailHeroShade"></div>
   <div className="projectDetailHeroContent">
    <a href="/#prosjekter" className="projectBackLink">← Tilbake til tidligere oppdrag</a>
    <span className="goldLabel">{(project.category||"TIDLIGERE OPPDRAG").toUpperCase()}</span>
    <h1>{project.title}</h1>
    {project.description&&<p>{project.description}</p>}
   </div>
  </section>

  <section className="projectStory">
   <div className="projectStoryIntro">
    <span className="goldLabel">PROSJEKTET</span>
    <h2>Se arbeidet steg for steg</h2>
    <p>Her viser vi bilder fra oppdraget og litt om arbeidet som ble gjort underveis.</p>
   </div>
   {gallery.length?<div className="projectStoryList">
    {gallery.map((image,index)=><figure className={"projectStoryItem "+(index%2?"projectStoryItemReverse":"")} key={image.url+index}>
     <div className="projectStoryImage"><img src={image.url} alt={image.caption||project.title+" – bilde "+(index+1)}/></div>
     <figcaption><span>{String(index+1).padStart(2,"0")}</span>{image.caption?<p>{image.caption}</p>:<p>Bilde fra prosjektet.</p>}</figcaption>
    </figure>)}
   </div>:<div className="projectNoImages"><p>Flere bilder fra dette prosjektet kommer snart.</p></div>}
  </section>

  <section className="projectDetailContact">
   <div><span className="goldLabel">HAR DU NOE LIGNENDE I TANKENE?</span><h2>Fortell oss om prosjektet ditt.</h2><p>Vi tar gjerne en gratis og uforpliktende befaring og ser på hva som passer hos deg.</p></div>
   <a className="goldBtn" href="/#befaring">Be om gratis befaring →</a>
  </section>
 </main>;
}
