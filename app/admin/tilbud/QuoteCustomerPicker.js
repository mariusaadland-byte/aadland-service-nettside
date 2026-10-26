"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import CompanyRegistrySearch from "../kunder/CompanyRegistrySearch";

const blank={name:"",email:"",phone:"",address:"",paymentTermsDays:14,customerType:"private",organizationNumber:""};
const normalize=value=>String(value||"").trim().toLocaleLowerCase("nb-NO");
const customerSnapshot=contact=>({
 contactId:contact.id,name:contact.name||"",email:contact.email||"",phone:contact.phone||"",
 address:contact.address||"",paymentTermsDays:Number(contact.paymentTermsDays??14)
});
const field={display:"grid",gap:4,fontSize:13};
export default function QuoteCustomerPicker({customer,onChoose,disabled=false}){
 const [contacts,setContacts]=useState([]);
 const [search,setSearch]=useState("");
 const [creating,setCreating]=useState(false);
 const [newCustomer,setNewCustomer]=useState(blank);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  fetch("/api/admin/customer-contacts",{cache:"no-store"}).then(async r=>{
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data.error||"Kunne ikke hente kunderegisteret.");
   return data.contacts||[];
  }).then(list=>{if(live)setContacts(list)}).catch(e=>{if(live)setError(e.message)})
  .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[]);
 const selected=useMemo(()=>contacts.find(item=>item.id===customer.contactId)||null,[contacts,customer.contactId]);
 const matches=useMemo(()=>normalize(search)?contacts.filter(item=>[item.name,item.email,item.phone,item.address].some(value=>normalize(value).includes(normalize(search)))).slice(0,30):[],[contacts,search]);
 // Older quotes may only contain a customer snapshot, so allow one-click
 // association with the central customer card without changing it automatically.
 const possibleMatch=!customer.contactId&&customer.name?contacts.find(item=>{
  if(customer.email&&item.email)return normalize(customer.email)===normalize(item.email);
  return normalize(item.name)===normalize(customer.name)&&Boolean(normalize(item.name));
 }):null;
 async function refreshSelected(){
  if(!customer.contactId||refreshing)return;
  setRefreshing(true);setError("");
  try{
   const response=await fetch("/api/admin/customer-contacts",{cache:"no-store"});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"Kunderegisteret kunne ikke oppdateres.");
   const updated=(result.contacts||[]).find(item=>item.id===customer.contactId);
   if(!updated)throw Error("Kunden finnes ikke lenger i kunderegisteret.");
   setContacts(result.contacts);onChoose(customerSnapshot(updated));
  }catch(e){setError(e.message||"Kunden kunne ikke oppdateres.");}
  finally{setRefreshing(false);}
 }
 async function create(event){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/admin/customer-contacts",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(newCustomer)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"Kunden kunne ikke opprettes.");
   setContacts(current=>[result.contact,...current.filter(item=>item.id!==result.contact.id)]);
   onChoose(customerSnapshot(result.contact));
   setSearch("");setCreating(false);setNewCustomer(blank);
   if(result.existing)setError("E-postadressen finnes allerede. Eksisterende kundekort er valgt.");
  }catch(e){setError(e.message||"Kunden kunne ikke opprettes.");}
  finally{setBusy(false);}
 }
 return <section className="card quoteEditorSection" aria-label="Kunderegister">
  <div className="kicker">KUNDE</div><h3>Velg kunde fra kunderegisteret</h3>
  <p className="muted">Kundeinformasjon og betalingsfrist hentes fra kundekortet. Du trenger ikke skrive inn alt på nytt i hvert tilbud.</p>
  {selected||customer.contactId?<div style={{padding:12,border:"1px solid #d7c8ad",borderRadius:9,marginBottom:12}}>
   <strong>{customer.name||"Valgt kunde"}</strong>
   <p style={{margin:"5px 0"}}>{[customer.email,customer.phone,customer.address].filter(Boolean).join(" · ")||"Ingen kontaktopplysninger lagt inn"}</p>
   <small>Betalingsfrist: {customer.paymentTermsDays??selected?.paymentTermsDays??14} dager</small>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:8}}>
    {customer.contactId&&<Link href={"/admin/kunder/"+encodeURIComponent(customer.contactId)} target="_blank" rel="noopener noreferrer">Åpne / rediger kundekort ↗</Link>}
    {customer.contactId&&!disabled&&<button type="button" className="btn alt" disabled={refreshing} onClick={refreshSelected}>{refreshing?"Oppdaterer …":"Hent siste endringer"}</button>}
    {!disabled&&<button type="button" className="btn alt" onClick={()=>{onChoose({contactId:"",name:"",email:"",phone:"",address:"",paymentTermsDays:14});setSearch("");}}>Bytt kunde</button>}
   </div>
  </div>:customer.name&&<div style={{padding:12,background:"#fff7eb",borderRadius:8,marginBottom:10}}>
   <strong>{customer.name}</strong> er hentet fra et eldre tilbud / en overføring, men er ikke knyttet til et kundekort.
   {possibleMatch&&!disabled&&<button type="button" className="btn alt" style={{marginLeft:10}} onClick={()=>onChoose(customerSnapshot(possibleMatch))}>Bruk eksisterende kundekort: {possibleMatch.name}</button>}
  </div>}
  {!disabled&&<><label style={field}>Søk etter eksisterende kunde
   <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Navn, e-post, telefon eller adresse" aria-label="Søk etter kunde"/>
  </label>
  {loading?<p>Laster kunder …</p>:normalize(search)?<div style={{maxHeight:210,overflowY:"auto",margin:"10px 0",display:"grid",gap:6}}>
   {matches.map(item=><button type="button" className="btn alt" key={item.id} onClick={()=>{onChoose(customerSnapshot(item));setSearch("");setCreating(false);}} style={{textAlign:"left",whiteSpace:"normal"}}>
    <strong>{item.name}</strong><small style={{display:"block"}}>{[item.email,item.phone,item.address].filter(Boolean).join(" · ")} · {item.paymentTermsDays??14} dager</small>
   </button>)}
   {matches.length===0&&<p className="muted">Ingen treff. Opprett en ny kunde nedenfor.</p>}
  </div>:<p className="muted" style={{fontSize:13,margin:"8px 0"}}>Skriv et navn, telefonnummer eller e-post for å finne kunden.</p>}
  <button type="button" className="btn alt" onClick={()=>setCreating(value=>!value)} aria-expanded={creating}>{creating?"Lukk ny kunde":"＋ Opprett ny kunde"}</button>
  {creating&&<form onSubmit={create} style={{padding:"16px 0",display:"grid",gap:12}}>
   <h4>Opprett kundekort</h4>
   <label style={field}>Kundetype
    <select value={newCustomer.customerType} onChange={e=>setNewCustomer(c=>({...c,customerType:e.target.value,
     organizationNumber:e.target.value==="business"?c.organizationNumber:""}))}>
     <option value="private">Privatkunde</option><option value="business">Bedrift</option>
    </select>
   </label>
   {newCustomer.customerType==="business"&&<>
    <CompanyRegistrySearch disabled={busy} onSelect={company=>
     setNewCustomer(c=>({...c,customerType:"business",name:company.name,
      organizationNumber:company.organizationNumber,address:company.address||c.address}))}/>
    <label style={field}>Organisasjonsnummer
     <input value={newCustomer.organizationNumber} inputMode="numeric" maxLength={9}
      onChange={e=>setNewCustomer(c=>({...c,organizationNumber:e.target.value}))}/>
    </label>
   </>}
   <label style={field}>Navn *<input required maxLength={180} value={newCustomer.name} onChange={e=>setNewCustomer(current=>({...current,name:e.target.value}))}/></label>
   <label style={field}>E-postadresse<input type="email" maxLength={240} value={newCustomer.email} onChange={e=>setNewCustomer(current=>({...current,email:e.target.value}))}/></label>
   <label style={field}>Telefon<input type="tel" maxLength={70} value={newCustomer.phone} onChange={e=>setNewCustomer(current=>({...current,phone:e.target.value}))}/></label>
   <label style={field}>Adresse og poststed<textarea rows={2} maxLength={500} value={newCustomer.address} onChange={e=>setNewCustomer(current=>({...current,address:e.target.value}))}/></label>
   <label style={field}>Betalingsfrist på faktura (dager)<input type="number" required min={0} max={365} step={1} value={newCustomer.paymentTermsDays} onChange={e=>setNewCustomer(current=>({...current,paymentTermsDays:e.target.value}))}/></label>
   <small>Dette oppretter et internt kundekort med en gang. En konto med innlogging på Min side blir ikke opprettet automatisk.</small>
   <button className="btn" type="submit" disabled={busy}>{busy?"Oppretter …":"Opprett og bruk kunden"}</button>
  </form>}
  </>}
  {error&&<p role="alert" style={{color:"#a12323"}}>{error}</p>}
 </section>;
}
