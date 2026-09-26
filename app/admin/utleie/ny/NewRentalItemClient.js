"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";

export default function NewRentalItemClient(){
 const router=useRouter();
 const [categories,setCategories]=useState([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState("");
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
  fetch("/api/admin/rental/categories")
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Kategoriene kunne ikke lastes.");
    return data;
   })
   .then(data=>{if(!cancelled)setCategories(data.categories||[])})
   .catch(err=>{if(!cancelled)setError(err.message||"Kategoriene kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[]);

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
  if(!v.categoryId){setError("Velg kategori før utstyret lagres.");return;}
  setSaving(true);
  setError("");
  const response=await fetch("/api/admin/rental",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(v)
  });
  const data=await response.json().catch(()=>({}));
  setSaving(false);
  if(!response.ok){setError(data.error||"Utstyret kunne ikke lagres.");return;}
  router.push("/admin");
  router.refresh();
 }

 return <main className="admin rentalNewItemPage">
  <section className="adminmain rentalNewItemMain">
   <div className="kicker">Aadland Service / Back office</div>
   <div className="rentalNewItemHeader">
    <Link href="/admin" className="btn alt">← Tilbake til backoffice</Link>
    <h1>Nytt utleieprodukt</h1>
    <p className="muted">Alle utleieprodukter må plasseres i en kategori før de kan lagres.</p>
   </div>

   {error&&<p className="notice">{error}</p>}

   {!loading&&categories.length===0?<div className="card">
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
     <div className="field"><label>Antall</label><input type="number" min="1" value={v.quantity} onChange={e=>set("quantity",e.target.value)}/></div>
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
     <button className="btn" disabled={saving||uploading||loading}>{saving?"Lagrer …":"Lagre utleieprodukt"}</button>
     <Link className="btn alt" href="/admin">Avbryt</Link>
    </div>
   </form>}
  </section>
 </main>;
}
