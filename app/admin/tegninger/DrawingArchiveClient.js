"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./archive.module.css";

const safeText=(value,fallback="")=>{
 if(value==null)return fallback;
 if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value);
 try{return JSON.stringify(value)}catch{return fallback}
};
const canon=value=>safeText(value).trim().toLocaleLowerCase("nb-NO");
const when=value=>{if(!value)return "";const date=new Date(value);return Number.isNaN(date.getTime())?"Ukjent dato":date.toLocaleString("nb-NO",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})};
const groupLabel=row=>safeText(row.customer,"Uten kunde")||"Uten kunde";
const normalizeArchiveRow=row=>({...row,name:safeText(row.name,"Uten navn"),customer:safeText(row.customer),address:safeText(row.address),notes:safeText(row.notes)});
const normalizeContact=row=>({...row,name:safeText(row.name),email:safeText(row.email),phone:safeText(row.phone),address:safeText(row.address)});
export default function DrawingArchiveClient(){
 const [drawings,setDrawings]=useState([]);
 const [contacts,setContacts]=useState([]);
 const [publishedIds,setPublishedIds]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [query,setQuery]=useState("");
 const [scope,setScope]=useState("all");
 const [emailFilter,setEmailFilter]=useState("");
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const email=params.get("email")||"";
  const customer=params.get("customer")||"";
  setEmailFilter(canon(email));
  setQuery(customer);
  let live=true;
  Promise.all([
   fetch("/api/admin/project-drawings?summary=1",{cache:"no-store"}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Kunne ikke hente tegninger");return d}),
   fetch("/api/admin/customer-contacts",{cache:"no-store"}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Kunne ikke hente kunder");return d.contacts||[]})
  ]).then(([data,list])=>{
   if(!live)return;
   setDrawings((Array.isArray(data.drawings)?data.drawings:[]).filter(row=>row&&typeof row==="object"&&row.id).map(normalizeArchiveRow));
   setPublishedIds(Array.isArray(data.publishedIds)?data.publishedIds:[]);
   setContacts((Array.isArray(list)?list:[]).filter(row=>row&&typeof row==="object").map(normalizeContact));
  }).catch(e=>{if(live)setError(e.message||"Arkivet kunne ikke lastes.")})
   .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[]);
 const byId=useMemo(()=>new Map(contacts.map(c=>[c.id,c])),[contacts]);
 const published=useMemo(()=>new Set(publishedIds),[publishedIds]);
 const matches=useMemo(()=>{
  const search=canon(query);
  return drawings.filter(row=>{
   const contact=byId.get(row.customerContactId);
   const shared=published.has(row.id)||row.customerVisible;
   if(scope==="shared"&&!shared)return false;
   if(scope==="internal"&&shared)return false;
   if(emailFilter&&canon(contact?.email)!==emailFilter)return false;
   if(!search)return true;
   return [row.name,row.customer,row.address,contact?.name,contact?.email,row.notes].some(v=>canon(v).includes(search));
  });
 },[drawings,byId,query,emailFilter,scope,published]);
 const groups=useMemo(()=>{
  const results=new Map();
  for(const row of matches){
   const key=row.customerContactId||"legacy-"+canon(groupLabel(row));
   if(!results.has(key))results.set(key,{name:byId.get(row.customerContactId)?.name||groupLabel(row),email:byId.get(row.customerContactId)?.email||"",rows:[]});
   results.get(key).rows.push(row);
  }
  return [...results.values()].sort((a,b)=>canon(a.name).localeCompare(canon(b.name),"nb-NO"));
 },[matches,byId]);
 function offerFromDrawing(row){
  const contact=byId.get(row.customerContactId);
  const customer={
   name:contact?.name||row.customer||"",
   email:contact?.email||"",
   phone:contact?.phone||"",
   address:contact?.address||row.address||""
  };
  sessionStorage.setItem("aadlandQuoteDraftFromDrawing",JSON.stringify({
   title:"Tilbud – "+(row.name||"Tegning"),
   customer,
   drawingIds:[row.id]
  }));
  window.location.href="/admin/tilbud/ny";
 }
 return <main className={styles.page}>
  <header className={styles.header}>
   <div className={styles.brand}><Link href="/admin">← Tilbake til admin</Link><span>TEGNINGER OG KUNDER</span></div>
   <div className={styles.heading}><div><h1>Tegningsarkiv</h1><p>Alle tegninger som er lagret på serveren, også uten prosjekt eller oppdrag. Finn dem igjen når du skal lage tilbud.</p></div><Link className={styles.newButton} href="/admin/tegning">＋ Ny tegning</Link></div>
  </header>
  <section className={styles.stats} aria-label="Arkivstatus">
   <div><span>Lagret i admin</span><strong>{drawings.length}</strong></div>
   <div><span>Valgte tegninger</span><strong>{matches.length}</strong></div>
   <div><span>Delt via tilbud / Min side</span><strong>{drawings.filter(row=>published.has(row.id)||row.customerVisible).length}</strong></div>
  </section>
  <section className={styles.toolbar} aria-label="Finn tegning">
   <label>Søk i arkivet<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Navn, kunde, adresse eller tegning" /></label>
   <label>Vis<select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">Alle tegninger</option><option value="internal">Kun interne</option><option value="shared">Delte med kunder</option></select></label>
   {emailFilter&&<button type="button" onClick={()=>{setEmailFilter("");window.history.replaceState(null,"","/admin/tegninger")}}>Vis alle kunder ×</button>}
  </section>
  {loading&&<div className={styles.notice}>Henter lagrede tegninger …</div>}
  {error&&<div className={styles.error} role="alert">{error}</div>}
  {!loading&&!error&&!matches.length&&<section className={styles.empty}><h2>Ingen tegninger funnet</h2><p>Opprett eller åpne en tegning, velg kunde og trykk «Lagre». Den vil dukke opp her uten at du oppretter et prosjekt.</p><Link href="/admin/tegning">Åpne tegneprogrammet →</Link></section>}
  {!loading&&!error&&groups.map(group=><section key={group.email||group.name} className={styles.group}>
   <div className={styles.groupTitle}><div><h2>{group.name}</h2>{group.email&&<small>{group.email}</small>}</div><span>{group.rows.length} tegning{group.rows.length===1?"":"er"}</span></div>
   <div className={styles.cards}>{group.rows.map(row=>{
    const isPublished=published.has(row.id),isShared=isPublished||row.customerVisible;
    return <article key={row.id} className={styles.card}>
     <div className={styles.cardMain}>
      <span className={styles.status}>{isPublished?"Delt med tilbud":row.customerVisible?"Synlig på Min side":"Kun i admin"}</span>
      <h3>{row.name}</h3>
      <p>{row.address||"Ingen adresse angitt"}</p>
      <small>Sist lagret: {when(row.updatedAt)} · {row.orderId?"Tilknyttet oppdrag":row.projectId?"Tilknyttet prosjekt":"Uten prosjekt"}</small>
     </div>
     <div className={styles.actions}>
      <Link href={"/admin/tegning?drawingId="+encodeURIComponent(row.id)}>Åpne / rediger</Link>
      <button type="button" onClick={()=>offerFromDrawing(row)}>＋ Nytt tilbud</button>
     </div>
    </article>
   })}</div>
  </section>)}
  <p className={styles.explanation}>En tegning du lagrer i admin er privat. Når du sender et tilbud til kundens egen e-postadresse med en valgt tegning, lagres en kopi på kundens «Min side». Endringer i arbeidsutgaven deles ikke automatisk.</p>
 </main>;
}
