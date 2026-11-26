"use client";
import {useEffect,useRef,useState} from "react";
import {RENTAL_CART_MAX_LINES,rentalCartInput} from "../../../lib/rentalCart.mjs";
import styles from "./cart.module.css";
const key="aadland-rental-cart-v1",kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function RentalCartClient({items,today,initialItemId}){
 const [lines,setLines]=useState([]),[ready,setReady]=useState(false),[quote,setQuote]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const lock=useRef(false);
 useEffect(()=>{let old=[];try{const raw=JSON.parse(sessionStorage.getItem(key)||"[]");if(Array.isArray(raw))old=raw.filter(x=>x&&items.some(i=>i.id===x.itemId)&&typeof x.startDate==="string"&&typeof x.endDate==="string"&&Number.isInteger(x.quantity)).filter((x,i,a)=>a.findIndex(y=>y.itemId===x.itemId)===i).slice(0,RENTAL_CART_MAX_LINES);}catch{}
 if(items.some(i=>i.id===initialItemId)&&!old.some(x=>x.itemId===initialItemId)&&old.length<RENTAL_CART_MAX_LINES)old.push({itemId:initialItemId,startDate:"",endDate:"",quantity:1});setLines(old);setReady(true);},[initialItemId,items]);
 useEffect(()=>{if(ready)try{sessionStorage.setItem(key,JSON.stringify(lines));}catch{}},[lines,ready]);
 function change(next){if(lock.current)return;setLines(next);setQuote(null);setError("");}
 function edit(index,k,v){change(lines.map((x,i)=>i===index?{...x,[k]:v}:x));}
 async function check(e){e.preventDefault();if(lock.current)return;if(!rentalCartInput({lines},today)){setError("Velg unike produkter, gyldige datoer og antall.");return;}lock.current=true;setBusy(true);setQuote(null);setError("");
 try{const r=await fetch("/api/rental/cart-quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Prisen kunne ikke kontrolleres.");setQuote(d);}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 const next=items.find(i=>!lines.some(x=>x.itemId===i.id));
 return <form className={styles.root} onSubmit={check}><p>Velg flere maskiner og leieperioder. Dette er en prisforespørsel, ikke en reservasjon. Kun henting.</p>{!ready?<p>Laster handlekurv …</p>:<>
 {lines.map((x,i)=><section key={i} className={styles.line}><label>Utstyr<select value={x.itemId} onChange={e=>edit(i,"itemId",e.target.value)} disabled={busy}>{items.filter(t=>t.id===x.itemId||!lines.some(y=>y.itemId===t.id)).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
 <label>Antall<input type="number" min={1} max={Math.min(20,items.find(t=>t.id===x.itemId)?.quantity||1)} value={x.quantity} onChange={e=>edit(i,"quantity",Number(e.target.value))} required disabled={busy}/></label>
 <div className={styles.dates}><label>Fra<input type="date" min={today} value={x.startDate} onChange={e=>edit(i,"startDate",e.target.value)} required disabled={busy}/></label><label>Til og med<input type="date" min={x.startDate||today} value={x.endDate} onChange={e=>edit(i,"endDate",e.target.value)} required disabled={busy}/></label></div>
 <button type="button" disabled={busy} onClick={()=>change(lines.filter((_,j)=>j!==i))}>Fjern</button>
 {quote?.lines?.[i]&&<p>{quote.lines[i].available?"Leie "+kr(quote.lines[i].totalOre)+" · Depositum "+kr(quote.lines[i].depositOre):quote.lines[i].reason}</p>}</section>)}
 <button type="button" disabled={busy||!next||lines.length>=RENTAL_CART_MAX_LINES} onClick={()=>change([...lines,{itemId:next.id,quantity:1,startDate:lines[0]?.startDate||"",endDate:lines[0]?.endDate||""}])}>+ Legg til utstyr</button>
 <button type="submit" disabled={busy||!lines.length}>{busy?"Kontrollerer …":"Kontroller tilgjengelighet og pris"}</button>
 {error&&<p role="alert">{error}</p>}
 {quote&&<section className={styles.line}><h2>Samlet prisoversikt</h2>{quote.totals?<><p>Leie inkl. mva.: <b>{kr(quote.totals.rentalOre)}</b></p><p>Depositum separat: <b>{kr(quote.totals.depositOre)}</b></p><p>Antall maskiner: {quote.totals.quantity}</p></>:<p>En eller flere linjer er utilgjengelige. Endre handlekurven og kontroller igjen.</p>}<p>Ingen varer er reservert. Betaling og samlet bestilling er ikke aktivert.</p></section>}</>}</form>;
}
