"use client";
import {useEffect,useState} from "react";
import styles from "./quoteCatalog.module.css";
const fmt=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(n)||0);
export default function QuoteCatalogSearch({onChoose}){
 const [query,setQuery]=useState(""),[supplier,setSupplier]=useState("byggern"),[suppliers,setSuppliers]=useState([]);
 const [markup,setMarkup]=useState("20"),[results,setResults]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{
  let active=true;
  fetch("/api/admin/material-catalog",{cache:"no-store"}).then(async r=>{
   const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||"Kunne ikke hente leverandører.");return data.suppliers||[];
  }).then(rows=>{if(active){setSuppliers(rows);setSupplier(rows.find(s=>s.isPrimary)?.id||rows[0]?.id||"")}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};
 },[]);
 useEffect(()=>{
  const q=query.trim();
  if(q.length<2){setResults([]);setBusy(false);return}
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setBusy(true);setError("");
   try{
    const p=new URLSearchParams({q,limit:"20"});if(supplier)p.set("supplier",supplier);
    const response=await fetch("/api/admin/material-catalog?"+p.toString(),{cache:"no-store",signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Varesøket feilet.");
    if(!controller.signal.aborted)setResults(data.products||[]);
   }catch(e){if(!controller.signal.aborted){setError(e.message||"Kunne ikke søke.");setResults([])}}
   finally{if(!controller.signal.aborted)setBusy(false)}
  },230);
  return()=>{clearTimeout(timer);controller.abort()};
 },[query,supplier]);
 const add=product=>{
  const rate=Number(String(markup).replace(",",".")),safeRate=Number.isFinite(rate)?Math.min(1000,Math.max(0,rate)):20;
  const ok=onChoose(product,safeRate);
  if(ok===false)return;
  setQuery("");setResults([]);
  setMessage(product.name+" er lagt til. Endre antall i linjen nedenfor.");
  document.getElementById("offer-catalog-search")?.focus();
 };
 return <div className={styles.box}>
  <label className={styles.search}><span>Søk varer direkte fra Bygger’n og andre leverandører</span><input id="offer-catalog-search" type="search" value={query} autoComplete="off" onChange={e=>{setQuery(e.target.value);setMessage("")}} placeholder="Skriv navn, varenummer eller EAN …"/></label>
  <div className={styles.options}>
   <label>Leverandør<select value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Alle</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Materialpåslag (%)<input inputMode="decimal" value={markup} onChange={e=>setMarkup(e.target.value)} aria-label="Påslag for varer du legger til"/></label>
  </div>
  {message&&<p className={styles.notice} role="status">{message}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {query.trim().length>=2&&<div className={styles.results}>
   {busy&&<p>Søker …</p>}
   {!busy&&!error&&!results.length&&<p>Ingen treff på søket.</p>}
   {!busy&&results.map(p=><button type="button" key={p.supplierId+"-"+p.sku} onClick={()=>add(p)}>
    <span><strong>{p.name}</strong><small>{p.supplierName} · varenr. {p.sku}</small></span>
    <span><b>{fmt(p.costExVat)}</b><small>innkjøp eks. mva / {p.unit}</small></span><em>+ Legg til</em>
   </button>)}
  </div>}
  <small className={styles.note}>Varen legges til som en vanlig prislinje med 25 % mva. Du kan endre antall, enhet og salgspris før tilbudet lagres.</small>
 </div>;
}
