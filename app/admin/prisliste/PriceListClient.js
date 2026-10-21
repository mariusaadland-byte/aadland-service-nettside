"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import styles from "./prisliste.module.css";
const empty=()=>({sku:"EGEN-"+crypto.randomUUID().slice(0,12),originalSku:"",name:"",supplierName:"",unit:"stk",costExVat:"",saleExVat:"",markup:"20",ean:""});
const number=v=>Number(String(v??"").replace(/\s/g,"").replace(",","."));
const money=v=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(v);
export default function PriceListClient(){
 const [form,setForm]=useState(null),[products,setProducts]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[search,setSearch]=useState(""),[hasMore,setHasMore]=useState(false);
 async function load(offset=0){
  setLoading(true);try{const r=await fetch("/api/admin/material-catalog/manual?offset="+offset,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setProducts(rows=>offset?[...rows,...d.products]:d.products);setHasMore(d.hasMore);return true;}catch(e){setError(e.message||"Kunne ikke hente prislisten.");return false;}finally{setLoading(false)}
 }
 useEffect(()=>{setForm(empty());load()},[]);
 function change(key,value){setForm(f=>{
  const next={...f,[key]:value};
  if(key==="costExVat"||key==="markup"){
   const cost=number(next.costExVat),rate=number(next.markup);
   next.saleExVat=String(next.costExVat).trim()!==""&&Number.isFinite(cost)&&cost>=0&&Number.isFinite(rate)&&rate>=0?(Math.round(cost*(1+rate/100)*100)/100).toFixed(2):"";
  }
  return next;
 })}
 function edit(p){setForm({originalSku:p.supplier_sku,sku:p.supplier_sku,name:p.name,unit:p.unit,supplierName:p.category_name||"",costExVat:(p.cost_ex_vat_ore/100).toFixed(2),saleExVat:(p.sale_ex_vat_ore/100).toFixed(2),markup:p.cost_ex_vat_ore>0?String(Math.round((p.sale_ex_vat_ore/p.cost_ex_vat_ore-1)*10000)/100):"0",ean:p.ean||""});setMessage("");setError("");window.scrollTo({top:0,behavior:"smooth"})}
 async function save(e){
  e.preventDefault();if(busy)return;setBusy(true);setError("");setMessage("");
  try{const r=await fetch("/api/admin/material-catalog/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage("Varen er lagret og kan søkes opp i kalkulatoren og tilbudet.");setForm(empty());await load();}catch(e){setError(e.message||"Lagring feilet.")}finally{setBusy(false)}
 }
 const matches=products.filter(p=>[p.name,p.supplier_sku,p.category_name,p.ean].join(" ").toLocaleLowerCase("nb-NO").includes(search.toLocaleLowerCase("nb-NO")));
 return <main className={styles.page}><div className={styles.shell}>
  <nav className={styles.nav}><Link href="/admin">← Tilbake til administrasjon</Link><Link href="/admin/kalkulator">Kalkulator</Link><Link href="/admin/tilbud">Tilbud</Link></nav>
  <h1>Egen prisliste</h1><p>Bygg opp varer fra Ahlsell, Megaflis eller andre leverandører. Alle prisfeltene under er eks. MVA. Innkjøpsprisen brukes bare internt.</p>
  {error&&<p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}{message&&<p role="status" className={styles.notice}>{message}</p>}
  <div className={styles.grid}><section className={styles.card}><h2>{form?.originalSku?"Rediger vare":"Ny vare"}</h2>{form&&<form onSubmit={save} className={styles.form}>
   <label>Varenavn<input required maxLength={300} value={form.name} onChange={e=>change("name",e.target.value)}/></label>
   <label>Leverandør (valgfritt)<input maxLength={240} placeholder="F.eks. Ahlsell" value={form.supplierName} onChange={e=>change("supplierName",e.target.value)}/></label>
   <label>Varenummer<input required maxLength={120} readOnly={Boolean(form.originalSku)} value={form.sku} onChange={e=>change("sku",e.target.value)}/></label>
   <label>Enhet<input required maxLength={30} placeholder="stk, pakke, meter, m²" value={form.unit} onChange={e=>change("unit",e.target.value)}/><small>Oppgi pris for én av denne enheten, for eksempel én hel pakke.</small></label>
   <label>Innkjøpspris eks. MVA<input required inputMode="decimal" value={form.costExVat} onChange={e=>change("costExVat",e.target.value)}/></label>
   <label>Påslag (%)<input inputMode="decimal" value={form.markup} onChange={e=>change("markup",e.target.value)}/><small>Endrer du kostpris eller påslag, beregnes salgsprisen på nytt.</small></label>
   <label>Salgspris eks. MVA<input required inputMode="decimal" value={form.saleExVat} onChange={e=>change("saleExVat",e.target.value)}/><small>Du kan overstyre salgsprisen direkte.</small></label>
   {form.saleExVat!==""&&Number.isFinite(number(form.saleExVat))&&<p>Salgspris inkl. 25 % MVA: <strong>{money(Math.round(number(form.saleExVat)*100)*1.25/100)}</strong></p>}
   <label>EAN / strekkode (valgfritt)<input maxLength={120} value={form.ean} onChange={e=>change("ean",e.target.value)}/></label>
   <div className={styles.actions}><button disabled={busy} type="submit">{busy?"Lagrer …":"Lagre vare"}</button>{form.originalSku&&<button type="button" disabled={busy} onClick={()=>setForm(empty())}>Ny vare</button>}</div>
  </form>}</section>
  <section className={styles.card}><h2>Lagrede varer</h2><p className={styles.muted}>Velg «Egne varer» i leverandørfeltet i varesøket. Lagrede salgspriser følger varen til nye tilbud. Gamle tilbud endres ikke.</p>
   <input aria-label="Søk i innlastede egne varer" className={styles.search} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søk navn, varenummer eller leverandør"/>
   {loading&&<p role="status">Henter varer …</p>}{!loading&&!matches.length&&<p>{products.length?"Ingen treff blant de innlastede varene.":"Ingen egne varer ennå. Legg inn den første varen."}</p>}
   <div className={styles.list}>{matches.map(p=><article key={p.supplier_sku} className={styles.item}><strong>{p.name}</strong><small>{p.category_name||"Egen vare"} · {p.supplier_sku} · {p.unit}</small><p>Innkjøp: {money(p.cost_ex_vat_ore/100)} · Salg: {money(p.sale_ex_vat_ore/100)} eks. MVA</p><button disabled={busy} onClick={()=>edit(p)}>Rediger</button></article>)}</div>
   {hasMore&&<button disabled={loading} onClick={()=>load(products.length)}>Last flere varer</button>}
  </section></div>
 </div></main>;
}
