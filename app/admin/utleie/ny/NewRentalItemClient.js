"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";

export default function NewRentalItemClient({itemId=null}){
 const router=useRouter();
 const [categories,setCategories]=useState([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState("");
 const [originalName,setOriginalName]=useState("");
 const [itemLoaded,setItemLoaded]=useState(false);
 const [v,setV]=useState({
  name:"",
  categoryId:"",
  description:"",
  status:"available",
  quantity:1,
  dailyPriceOre:"",
  weekendPriceOre:"",
  weeklyPriceOre:"",
  longTermDays:"",
  longTermDiscountPercent:0,
  depositOre:"",
  bufferDays:0,
  pickupAvailable:true,
  deliveryAvailable:false,
  active:true,
  sortOrder:0,
  imageUrls:[]
 });
 const set=(key,value)=>setV(current=>({...current,[key]:value}));

 useEffect(()=>{
  let cancelled=false;
  Promise.all([fetch("/api/admin/rental/categories",{cache:"no-store"}),...(itemId?[fetch("/api/admin/rental",{cache:"no-store"})]:[])])
   .then(async responses=>{
    const data=await Promise.all(responses.map(async response=>{
     const json=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(json.error||"Utleiedata kunne ikke lastes.");
     return json;
    }));
    return data;
   })
   .then(([catData,itemData])=>{
    if(cancelled)return;
    setCategories(catData.categories||[]);
    if(itemId){
     const item=(itemData?.items||[]).find(x=>x.id===itemId);
     if(!item)throw new Error("Utleieproduktet finnes ikke, eller du har ikke tilgang.");
     setOriginalName(item.name);
     setItemLoaded(true);
     setV({
      name:item.name||"",categoryId:item.categoryId||"",description:item.description||"",
      status:item.status||"available",quantity:item.quantity||1,
      dailyPriceOre:item.dailyPriceOre||0,weekendPriceOre:item.weekendPriceOre??"",
      weeklyPriceOre:item.weeklyPriceOre??"",longTermDays:item.longTermDays??"",
      longTermDiscountPercent:item.longTermDiscountPercent||0,depositOre:item.depositOre||0,
      bufferDays:item.bufferDays||0,pickupAvailable:item.pickupAvailable!==false,
      deliveryAvailable:item.deliveryAvailable===true,active:item.active!==false,
      sortOrder:item.sortOrder||0,imageUrls:item.imageUrls||[]
     });
    }
   })
   .catch(err=>{if(!cancelled)setError(err.message||"Kategoriene kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[itemId]);

 async function upload(files){
  const list=Array.from(files||[]);
  if(!list.length)return;
  const invalid=list.find(file=>!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>4*1024*1024);
  if(invalid){setError(!["image/jpeg","image/png","image/webp"].includes(invalid.type)?"Bruk JPG, PNG eller WebP.":"Hvert bilde kan være maks 4 MB.");return;}
  setUploading(true);
  const urls=[];
  for(const file of list){
   const fd=new FormData();
   fd.append("file",file);
   const response=await fetch("/api/admin/upload",{method:"POST",body:fd});
   const data=await response.json().catch(()=>({}));
   if(response.ok&&data.url)urls.push(data.url);
   else setError(data.error||"Et bilde kunne ikke lastes opp.");
  }
  setV(current=>({...current,imageUrls:[...current.imageUrls,...urls]}));
  setUploading(false);
 }

 async function save(e){
  e.preventDefault();
  if(itemId&&!itemLoaded){setError("Produktet ble ikke lastet. Ingen endringer kan lagres.");return;}
  if(!v.categoryId){setError("Velg kategori før utstyret lagres.");return;}
  setSaving(true);
  setError("");
  const response=await fetch("/api/admin/rental",{
   method:itemId?"PATCH":"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({...v,...(itemId?{id:itemId}:{})})
  });
  const data=await response.json().catch(()=>({}));
  setSaving(false);
  if(!response.ok){setError(data.error||"Utstyret kunne ikke lagres.");return;}
  router.push("/admin/utleie");
  router.refresh();
 }

 return <main className="admin rentalNewItemPage">
  <section className="adminmain rentalNewItemMain">
   <div className="kicker">Aadland Service / Back office</div>
   <div className="rentalNewItemHeader">
    <Link href="/admin/utleie" className="btn alt">← Utleieoversikt</Link>
    <h1>{itemId?"Rediger utleieprodukt":"Nytt utleieprodukt"}</h1>
    <p className="muted">{itemId?("Du redigerer "+originalName+". Endringene publiseres når du lagrer."): "Alle utleieprodukter må plasseres i en kategori før de kan lagres."}</p>
   </div>

   {error&&<p className="notice">{error}</p>}

   {!loading&&itemId&&!itemLoaded?<div className="card"><h3>Utstyret kunne ikke lastes</h3><p>Redigering er sperret, slik at eksisterende opplysninger ikke kan overskrives ved feil.</p><Link className="btn alt" href="/admin/utleie">Tilbake til utleieoversikten</Link></div>:!loading&&categories.length===0?<div className="card">
    <h3>Du må lage en kategori først</h3>
    <p className="muted">Opprett for eksempel Hengere, Verktøy, Maskiner eller Hage.</p>
    <Link className="btn" href="/admin/utleiekategorier">Opprett utleiekategori</Link>
   </div>:<form className="card rentalNewItemForm" onSubmit={save}>
    <div className="field"><label>Navn *</label><input required value={v.name} onChange={e=>set("name",e.target.value)} placeholder="F.eks. Platevibrator"/></div>

    <div className="field"><label>Kategori *</label><select required value={v.categoryId} onChange={e=>set("categoryId",e.target.value)}><option value="">Velg kategori</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></div>

    <div className="field"><label>Beskrivelse</label><textarea rows="4" value={v.description} onChange={e=>set("description",e.target.value)} placeholder="Kort beskrivelse av utstyret og hva det passer til"/></div>

    <div className="field"><label>Bilder</label>
     {v.imageUrls.length>0&&<div className="rentalNewItemImages">{v.imageUrls.map((url,index)=><div key={url+index}><img src={url} alt=""/><button type="button" className="btn alt" onClick={()=>set("imageUrls",v.imageUrls.filter((_,i)=>i!==index))}>Fjern</button></div>)}</div>}
     <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{upload(e.target.files);e.target.value=""}}/>
     {uploading&&<small className="muted">Laster opp bilder …</small>}
    </div>

    <div className="rentalNewItemGrid">
     <div className="field"><label>Status</label><select value={v.status} onChange={e=>set("status",e.target.value)}><option value="available">Tilgjengelig</option><option value="unavailable">Midlertidig utilgjengelig</option><option value="maintenance">Service/vedlikehold</option><option value="hidden">Skjult</option></select></div>
     <div className="field rentalQuantityField"><label>Antall</label><input type="number" min="1" max="100000" inputMode="numeric" value={v.quantity} onChange={e=>set("quantity",e.target.value)}/><small className="muted">Hvor mange like eksemplarer som kan leies ut samtidig.</small></div>
     <div className="field"><label>Døgnpris (kr) *</label><input required type="number" min="0" step="1" value={v.dailyPriceOre===""?"":Number(v.dailyPriceOre)/100} onChange={e=>set("dailyPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="F.eks. 450"/></div>
     <div className="field"><label>Helgepris (kr)</label><input type="number" min="0" value={v.weekendPriceOre===""?"":Number(v.weekendPriceOre)/100} onChange={e=>set("weekendPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))}/></div>
     <div className="field"><label>Ukepris (kr)</label><input type="number" min="0" value={v.weeklyPriceOre===""?"":Number(v.weeklyPriceOre)/100} onChange={e=>set("weeklyPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))}/></div>
     <div className="field"><label>Depositum (kr)</label><input type="number" min="0" step="1" value={v.depositOre===""?"":Number(v.depositOre)/100} onChange={e=>set("depositOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="F.eks. 1500"/></div>
     <div className="field"><label>Buffer mellom utleier (dager)</label><input type="number" min="0" value={v.bufferDays} onChange={e=>set("bufferDays",e.target.value)}/></div>
     <div className="field"><label>Langtidsgrense (dager)</label><input type="number" min="1" value={v.longTermDays} onChange={e=>set("longTermDays",e.target.value)}/></div>
     <div className="field"><label>Langtidsrabatt (%)</label><input type="number" min="0" max="100" value={v.longTermDiscountPercent} onChange={e=>set("longTermDiscountPercent",e.target.value)}/></div>
     <div className="field"><label>Sortering</label><input type="number" value={v.sortOrder} onChange={e=>set("sortOrder",e.target.value)}/></div>
    </div>

    <div className="rentalNewItemChecks">
     <label><input type="checkbox" checked={v.pickupAvailable} onChange={e=>set("pickupAvailable",e.target.checked)}/> Henting mulig</label>
     <label><input type="checkbox" checked={v.deliveryAvailable} onChange={e=>set("deliveryAvailable",e.target.checked)}/> Levering mulig</label>
     <label><input type="checkbox" checked={v.active} onChange={e=>set("active",e.target.checked)}/> Publisert</label>
    </div>

    <div className="rentalNewItemActions">
     <button className="btn" disabled={saving||uploading||loading||(itemId&&!itemLoaded)}>{saving?"Lagrer …":itemId?"Lagre endringene":"Lagre utleieprodukt"}</button>
     <Link className="btn alt" href="/admin/utleie">Avbryt</Link>
    </div>
   </form>}
  </section>
 </main>;
}
