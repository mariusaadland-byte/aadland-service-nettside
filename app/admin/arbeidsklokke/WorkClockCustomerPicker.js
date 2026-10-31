"use client";
import {useMemo,useState} from "react";
import styles from "./workClock.module.css";

export default function WorkClockCustomerPicker({customers=[],value="",onSelect,disabled=false,loadError=""}){
 const [query,setQuery]=useState("");
 const selected=customers.find(c=>c.customerRef===value);
 const matches=useMemo(()=>{
  const q=query.trim().toLocaleLowerCase("nb-NO");
  if(!q)return [];
  return customers.filter(c=>(c.name+" "+(c.phone||""))
   .toLocaleLowerCase("nb-NO").includes(q)).slice(0,12);
 },[customers,query]);
 return <div className={styles.customerPicker}>
  <span className={styles.customerPickerLabel}>Velg eksisterende kunde – uten prosjekt</span>
  {selected?<div className={styles.customerSelected}>
   <div><strong>{selected.name}</strong><small>{selected.phone||"Lagret kundekort"}</small></div>
   <button type="button" disabled={disabled}
    onClick={()=>{onSelect(null);setQuery("");}}>Bytt / fjern</button>
  </div>:<>
   <input type="search" aria-label="Søk etter eksisterende kunde"
    value={query} disabled={disabled||Boolean(loadError)}
    onChange={e=>setQuery(e.target.value)}
    placeholder="Søk på navn eller telefonnummer" autoComplete="off"/>
   {query.trim()&&<div className={styles.customerMatches} role="group" aria-label="Kunder som passer søket">
    {matches.length?matches.map(c=><button key={c.customerRef} type="button" disabled={disabled}
     onClick={()=>{onSelect(c);setQuery("");}}>
      <strong>{c.name}</strong><small>{c.phone||""}{c.kind==="profile"?" · Kundekonto":" · Kundekort"}</small>
     </button>):<p>Ingen kunder funnet med dette søket.</p>}
   </div>}
  </>}
  {value&&!selected&&<p role="status">Valgt kunde: kundereferansen finnes ikke i listen. Oppdater eller velg på nytt.</p>}
  {loadError&&<p role="alert">{loadError}</p>}
  <small>Du kan jobbe hos samme kunde flere ganger uten å opprette et prosjekt.</small>
 </div>;
}
