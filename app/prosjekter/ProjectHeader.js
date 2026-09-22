"use client";
import {useState} from "react";

export default function ProjectHeader(){
 const [open,setOpen]=useState(false);
 return <header className="projectDetailHeader">
  <div className="projectDetailNav">
   <a href="/" className="projectDetailLogo"><img src="/aadland-service-logo.webp" alt="Aadland Service"/></a>
   <button className={"projectMenuButton "+(open?"isOpen":"")} type="button" aria-label={open?"Lukk meny":"Åpne meny"} aria-expanded={open} aria-controls="project-nav" onClick={()=>setOpen(!open)}><span></span><span></span><span></span></button>
   <nav id="project-nav" className={open?"isOpen":""} onClick={()=>setOpen(false)}>
    <a href="/">Hjem</a>
    <a href="/#tjenester">Tjenester</a>
    <a href="/prosjekter">Tidligere oppdrag</a>
    <a href="/produkter">Produkter</a>
    <a href="/utleie">Utleie</a>
    <a href="/#befaring">Kontakt</a>
   </nav>
   <a className="goldBtn projectDetailCta" href="/#befaring">Gratis befaring →</a>
  </div>
 </header>;
}
