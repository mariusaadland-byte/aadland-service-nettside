"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {CatalogFooter,CatalogHeader,CatalogPlaceholder} from "../produkter/ProductChrome";

const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);

function mixRentalItems(items,categories){
 const categoryIds=categories.map(category=>category.id);
 const groups=categoryIds.map(id=>items.filter(item=>item.categoryId===id));
 const extra=items.filter(item=>!categoryIds.includes(item.categoryId));
 const mixed=[];
 let index=0;
 while(groups.some(group=>index<group.length)){
  for(const group of groups){
   if(index<group.length)mixed.push(group[index]);
  }
  index++;
 }
 return mixed.concat(extra);
}

export default function Utleie(){
 const [items,setItems]=useState([]);
 const [categories,setCategories]=useState([]);
 const [filter,setFilter]=useState("all");
 const [visibleCount,setVisibleCount]=useState(12);
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
    setFilter("all");
    setSetup(!!data.setupRequired);
   })
   .catch(err=>{if(!cancelled)setError(err.message||"Utleie kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[]);

 const mixedItems=useMemo(()=>mixRentalItems(items,categories),[items,categories]);
 const filtered=useMemo(()=>{
  if(filter==="uncategorized")return items.filter(item=>!item.categoryId);
  if(filter==="all")return mixedItems;
  return items.filter(item=>item.categoryId===filter);
 },[items,mixedItems,filter]);
 const visible=filtered.slice(0,visibleCount);
 const uncategorized=items.some(item=>!item.categoryId);

 function chooseFilter(value){
  setFilter(value);
  setVisibleCount(12);
 }

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
     {!loading&&!setup&&<span>{Math.min(visible.length,filtered.length)} av {filtered.length} {filtered.length===1?"produkt":"produkter"}</span>}
    </div>

    {categories.length>0&&<div className="rentalCategoryFilters" aria-label="Velg utleiekategori">
     <button type="button" aria-pressed={filter==="all"} className={filter==="all"?"isActive":""} onClick={()=>chooseFilter("all")}>Alle</button>
     {categories.map(category=><button type="button" key={category.id} aria-pressed={filter===category.id} className={filter===category.id?"isActive":""} onClick={()=>chooseFilter(category.id)}>{category.name}</button>)}
     {uncategorized&&<button type="button" aria-pressed={filter==="uncategorized"} className={filter==="uncategorized"?"isActive":""} onClick={()=>chooseFilter("uncategorized")}>Annet</button>}
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
    {!loading&&!setup&&visible.length<filtered.length&&<div className="rentalLoadMore">
     <button type="button" className="catalogGoldButton" onClick={()=>setVisibleCount(count=>count+12)}>Vis flere produkter →</button>
     <span>{filtered.length-visible.length} igjen</span>
    </div>}
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
