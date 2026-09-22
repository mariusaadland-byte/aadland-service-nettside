"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

export default function RentalCategoriesClient(){
 const [categories,setCategories]=useState([]);
 const [items,setItems]=useState([]);
 const [setupRequired,setSetupRequired]=useState(false);
 const [name,setName]=useState("");
 const [description,setDescription]=useState("");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");

 async function load(){
  setError("");
  const [catResponse,itemResponse]=await Promise.all([
   fetch("/api/admin/rental/categories"),
   fetch("/api/admin/rental")
  ]);
  const catData=await catResponse.json().catch(()=>({}));
  const itemData=await itemResponse.json().catch(()=>({}));
  if(!catResponse.ok){
   setError(catData.error||"Kategoriene kunne ikke hentes.");
   return;
  }
  setCategories(catData.categories||[]);
  setSetupRequired(catData.setupRequired===true);
  if(itemResponse.ok)setItems(itemData.items||[]);
 }

 useEffect(()=>{load()},[]);

 async function create(e){
  e.preventDefault();
  if(!name.trim())return;
  setSaving(true);setError("");
  const response=await fetch("/api/admin/rental/categories",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({name,description,active:true})
  });
  const data=await response.json().catch(()=>({}));
  setSaving(false);
  if(!response.ok){setError(data.error||"Kategorien kunne ikke opprettes.");return;}
  setName("");setDescription("");
  await load();
 }

 async function rename(category){
  const next=window.prompt("Nytt navn på kategorien:",category.name);
  if(next===null||!next.trim()||next.trim()===category.name)return;
  const response=await fetch("/api/admin/rental/categories",{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({...category,name:next.trim()})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){setError(data.error||"Kategorien kunne ikke lagres.");return;}
  await load();
 }

 async function assign(itemId,categoryId){
  setError("");
  const response=await fetch("/api/admin/rental/category",{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({itemId,categoryId})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){setError(data.error||"Kategorien kunne ikke lagres på produktet.");return;}
  setItems(current=>current.map(item=>item.id===itemId?{...item,categoryId:categoryId||null}:item));
 }

 async function remove(category){
  const count=items.filter(item=>item.categoryId===category.id).length;
  if(count){setError("Flytt de "+count+" utleieprodukt"+(count===1?"et":"ene")+" til en annen kategori før denne slettes.");return;}
  if(!window.confirm('Slette kategorien "'+category.name+'"?'))return;
  const response=await fetch("/api/admin/rental/categories",{
   method:"DELETE",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:category.id})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){setError(data.error||"Kategorien kunne ikke slettes.");return;}
  await load();
 }

 return <main className="admin rentalCategoryAdminPage">
  <section className="adminmain rentalCategoryAdminMain">
   <div className="kicker">Aadland Service / Back office</div>
   <div className="rentalCategoryAdminHeader">
    <div><Link href="/admin" className="btn alt">← Tilbake til backoffice</Link><h1>Utleiekategorier</h1><p className="muted">Lag kategorier som Hengere, Maskiner, Verktøy og Hage. De brukes automatisk i utleiekatalogen.</p></div>
   </div>

   {error&&<p className="notice">{error}</p>}

   {setupRequired&&<div className="adminProjectMigrationWarning">
    <b>Databaseoppdatering mangler</b>
    <span>Kjør SQL-filen under én gang i Supabase før du lager kategorier.</span>
    <code>supabase/rental_categories.sql</code>
   </div>}

   {!setupRequired&&<div className="rentalCategoryAdminGrid">
    <form className="card" onSubmit={create}>
     <div className="kicker">NY KATEGORI</div>
     <h3>Opprett utleiekategori</h3>
     <div className="field"><label>Navn</label><input required value={name} onChange={e=>setName(e.target.value)} placeholder="F.eks. Hengere"/></div>
     <div className="field"><label>Beskrivelse <span className="muted">(valgfritt)</span></label><textarea rows="3" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Kort beskrivelse av kategorien"/></div>
     <button className="btn" disabled={saving}>{saving?"Oppretter …":"Opprett kategori"}</button>
    </form>

    <div className="card">
     <div className="kicker">KATEGORIER</div>
     <h3>{categories.length} kategorier</h3>
     {categories.length?categories.map(category=>{
      const count=items.filter(item=>item.categoryId===category.id).length;
      return <div className="rentalCategoryAdminRow" key={category.id}>
       <div><b>{category.name}</b>{category.description&&<span>{category.description}</span>}<small>{count} {count===1?"produkt":"produkter"}</small></div>
       <div><button type="button" className="btn alt" onClick={()=>rename(category)}>Endre navn</button><button type="button" className="btn alt" onClick={()=>remove(category)}>Slett</button></div>
      </div>;
     }):<p className="muted">Ingen kategorier ennå.</p>}
    </div>
   </div>}

   {!setupRequired&&<div className="card rentalCategoryAssignments">
    <div className="kicker">FORDEL UTLEIEUTSTYR</div>
    <h3>Velg kategori på produktene</h3>
    <p className="muted">Endringen slår automatisk inn i utleiekatalogen. Produkter uten kategori vises under «Annet».</p>
    {items.length?items.map(item=><div className="rentalCategoryAssignmentRow" key={item.id}>
     <div>
      {item.imageUrls?.[0]&&<img src={item.imageUrls[0]} alt=""/>}
      <span><b>{item.name}</b><small>{item.status==="available"?"Tilgjengelig":"Ikke tilgjengelig"}</small></span>
     </div>
     <select value={item.categoryId||""} onChange={e=>assign(item.id,e.target.value)}>
      <option value="">Ingen kategori</option>
      {categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
     </select>
    </div>):<p className="muted">Ingen utleieprodukter ennå.</p>}
   </div>}
  </section>
 </main>;
}
