"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";

const norm=x=>String(x||"").trim().toLocaleLowerCase("nb-NO");
export default function InvoiceCustomerPicker({customer={},onChoose,onCreate,disabled=false,busy=false,invoiceId}){
 const [contacts,setContacts]=useState([]),[search,setSearch]=useState(""),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[choosing,setChoosing]=useState("");
 useEffect(()=>{
  let live=true;
  fetch("/api/admin/customer-contacts",{cache:"no-store"}).then(async r=>{
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Kunderegisteret kunne ikke åpnes.");return d.contacts||[];
  }).then(rows=>{if(live)setContacts(rows)}).catch(e=>{if(live)setError(e.message||"Kunne ikke hente kunder.");})
   .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[invoiceId]);
 const chosen=useMemo(()=>contacts.find(c=>c.id===customer.contactId),[contacts,customer.contactId]);
 const matches=useMemo(()=>{
  const q=norm(search);return (q?contacts.filter(c=>[c.name,c.email,c.phone,c.address,c.organizationNumber,c.contactPerson].some(x=>norm(x).includes(q))):contacts).slice(0,q?30:10);
 },[contacts,search]);
 async function choose(item){
  if(disabled||busy||choosing)return;
  setError("");setChoosing(item.id);
  try{await onChoose(item);setSearch("");}
  catch(e){setError(e.message||"Kunden kunne ikke velges.");}
  finally{setChoosing("");}
 }
 const locked=disabled||busy||Boolean(choosing);
 return <section aria-label="Velg fakturakunde" className="card" style={{padding:18,margin:"16px 0",border:"1px solid #c99a49"}}>
  <div className="kicker">KUNDEREGISTER</div>
  <h3 style={{margin:"6px 0"}}>Velg kunde til fakturaen</h3>
  <p className="muted" style={{fontSize:13}}>Søk i eksisterende kunder eller opprett et eget kundekort. Navn, adresse, telefon, e-post og betalingsfrist hentes automatisk.</p>
  {customer.contactId&&<div style={{background:"#f2eee6",padding:14,borderRadius:9,margin:"12px 0"}}>
   <strong>Valgt kunde: {chosen?.name||customer.name||"Kunde"}</strong>
   <p style={{margin:"5px 0",fontSize:13,whiteSpace:"pre-wrap"}}>{[customer.address,customer.email,customer.phone].filter(Boolean).join(" · ")}</p>
   <small>Standard betalingsfrist: {customer.paymentTermsDays??chosen?.paymentTermsDays??14} dager</small>
   <p style={{margin:"9px 0 0"}}><Link href={"/admin/kunder/"+encodeURIComponent(customer.contactId)+"?invoiceId="+encodeURIComponent(invoiceId)}>Åpne og rediger kundekortet →</Link></p>
  </div>}
  {!customer.contactId&&customer.name&&<p style={{background:"#fff7eb",padding:10,borderRadius:8}}>Denne kladden har kunden «{customer.name}» som fritekst. Velg et kundekort nedenfor for å koble kunden til registeret.</p>}
  <label style={{display:"grid",gap:5}}>Søk etter kunde
   <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Navn, telefon, e-post eller adresse" disabled={locked||loading} autoComplete="off"/>
  </label>
  {loading?<p role="status">Laster kunderegisteret …</p>:<div style={{margin:"12px 0",display:"grid",gap:8,maxHeight:260,overflowY:"auto"}}>
   {matches.map(item=><button key={item.id} type="button" disabled={locked} onClick={()=>choose(item)} aria-pressed={customer.contactId===item.id}
    style={{padding:12,textAlign:"left",whiteSpace:"normal",borderRadius:8,border:customer.contactId===item.id?"2px solid #b58b47":"1px solid #ddd1bd",background:customer.contactId===item.id?"#fff5e4":"#fff"}}>
    <strong>{item.name}</strong>{item.customerType==="business"?" · Bedrift":""}{customer.contactId===item.id?" ✓":""}
    <small style={{display:"block",marginTop:4}}>{[item.organizationNumber?"Org.nr. "+item.organizationNumber:null,item.email,item.phone,item.address].filter(Boolean).join(" · ")||"Ingen ekstra opplysninger"} · {item.paymentTermsDays??14} dager</small>
   </button>)}
   {!matches.length&&<p className="muted">Ingen kunder funnet. Opprett et nytt kundekort nedenfor.</p>}
  </div>}
  <button type="button" disabled={locked} onClick={onCreate} style={{marginTop:7}}>＋ Ny kunde – åpne kunderegistrering</button>
  {choosing&&<p role="status">Lagrer valgt kunde på fakturaen …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error} <button type="button" onClick={()=>{setLoading(true);setError("");fetch("/api/admin/customer-contacts",{cache:"no-store"}).then(r=>r.json().then(d=>{if(!r.ok)throw Error(d.error);setContacts(d.contacts||[]);})).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Prøv på nytt</button></p>}
 </section>;
}
