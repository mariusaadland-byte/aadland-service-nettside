import {db} from "../../lib/supabase";

export const dynamic="force-dynamic";

function firstImage(value){
 const images=Array.isArray(value)?value:[];
 const first=images[0];
 return typeof first==="string"?first:first?.url||"";
}

export default async function ProjectsPage(){
 const client=db();
 let projects=[];
 if(client){
  const {data,error}=await client.from("projects").select("*").eq("active",true).order("sort_order").order("created_at",{ascending:false});
  if(!error)projects=data||[];
 }

 return <main className="projectsIndexPage">
  <header className="projectDetailHeader">
   <div className="projectDetailNav">
    <a href="/" className="projectDetailLogo"><img src="/aadland-service-logo.webp" alt="Aadland Service"/></a>
    <nav><a href="/">Hjem</a><a href="/#tjenester">Tjenester</a><a href="/prosjekter">Tidligere oppdrag</a><a href="/produkter">Produkter</a><a href="/utleie">Utleie</a></nav>
    <a className="goldBtn projectDetailCta" href="/#befaring">Gratis befaring →</a>
   </div>
  </header>

  <section className="projectsIndexHero">
   <div className="projectsIndexWrap">
    <span className="goldLabel">TIDLIGERE OPPDRAG</span>
    <h1>Resultater vi er stolte av.</h1>
    <p>Se et utvalg av arbeid vi har utført. Åpne et prosjekt for å se flere bilder og lese mer om arbeidet underveis.</p>
   </div>
  </section>

  <section className="projectsIndexSection">
   <div className="projectsIndexWrap">
    {projects.length?<div className="projectsIndexGrid">
     {projects.map(project=>{const image=firstImage(project.image_urls);return <a className="projectsIndexCard" href={"/prosjekter/"+project.slug} key={project.id}>
      <div className="projectsIndexImage">{image?<img src={image} alt={project.title}/>:<span>Flere bilder kommer</span>}</div>
      <div className="projectsIndexCardBody">
       <span>{(project.category||"OPPDRAG").toUpperCase()}</span>
       <h2>{project.title}</h2>
       {project.description&&<p>{project.description}</p>}
       <b>Se hele prosjektet →</b>
      </div>
     </a>})}
    </div>:<div className="projectsIndexEmpty"><h2>Flere prosjekter kommer snart.</h2><p>Vi legger fortløpende ut bilder fra utførte oppdrag.</p></div>}
   </div>
  </section>

  <section className="projectDetailContact">
   <div><span className="goldLabel">DITT NESTE PROSJEKT?</span><h2>Fortell oss hva du ønsker gjort.</h2><p>Vi tar gjerne en gratis og uforpliktende befaring og finner en løsning som passer prosjektet ditt.</p></div>
   <a className="goldBtn" href="/#befaring">Be om gratis befaring →</a>
  </section>
 </main>;
}
