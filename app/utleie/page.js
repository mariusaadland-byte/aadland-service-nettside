"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {CatalogFooter,CatalogHeader,CatalogPlaceholder} from "../produkter/ProductChrome";

const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);

export default function Utleie(){
 const [items,setItems]=useState([]);
 const [categories,setCategories]=useState([]);
 const [filter,setFilter]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [setup,setSetup]=useState(false);

 useEffect(()=>{
  let cancelled=false;
  fetch("/api/rental")
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Utleie kunne ikke lastes.");
    return data;
   })
   .then(data=>{
    if(cancelled)return;
    const nextCategories=data.categories||[];
    const nextItems=data.items||[];
    setCategories(nextCategories);
    setItems(nextItems);
    setFilter(current=>{
     if(current)return current;
     if(nextCategories.length)return nextCategories[0].id;
     if(nextItems.some(item=>!item.categoryId))return "uncategorized";
     return "all";
    });
    setSetup(!!data.setupRequired);
   })
   .catch(err=>{if(!cancelled)setError(err.message||"Utleie kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[]);

 const visible=useMemo(()=>{
  if(filter==="uncategorized")return items.filter(item=>!item.categoryId);
  if(filter==="all"||!filter)return items;
  return items.filter(item=>item.categoryId===filter);
 },[items,filter]);
 const uncategorized=items.some(item=>!item.categoryId);

 return <main className="catalogPage rentalPage">
  <CatalogHeader/>

  <section className="rentalHero">
   <div className="catalogWrap rentalHeroInner">
    <span className="catalogEyebrow">AADLAND SERVICE · UTLEIE</span>
    <h1>Utstyr til jobben.</h1>
    <p>Finn det du trenger, åpne produktet og velg ønsket leieperiode i kalenderen.</p>
    <div className="rentalHeroTrust"><span>✓ Se pris før booking</span><span>✓ Kalender på hvert produkt</span><span>✓ Henting eller levering der det tilbys</span></div>
   </div>
  </section>

  <section className="rentalCatalogSection">
   <div className="catalogWrap">
    <div className="rentalCatalogHeading">
     <div>
      <span className="catalogEyebrow">UTLEIEKATALOG</span>
      <h2>Hva trenger du?</h2>
     </div>
     {!loading&&!setup&&<span>{visible.length} {visible.length===1?"produkt":"produkter"}</span>}
    </div>

    {categories.length>0&&<div className="rentalCategoryFilters" aria-label="Velg utleiekategori">
     {categories.map(category=><button type="button" key={category.id} aria-pressed={filter===category.id} className={filter===category.id?"isActive":""} onClick={()=>setFilter(category.id)}>{category.name}</button>)}
     {uncategorized&&<button type="button" aria-pressed={filter==="uncategorized"} className={filter==="uncategorized"?"isActive":""} onClick={()=>setFilter("uncategorized")}>Annet</button>}
    </div>}

    {error&&<div className="catalogNotice"><b>Noe gikk galt</b><p>{error}</p></div>}
    {setup&&<div className="catalogNotice"><b>Utleie åpner snart</b><p>Utleieoppsettet klargjøres.</p></div>}

    {loading?<div className="catalogStatus">Laster utleieutstyr …</div>:!visible.length&&!setup?(
     <div className="catalogNotice"><b>Ingen produkter her ennå</b><p>Prøv en annen kategori.</p></div>
    ):(
     <div className="rentalCatalogGrid">
      {visible.map(item=>{
       const image=item.imageUrls?.[0];
       return <Link href={"/utleie/"+item.slug} className="rentalCatalogCard" key={item.id} aria-label={"Se og lei "+item.name}>
        <div className="rentalCatalogMedia">
         {image?<img src={image} alt={item.name}/>:<CatalogPlaceholder label="Utstyrsbilde kommer"/>}
         {item.categoryName&&<span className="rentalCatalogCategory">{item.categoryName}</span>}
         {item.status!=="available"&&<span className="rentalAvailabilityBadge unavailable">Midlertidig utilgjengelig</span>}
        </div>
        <div className="rentalCatalogBody">
         <h3>{item.name}</h3>
         {item.description&&<p>{item.description}</p>}
         <div className="rentalCatalogMeta">
          <div><small>Fra</small><b>{kr(item.dailyPriceOre)} / dag</b></div>
          {item.depositOre>0&&<div><small>Depositum</small><span>{kr(item.depositOre)}</span></div>}
         </div>
         <span className="rentalCatalogLink">Se og lei →</span>
        </div>
       </Link>;
      })}
     </div>
    )}
   </div>
  </section>

  <section className="catalogCallout rentalCallout">
   <div className="catalogWrap catalogCalloutInner">
    <div><span className="catalogEyebrow">FINNER DU IKKE DET DU TRENGER?</span><h2>Spør oss om utstyr.</h2><p>Ta kontakt, så ser vi om vi har en løsning som passer jobben.</p></div>
    <a href="/#befaring" className="catalogGoldButton">Kontakt oss →</a>
   </div>
  </section>

  <CatalogFooter/>
 </main>;
}
