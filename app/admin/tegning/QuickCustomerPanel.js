"use client";
import {useEffect,useState} from "react";
import styles from "./quickCustomer.module.css";
export default function QuickCustomerPanel({onClose,onChoose}){
 const [contacts,setContacts]=useState([]);
 const [customer,setCustomer]=useState({name:"",email:"",phone:"",address:""});
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [search,setSearch]=useState("");
 useEffect(()=>{
  let active=true;
  fetch("/api/admin/customer-contacts",{cache:"no-store"}).then(async r=>{
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke hente kunder");
   return data.contacts||[];
  }).then(list=>{if(active)setContacts(list)}).catch(e=>{if(active)setError(e.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 function pick(contact){onChoose(contact);onClose()}
 async function save(event){
  event.preventDefault();
  if(saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/admin/customer-contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(customer)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Kunne ikke opprette kunde");
   pick(data.contact);
  }catch(e){setError(e.message||"Kunne ikke opprette kunde")}
  finally{setSaving(false)}
 }
 return <div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose()}}>
  <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Legg til eller velg kunde">
   <header><div><span>TEGNING · KUNDE</span><h2>Velg eller opprett kunde</h2><p>Du trenger ikke opprette en Min side-konto først.</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Lukk">×</button></header>
   {error&&<p className={styles.error} role="alert">{error}</p>}
   <div className={styles.body}>
    <div className={styles.existing}>
     <h3>Eksisterende kundekontakter</h3>
     <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søk etter navn eller e-post" aria-label="Søk blant kunder"/>
     {loading?<p>Laster kunder …</p>:<div className={styles.results}>{contacts.filter(c=>[c.name,c.email,c.phone].join(" ").toLocaleLowerCase("nb-NO").includes(search.toLocaleLowerCase("nb-NO"))).slice(0,30).map(c=><button type="button" key={c.id} onClick={()=>pick(c)}><b>{c.name}</b><small>{[c.email,c.phone,c.address].filter(Boolean).join(" · ")}</small></button>)}{contacts.length===0&&<p>Ingen kontakter opprettet ennå.</p>}</div>}
    </div>
    <form className={styles.create} onSubmit={save}>
     <h3>＋ Ny kunde</h3>
     <label>Navn *<input required maxLength={180} autoComplete="name" value={customer.name} onChange={e=>setCustomer(c=>({...c,name:e.target.value}))}/></label>
     <label>E-post<input type="email" maxLength={240} autoComplete="email" value={customer.email} onChange={e=>setCustomer(c=>({...c,email:e.target.value}))}/></label>
     <label>Telefon<input type="tel" maxLength={70} autoComplete="tel" value={customer.phone} onChange={e=>setCustomer(c=>({...c,phone:e.target.value}))}/></label>
     <label>Adresse<input maxLength={500} autoComplete="street-address" value={customer.address} onChange={e=>setCustomer(c=>({...c,address:e.target.value}))}/></label>
     <p>Opprettes som intern kundekontakt. Kunden får ingen automatisk e-post eller innlogging.</p>
     <button type="submit" disabled={saving}>{saving?"Lagrer …":"Opprett og bruk kunde"}</button>
    </form>
   </div>
  </section>
 </div>;
}
