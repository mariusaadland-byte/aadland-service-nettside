"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./rentalInventory.module.css";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
const labels={available:"Tilgjengelig",unavailable:"Utilgjengelig",maintenance:"Vedlikehold",hidden:"Skjult"};
export default function RentalInventoryClient(){
 const [items,setItems]=useState([]),[categories,setCategories]=useState([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 async function load(){
  setLoading(true);setError("");
  try{
   const [a,b]=await Promise.all([fetch("/api/admin/rental",{cache:"no-store"}),fetch("/api/admin/rental/categories",{cache:"no-store"})]);
   const [product,category]=await Promise.all([a.json(),b.json()]);
   if(!a.ok||!b.ok)throw Error(product.error||category.error||"Kunne ikke hente utleieutstyret.");
   if(product.setupRequired||category.setupRequired)throw Error("Utleiedatabasen må klargjøres før produkter kan administreres.");
   setItems(product.items||[]);setCategories(category.categories||[]);
  }catch(e){setError(e.message||"Kunne ikke hente utleieproduktene.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{load()},[]);
 const categoryName=useMemo(()=>new Map(categories.map(c=>[c.id,c.name])),[categories]);
 const count={active:items.filter(i=>i.active&&i.status==="available").length,draft:items.filter(i=>!i.active||i.status==="hidden").length,total:items.length};
 const visible=items.filter(item=>{
  const state=!item.active||item.status==="hidden"?"hidden":item.status;
  return (filter==="all"||filter===state)&&[item.name,categoryName.get(item.categoryId)||""].join(" ").toLocaleLowerCase("nb-NO").includes(search.toLocaleLowerCase("nb-NO").trim());
 });
 return <main className={styles.root}>
  <header className={styles.heading}>
   <div><Link href="/admin/mobil" className={styles.back}>← Admin-appen</Link>
    <p className={styles.eyebrow}>AADLAND SERVICE / UTLEIE</p><h1>Utleieutstyr</h1>
    <p>Legg ut, rediger og skjul utstyr. Alt samlet på ett sted.</p></div>
   <Link href="/admin/utleie/ny" className={styles.primary}>+ Legg til utstyr</Link>
  </header>
  <div className={styles.stats}><div><strong>{count.total}</strong><span>Produkter</span></div>
   <div><strong>{count.active}</strong><span>Tilgjengelige</span></div>
   <div><strong>{count.draft}</strong><span>Skjult / utkast</span></div></div>
  <nav className={styles.actions} aria-label="Utleiehandlinger">
   <Link href="/admin/utleiekategorier">Kategorier</Link>
   <Link href="/admin">Bookinger og kalender</Link>
   <Link href="/utleie" target="_blank" rel="noreferrer">Se offentlig utleieside</Link>
   <button type="button" onClick={load} disabled={loading}>Oppdater</button>
  </nav>
  <div className={styles.controls}>
   <label>Søk i utstyr<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Navn eller kategori"/></label>
   <label>Vis<select value={filter} onChange={e=>setFilter(e.target.value)}>
    <option value="all">Alle produkter</option><option value="available">Tilgjengelige</option>
    <option value="hidden">Skjult / utkast</option><option value="unavailable">Utilgjengelige</option>
    <option value="maintenance">Vedlikehold</option>
   </select></label>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {loading?<p>Henter utleieprodukter …</p>:visible.length===0?
   <section className={styles.empty}><h2>Ingen produkter her</h2><p>Endre søkefilter eller legg inn nytt utstyr.</p>
    <Link href="/admin/utleie/ny">Legg til utstyr</Link></section>:
   <div className={styles.grid}>{visible.map(item=>{
    const published=item.active&&item.status!=="hidden";
    const reservable=published&&item.status==="available";
    return <article key={item.id} className={styles.card}>
     {item.imageUrls?.[0]?<img className={styles.photo} src={item.imageUrls[0]} alt={item.name}/>:
      <div className={styles.placeholder} aria-label="Mangler produktbilde">📷 Legg til bilde</div>}
     <div className={styles.cardBody}>
      <span className={styles.category}>{categoryName.get(item.categoryId)||item.categoryName||"Uten kategori"}</span>
      <h2>{item.name}</h2>
      <span className={styles.status} data-ready={reservable?"yes":"no"}>
       {reservable?"Kan bookes":published?labels[item.status]||"Ikke tilgjengelig":"Ikke publisert"}
      </span>
      <div className={styles.prices}>
       <div><small>Døgnpris</small><strong>{money(item.dailyPriceOre)}</strong></div>
       <div><small>Depositum</small><strong>{money(item.depositOre)}</strong></div>
       <div><small>Antall</small><strong>{item.quantity}</strong></div>
      </div>
      <div className={styles.cardActions}>
       <Link href={"/admin/utleie/"+encodeURIComponent(item.id)} className={styles.edit}>Rediger</Link>
       {published&&item.slug?<Link href={"/utleie/"+encodeURIComponent(item.slug)} target="_blank" rel="noreferrer">Se produkt</Link>:
        <span className={styles.hint}>Kun synlig i admin</span>}
      </div>
     </div>
    </article>;
   })}</div>}
  <p className={styles.foot}>Depositumet som vises er et krav i bestillingen, ikke en automatisk Vipps-reservasjon.
   Kundebetaling er ikke aktivert fra denne siden.</p>
 </main>;
}
