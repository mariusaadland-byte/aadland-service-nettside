"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {CatalogFooter,CatalogHeader,CatalogPlaceholder} from "../produkter/ProductChrome";
import {filterRentalCatalog,rentalCatalogCategory,RENTAL_CATALOG_PAGE_SIZE} from "../../lib/rentalCatalogFilter.mjs";

const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);


export default function Utleie(){
 const [items,setItems]=useState([]);
 const [categories,setCategories]=useState([]);
 const [filter,setFilter]=useState("all");
 const [visibleCount,setVisibleCount]=useState(RENTAL_CATALOG_PAGE_SIZE);
 const [query,setQuery]=useState("");
 const [sort,setSort]=useState("recommended");
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

 const filtered=useMemo(()=>filterRentalCatalog(items,categories,{category:filter,query,sort}),[items,categories,filter,query,sort]);
 const visible=filtered.slice(0,visibleCount);
 const uncategorized=items.some(item=>rentalCatalogCategory(item,categories)==="uncategorized");
 function chooseFilter(value){
  setFilter(value);
  setVisibleCount(RENTAL_CATALOG_PAGE_SIZE);
 }
 function changeQuery(value){
  setQuery(value);
  setVisibleCount(RENTAL_CATALOG_PAGE_SIZE);
 }
 function changeSort(value){
  setSort(value);
  setVisibleCount(RENTAL_CATALOG_PAGE_SIZE);
 }
 function resetFilters(){
  chooseFilter("all");
  changeQuery("");
  changeSort("recommended");
 }

 return <main className="catalogPage rentalPage">
  <CatalogHeader rental/>

  <section className="rentalHero">
   <div className="catalogWrap rentalHeroInner">
    <span className="catalogEyebrow">AADLAND UTLEIE</span>
    <h1>Utstyr til jobben.</h1>
    <p>Finn det du trenger, åpne produktet og velg ønsket leieperiode i kalenderen.</p>
    <div className="rentalHeroActions">
     <a className="catalogGoldButton" href="#utleiekatalog">Se utleieutstyr →</a>
     <Link className="rentalHeroAccount" href="/min-side">Min side →</Link>
    </div>
    <div className="rentalHeroTrust"><span>✓ Se pris før booking</span><span>✓ Kalender på hvert produkt</span><span>✓ Henting eller levering der det tilbys</span></div>
   </div>
  </section>

  <section id="utleiekatalog" className="rentalCatalogSection">
   <div className="catalogWrap">
    <div className="rentalCatalogHeading">
     <div>
      <span className="catalogEyebrow">UTLEIEKATALOG</span>
      <h2>Hva trenger du?</h2>
     </div>
     {!loading&&!setup&&!error&&<span role="status" aria-live="polite">Viser {visible.length} av {filtered.length} {filtered.length===1?"produkt":"produkter"}</span>}
    </div>

    {!setup&&!error&&<div className="rentalCatalogControls">
     <div className="rentalCatalogSearch">
      <label htmlFor="rental-search">Søk etter utstyr</label>
      <div className="rentalSearchField">
       <input id="rental-search" type="search" placeholder="F.eks. drill, sag eller slipemaskin" value={query} onChange={event=>changeQuery(event.target.value)} autoComplete="off"/>
       {query&&<button type="button" onClick={()=>changeQuery("")} aria-label="Tøm søk">Tøm</button>}
      </div>
     </div>
     <div className="rentalCatalogSort">
      <label htmlFor="rental-sort">Sorter</label>
      <select id="rental-sort" value={sort} onChange={event=>changeSort(event.target.value)}>
       <option value="recommended">Anbefalt</option><option value="price-asc">Laveste døgnpris</option><option value="price-desc">Høyeste døgnpris</option><option value="name">Produktnavn A–Å</option>
      </select>
     </div>
    </div>}

    {(categories.length>0||uncategorized)&&<div className="rentalCategoryFilters" aria-label="Velg utleiekategori">
     <button type="button" aria-pressed={filter==="all"} className={filter==="all"?"isActive":""} onClick={()=>chooseFilter("all")}>Alle</button>
     {categories.map(category=><button type="button" key={category.id} aria-pressed={filter===category.id} className={filter===category.id?"isActive":""} onClick={()=>chooseFilter(category.id)}>{category.name}</button>)}
     {uncategorized&&<button type="button" aria-pressed={filter==="uncategorized"} className={filter==="uncategorized"?"isActive":""} onClick={()=>chooseFilter("uncategorized")}>Annet</button>}
    </div>}

    {error&&<div className="catalogNotice"><b>Noe gikk galt</b><p>{error}</p></div>}
    {setup&&<div className="catalogNotice"><b>Utleie åpner snart</b><p>Utleieoppsettet klargjøres.</p></div>}

    {loading?<div className="catalogStatus">Laster utleieutstyr …</div>:error||setup?null:!visible.length?(
     <div className="catalogNotice"><b>{query.trim()||filter!=="all"?"Ingen produkter passer søket":"Ingen produkter her ennå"}</b><p>{query.trim()||filter!=="all"?"Prøv et annet søkeord eller en annen kategori.":"Ta gjerne kontakt om utstyr du trenger."}</p>{(query.trim()||filter!=="all")&&<button type="button" className="catalogGoldButton rentalResetFilters" onClick={resetFilters}>Nullstill søk og filter</button>}</div>
    ):(
     <div className="rentalCatalogGrid">
      {visible.map(item=>{
       const image=item.imageUrls?.[0];
       return <Link href={"/utleie/"+item.slug} className="rentalCatalogCard" key={item.id} aria-label={"Se og lei "+item.name}>
        <div className="rentalCatalogMedia">
         {image?<img src={image} alt={item.name}/>:<CatalogPlaceholder rental label="Utstyrsbilde kommer"/>}
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
    {!loading&&!setup&&!error&&visible.length<filtered.length&&<div className="rentalLoadMore">
     <button type="button" className="catalogGoldButton" onClick={()=>setVisibleCount(count=>count+RENTAL_CATALOG_PAGE_SIZE)}>Vis flere produkter →</button>
     <span>{filtered.length-visible.length} igjen</span>
    </div>}
   </div>
  </section>

  <section className="catalogCallout rentalCallout">
   <div className="catalogWrap catalogCalloutInner">
    <div><span className="catalogEyebrow">FINNER DU IKKE DET DU TRENGER?</span><h2>Spør oss om utstyr.</h2><p>Ta kontakt, så ser vi om vi har en løsning som passer jobben.</p></div>
    <a href="mailto:post@aadland-service.no?subject=Sp%C3%B8rsm%C3%A5l%20om%20utleie" className="catalogGoldButton">Kontakt oss →</a>
   </div>
  </section>

  <CatalogFooter rental/>
 </main>;
}
