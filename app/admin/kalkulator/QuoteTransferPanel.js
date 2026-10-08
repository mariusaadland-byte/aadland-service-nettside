"use client";
import {useEffect,useMemo,useState} from "react";
import {quoteLinesFromCalculator,CATALOG_QUOTE_TRANSFER_KEY} from "../../../lib/calculatorQuoteLines";
import styles from "./calculator.module.css";
const norm=v=>String(v||"").trim().toLocaleLowerCase("nb-NO");
export default function QuoteTransferPanel({form}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [customers,setCustomers]=useState([]),[quotes,setQuotes]=useState([]);
 const [selection,setSelection]=useState(""),[customerSearch,setCustomerSearch]=useState("");
 const [newContact,setNewContact]=useState({name:"",email:"",phone:"",address:""});
 const [destination,setDestination]=useState("new"),[existingId,setExistingId]=useState("");
 const [includeExtras,setIncludeExtras]=useState(false),[error,setError]=useState("");
 const lines=useMemo(()=>quoteLinesFromCalculator(form,{includeExtras}),[form,includeExtras]);
 useEffect(()=>{
  if(!open)return;
  let active=true;setLoading(true);setError("");
  Promise.all([
   fetch("/api/admin/customers",{cache:"no-store"}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Kunderegisteret kunne ikke åpnes.");return d.customers||[]}),
   fetch("/api/admin/quotes",{cache:"no-store"}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Tilbudene kunne ikke hentes.");return d.quotes||[]})
  ]).then(([c,q])=>{if(active){const used=new Set();setCustomers(c.filter(row=>{const key=norm(row.email)||norm(row.name)+"|"+norm(row.phone);if(!key||used.has(key))return false;used.add(key);return true}).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"nb-NO")));setQuotes(q.filter(row=>row.status==="draft"));}}).catch(e=>{if(active)setError(e.message||"Kunder og tilbud kunne ikke lastes.")}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[open]);
 const customer=selection==="new"?newContact:customers.find(row=>String(row.id||"")===selection)||null;
 const candidateQuotes=quotes.filter(q=>{
  if(!customer?.name)return false;
  const email=norm(customer.email),quoteEmail=norm(q.customer?.email);
  return email&&quoteEmail?email===quoteEmail:norm(q.customer?.name)===norm(customer.name);
 });
 async function transfer(){
  setError("");
  if(!lines.length){setError("Legg inn minst én vare med navn og antall, eller ta med arbeid og øvrige kostnader.");return}
  if(!customer?.name?.trim()){setError("Velg en kunde eller opprett en ny.");return}
  if(destination==="existing"&&(!existingId||!candidateQuotes.some(q=>q.id===existingId))){setError("Velg et eksisterende tilbud som fortsatt er kladd.");return}
  if(lines.length>110){setError("For mange linjer. Del opp kalkylen i flere tilbud.");return}
  setBusy(true);
  try{
   let selected={name:customer.name||"",email:customer.email||"",phone:customer.phone||"",address:customer.address||""};
   if(selection==="new"){
    const response=await fetch("/api/admin/customer-contacts",{
     method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(selected)
    });
    const d=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(d.error||"Kunden kunne ikke opprettes.");
    selected={name:d.contact.name,email:d.contact.email||"",phone:d.contact.phone||"",address:d.contact.address||""};
   }
   if(destination==="existing"){
    sessionStorage.setItem(CATALOG_QUOTE_TRANSFER_KEY,JSON.stringify({quoteId:existingId,customer:selected,lineItems:lines,createdAt:Date.now()}));
    window.location.assign("/admin/tilbud/"+encodeURIComponent(existingId));
   }else{
    sessionStorage.setItem("aadlandQuoteDraftFromDrawing",JSON.stringify({
     title:String(form.project||"Tilbud på materialer og arbeid").slice(0,180),
     customer:selected,lineItems:lines
    }));
    window.location.assign("/admin/tilbud/ny");
   }
  }catch(e){setError(e.message||"Overføringen feilet.");setBusy(false)}
 }
 return <section className={styles.quoteTransfer}>
  <button type="button" className={styles.quoteTransferToggle} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <span><strong>Overfør varene til tilbud</strong><small>Velg kunde og legg inn alle varelinjene – ingen dobbeltregistrering.</small></span><b>{open?"Lukk −":"Opprett / legg til →"}</b>
  </button>
  {open&&<div className={styles.quoteTransferBody}>
   {loading?<p className={styles.catalogEmpty}>Henter kunder og tilbud …</p>:<>
    <div className={styles.transferGrid}>
     <label className={styles.transferField}><span>Kunde *</span><input type="search" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Søk etter kunde …" aria-label="Filtrer kunder"/></label>
     <label className={styles.transferField}><span>Velg kunde</span><select value={selection} onChange={e=>{setSelection(e.target.value);setExistingId("");setDestination("new")}}>
      <option value="">Velg fra kunderegisteret …</option>
      <option value="new">＋ Opprett ny kunde</option>
      {customers.filter(c=>!customerSearch||[c.name,c.email,c.phone].some(v=>norm(v).includes(norm(customerSearch)))).map((c,i)=><option key={c.id||"c-"+i} value={String(c.id||"")}>{c.name}{c.email?" · "+c.email:""}</option>)}
     </select></label>
    </div>
    {selection==="new"&&<div className={styles.transferGrid}>
     <label className={styles.transferField}><span>Kundenavn *</span><input value={newContact.name} onChange={e=>setNewContact(p=>({...p,name:e.target.value}))} placeholder="Navn"/></label>
     <label className={styles.transferField}><span>E-post</span><input type="email" value={newContact.email} onChange={e=>setNewContact(p=>({...p,email:e.target.value}))} placeholder="kunde@eksempel.no"/></label>
     <label className={styles.transferField}><span>Telefon</span><input type="tel" value={newContact.phone} onChange={e=>setNewContact(p=>({...p,phone:e.target.value}))}/></label>
     <label className={styles.transferField}><span>Adresse</span><input value={newContact.address} onChange={e=>setNewContact(p=>({...p,address:e.target.value}))}/></label>
    </div>}
    {customer?.name&&<div className={styles.transferCustomerNotice}>Valgt kunde: <strong>{customer.name}</strong>{customer.email?" · "+customer.email:""}</div>}
    <label className={styles.transferCheck}><input type="checkbox" checked={includeExtras} onChange={e=>setIncludeExtras(e.target.checked)}/><span>Ta også med arbeid, andre kostnader, kjøring og bom som er fylt ut</span></label>
    <div className={styles.transferGrid}>
     <label className={styles.transferField}><span>Hvor skal varene legges?</span><select value={destination} onChange={e=>{setDestination(e.target.value);setExistingId("")}}>
      <option value="new">Nytt tilbud</option>
      {selection!=="new"&&candidateQuotes.length>0&&<option value="existing">Eksisterende tilbudskladd</option>}
     </select></label>
     {destination==="existing"&&<label className={styles.transferField}><span>Velg tilbudskladd</span><select value={existingId} onChange={e=>setExistingId(e.target.value)}>
      <option value="">Velg tilbud …</option>{candidateQuotes.map(q=><option key={q.id} value={q.id}>{q.quoteNumber||"Kladd"} – {q.title}</option>)}
     </select></label>}
    </div>
    <div className={styles.transferSummary}><span>{lines.length} prislinjer klare · priser eks. mva. og 25 % mva. i tilbud</span><small>Tilbudet åpnes som kladd. Du kontrollerer og lagrer det selv – ingenting sendes til kunden automatisk.</small></div>
    {error&&<p role="alert" className={styles.catalogError}>{error}</p>}
    <button type="button" className={styles.quoteTransferSubmit} disabled={busy||!lines.length} onClick={transfer}>{busy?"Overfører …":destination==="existing"?"Legg til i valgt tilbudskladd":"Åpne nytt tilbud med varene →"}</button>
   </>}
  </div>}
 </section>;
}
