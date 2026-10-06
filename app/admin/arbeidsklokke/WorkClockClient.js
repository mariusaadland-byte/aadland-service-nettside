"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./workClock.module.css";

const DEFAULT_RATE="500";
const DEFAULT_KM_RATE="5.30";

function osloDate(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=type=>parts.find(part=>part.type===type)?.value||"";
 return get("year")+"-"+get("month")+"-"+get("day");
}
function currentMonth(){return osloDate().slice(0,7)}
function shiftMonth(value,delta){
 const [year,month]=String(value).split("-").map(Number);
 const date=new Date(Date.UTC(year,month-1+delta,1));
 return date.toISOString().slice(0,7);
}
function monthName(value){
 const [year,month]=String(value).split("-").map(Number);
 return new Intl.DateTimeFormat("nb-NO",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(year,month-1,1)));
}
function dateLabel(value){
 if(!value)return "";
 const [y,m,d]=String(value).split("-").map(Number);
 return new Intl.DateTimeFormat("nb-NO",{weekday:"short",day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d)));
}
function number(value){
 const parsed=Number(String(value??"").replace(/\s/g,"").replace(",","."));
 return Number.isFinite(parsed)?Math.max(0,parsed):0;
}
function ore(value){return Math.round(number(value)*100)}
function kroner(oreValue){
 return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(oreValue)||0)/100);
}
function hours(minutes){
 const value=(Number(minutes)||0)/60;
 return new Intl.NumberFormat("nb-NO",{minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
}
function minutesFromHours(value){return Math.max(0,Math.round(number(value)*60))}
function entryCosts(entry){
 const labor=Math.round((Number(entry.durationMinutes)||0)*(Number(entry.hourlyRateOre)||0)/60);
 const travel=Math.round((Number(entry.distanceKm)||0)*(Number(entry.kmRateOre)||0));
 const toll=Number(entry.tollOre)||0;
 return {labor,travel,toll,total:labor+travel+toll};
}
function elapsed(startedAt,now){
 const ms=Math.max(0,now-new Date(startedAt).getTime());
 const seconds=Math.floor(ms/1000);
 const h=Math.floor(seconds/3600);
 const m=Math.floor((seconds%3600)/60);
 const s=seconds%60;
 return [h,m,s].map(value=>String(value).padStart(2,"0")).join(":");
}
function xml(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
}
function moneyNumber(oreValue){return ((Number(oreValue)||0)/100).toFixed(2)}
function defaultDraft(){
 return {orderId:"",projectLabel:"",customerLabel:"",note:"",hourlyRate:DEFAULT_RATE};
}
function defaultManual(){
 return {...defaultDraft(),workDate:osloDate(),durationHours:"",distanceKm:"",kmRate:DEFAULT_KM_RATE,toll:""};
}

export default function WorkClockClient({userName}){
 const [month,setMonth]=useState(currentMonth());
 const [entries,setEntries]=useState([]);
 const [active,setActive]=useState(null);
 const [orders,setOrders]=useState([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [setupRequired,setSetupRequired]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [timerDraft,setTimerDraft]=useState(defaultDraft);
 const [manual,setManual]=useState(defaultManual);
 const [editing,setEditing]=useState(null);

 async function load(targetMonth=month){
  setLoading(true); setError(""); setMessage("");
  try{
   const [timeResponse,ordersResponse]=await Promise.all([
    fetch("/api/admin/work-time?month="+encodeURIComponent(targetMonth)),
    fetch("/api/admin/orders")
   ]);
   const data=await timeResponse.json().catch(()=>({}));
   if(timeResponse.status===401||timeResponse.status===403){window.location.href="/admin/login";return;}
   if(!timeResponse.ok){
    setSetupRequired(data.setupRequired===true);
    throw new Error(data.error||"Arbeidstiden kunne ikke hentes.");
   }
   setSetupRequired(false);
   setEntries(Array.isArray(data.entries)?data.entries:[]);
   setActive(data.active||null);

   if(ordersResponse.ok){
    const orderData=await ordersResponse.json().catch(()=>({}));
    setOrders(Array.isArray(orderData.orders)?orderData.orders.filter(order=>order.orderType==="custom"&&!order.archivedAt&&order.status!=="cancelled"):[]);
   }
  }catch(err){
   setError(err.message||"Arbeidstiden kunne ikke hentes.");
  }finally{
   setLoading(false);
  }
 }

 useEffect(()=>{load(month)},[month]);
 useEffect(()=>{
  if(!active)return;
  setNow(Date.now());
  const id=setInterval(()=>setNow(Date.now()),1000);
  return()=>clearInterval(id);
 },[active]);

 function applyOrder(setter,value){
  const job=orders.find(order=>order.id===value);
  setter(current=>({
   ...current,
   orderId:value,
   projectLabel:job?(job.sourceQuoteTitle||job.orderNumber||"Oppdrag"):current.projectLabel,
   customerLabel:job?(job.customerName||job.customer?.name||""):current.customerLabel
  }));
 }
 async function request(method,body){
  setBusy(true); setError(""); setMessage("");
  try{
   const response=await fetch("/api/admin/work-time",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Handlingen kunne ikke utføres.");
   return data;
  }catch(err){
   setError(err.message||"Handlingen kunne ikke utføres.");
   return null;
  }finally{setBusy(false)}
 }
 async function start(){
  const data=await request("POST",{
   action:"start",
   orderId:timerDraft.orderId||null,
   projectLabel:timerDraft.projectLabel,
   customerLabel:timerDraft.customerLabel,
   note:timerDraft.note,
   hourlyRateOre:ore(timerDraft.hourlyRate),
   distanceKm:0,
   kmRateOre:ore(DEFAULT_KM_RATE),
   tollOre:0
  });
  if(!data)return;
  setActive(data.entry);
  setMessage("Arbeidsklokken er startet.");
  if(data.entry?.workDate?.slice(0,7)===month)setEntries(current=>[data.entry,...current.filter(item=>item.id!==data.entry.id)]);
 }
 async function stop(){
  if(!active)return;
  const data=await request("PATCH",{action:"stop",id:active.id});
  if(!data)return;
  setActive(null);
  setTimerDraft(defaultDraft());
  setMessage("Arbeidsklokken er stoppet og timene er lagret.");
  await load(month);
 }
 async function addManual(event){
  event.preventDefault();
  const data=await request("POST",{
   action:"manual",
   orderId:manual.orderId||null,
   workDate:manual.workDate,
   durationMinutes:minutesFromHours(manual.durationHours),
   projectLabel:manual.projectLabel,
   customerLabel:manual.customerLabel,
   note:manual.note,
   hourlyRateOre:ore(manual.hourlyRate),
   distanceKm:number(manual.distanceKm),
   kmRateOre:ore(manual.kmRate),
   tollOre:ore(manual.toll)
  });
  if(!data)return;
  setManual(defaultManual());
  setMessage("Timeregistreringen er lagret.");
  if(data.entry?.workDate?.slice(0,7)!==month)setMonth(data.entry.workDate.slice(0,7));
  else await load(month);
 }
 function openEdit(entry){
  setEditing({
   id:entry.id,
   orderId:entry.orderId||"",
   workDate:entry.workDate,
   durationHours:String(Math.round((entry.durationMinutes/60)*100)/100).replace(".",","),
   projectLabel:entry.projectLabel||"",
   customerLabel:entry.customerLabel||"",
   note:entry.note||"",
   hourlyRate:String((entry.hourlyRateOre||0)/100).replace(".",","),
   distanceKm:String(entry.distanceKm||"").replace(".",","),
   kmRate:String((entry.kmRateOre||0)/100).replace(".",","),
   toll:String((entry.tollOre||0)/100).replace(".",",")
  });
 }
 async function saveEdit(event){
  event.preventDefault();
  if(!editing)return;
  const data=await request("PATCH",{
   action:"update",id:editing.id,
   orderId:editing.orderId||null,
   workDate:editing.workDate,
   durationMinutes:minutesFromHours(editing.durationHours),
   projectLabel:editing.projectLabel,
   customerLabel:editing.customerLabel,
   note:editing.note,
   hourlyRateOre:ore(editing.hourlyRate),
   distanceKm:number(editing.distanceKm),
   kmRateOre:ore(editing.kmRate),
   tollOre:ore(editing.toll)
  });
  if(!data)return;
  const targetMonth=data.entry.workDate.slice(0,7);
  setEditing(null);
  setMessage(targetMonth===month?"Registreringen er oppdatert.":"Timene er flyttet til "+monthName(targetMonth)+".");
  if(targetMonth!==month)setMonth(targetMonth); else await load(month);
 }
 async function removeEntry(){
  if(!editing||!window.confirm("Slette denne timeregistreringen permanent?"))return;
  const data=await request("DELETE",{id:editing.id});
  if(!data)return;
  setEditing(null);
  setMessage("Registreringen er slettet.");
  await load(month);
 }

 const totals=useMemo(()=>entries.filter(entry=>!(entry.startedAt&&!entry.endedAt)).reduce((sum,entry)=>{
  const cost=entryCosts(entry);
  sum.minutes+=Number(entry.durationMinutes)||0;
  sum.labor+=cost.labor;
  sum.km+=Number(entry.distanceKm)||0;
  sum.travel+=cost.travel;
  sum.toll+=cost.toll;
  sum.total+=cost.total;
  return sum;
 },{minutes:0,labor:0,km:0,travel:0,toll:0,total:0}),[entries]);

 function exportExcel(){
  const rows=entries.filter(entry=>!(entry.startedAt&&!entry.endedAt));
  const header=["Dato","Prosjekt","Kunde","Timer","Timepris inkl. mva","Arbeid inkl. mva","Km","Km-sats inkl. mva","Kjøring inkl. mva","Bom inkl. mva","Total inkl. mva","Notat"];
  const tableRows=[
   header.map(value=>'<Cell><Data ss:Type="String">'+xml(value)+'</Data></Cell>').join(""),
   ...rows.map(entry=>{
    const cost=entryCosts(entry);
    const cells=[
     ["String",entry.workDate],["String",entry.projectLabel],["String",entry.customerLabel],
     ["Number",(entry.durationMinutes/60).toFixed(2)],["Number",moneyNumber(entry.hourlyRateOre)],
     ["Number",moneyNumber(cost.labor)],["Number",Number(entry.distanceKm||0).toFixed(2)],
     ["Number",moneyNumber(entry.kmRateOre)],["Number",moneyNumber(cost.travel)],
     ["Number",moneyNumber(cost.toll)],["Number",moneyNumber(cost.total)],["String",entry.note]
    ];
    return cells.map(([type,value])=>'<Cell><Data ss:Type="'+type+'">'+xml(value)+'</Data></Cell>').join("");
   }),
   [
    ["String","TOTAL"],["String",""],["String",""],["Number",(totals.minutes/60).toFixed(2)],
    ["String",""],["Number",moneyNumber(totals.labor)],["Number",totals.km.toFixed(2)],["String",""],
    ["Number",moneyNumber(totals.travel)],["Number",moneyNumber(totals.toll)],["Number",moneyNumber(totals.total)],["String",""]
   ].map(([type,value])=>'<Cell><Data ss:Type="'+type+'">'+xml(value)+'</Data></Cell>').join("")
  ].map(cells=>"<Row>"+cells+"</Row>").join("");

  const workbook='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'
   +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
   +'<Worksheet ss:Name="'+xml(month)+'"><Table>'+tableRows+'</Table></Worksheet></Workbook>';
  const blob=new Blob([workbook],{type:"application/vnd.ms-excel;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url; link.download="arbeidstid-"+month+".xml"; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.header}>
    <div>
     <Link className={styles.back} href="/admin">← Tilbake til backoffice</Link>
     <span className={styles.eyebrow}>AADLAND SERVICE · {userName}</span>
     <h1>Arbeidsklokke</h1>
     <p>Registrer arbeidstid, timepris, kjøring og bom. Alle prisfelt er inkl. mva.</p>
    </div>
    <button className={styles.exportButton} type="button" onClick={exportExcel} disabled={!entries.length}>Eksporter Excel</button>
   </header>

   {error&&<div className={styles.error}>{error}</div>}
   {message&&<div className={styles.success}>{message}</div>}
   {setupRequired&&<div className={styles.error}>Arbeidsklokken trenger databaseoppdateringen <code>work_time_entries</code>.</div>}

   <section className={active?styles.timerActive:styles.timerCard}>
    <div className={styles.timerTop}>
     <div>
      <span className={styles.eyebrow}>{active?"KLOKKEN GÅR":"NY ARBEIDSØKT"}</span>
      <h2>{active?(active.projectLabel||"Arbeid pågår"):"Start klokke"}</h2>
      {active&&<p>{active.customerLabel||"Ingen kunde valgt"} · startet {new Date(active.startedAt).toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Oslo"})}</p>}
     </div>
     {active&&<div className={styles.liveTime}>{elapsed(active.startedAt,now)}</div>}
    </div>

    {!active?<div className={styles.timerFields}>
     <label>Eksisterende oppdrag
      <select value={timerDraft.orderId} onChange={e=>applyOrder(setTimerDraft,e.target.value)}>
       <option value="">Ikke koblet til oppdrag</option>
       {orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.sourceQuoteTitle||order.customerName||"Oppdrag"}</option>)}
      </select>
     </label>
     <label>Prosjekt / jobb
      <input value={timerDraft.projectLabel} onChange={e=>setTimerDraft(current=>({...current,projectLabel:e.target.value}))} placeholder="F.eks. Terrasse"/>
     </label>
     <label>Kunde
      <input value={timerDraft.customerLabel} onChange={e=>setTimerDraft(current=>({...current,customerLabel:e.target.value}))} placeholder="Valgfritt"/>
     </label>
     <label>Timepris inkl. mva
      <div className={styles.money}><span>kr</span><input inputMode="decimal" value={timerDraft.hourlyRate} onChange={e=>setTimerDraft(current=>({...current,hourlyRate:e.target.value}))}/></div>
     </label>
     <label className={styles.full}>Notat
      <input value={timerDraft.note} onChange={e=>setTimerDraft(current=>({...current,note:e.target.value}))} placeholder="Hva jobber du med?"/>
     </label>
     <button className={styles.startButton} type="button" onClick={start} disabled={busy}>▶ Start arbeidsklokke</button>
    </div>:<div className={styles.stopRow}>
     <div><b>{kroner(active.hourlyRateOre)}/t</b><span>Timeprisen kan redigeres etter at klokken er stoppet.</span></div>
     <button className={styles.stopButton} type="button" onClick={stop} disabled={busy}>■ Stopp og lagre</button>
    </div>}
   </section>

   <section className={styles.monthBar}>
    <button type="button" onClick={()=>setMonth(value=>shiftMonth(value,-1))}>←</button>
    <div><span className={styles.eyebrow}>MÅNED</span><strong>{monthName(month)}</strong></div>
    <button type="button" onClick={()=>setMonth(value=>shiftMonth(value,1))}>→</button>
   </section>

   <section className={styles.summary}>
    <div><span>Timer</span><strong>{hours(totals.minutes)} t</strong></div>
    <div><span>Arbeid inkl. mva</span><strong>{kroner(totals.labor)}</strong></div>
    <div><span>Kjøring</span><strong>{totals.km.toLocaleString("nb-NO",{maximumFractionDigits:2})} km</strong><small>{kroner(totals.travel)}</small></div>
    <div><span>Bom</span><strong>{kroner(totals.toll)}</strong></div>
    <div className={styles.total}><span>Total inkl. mva</span><strong>{kroner(totals.total)}</strong></div>
   </section>

   <section className={styles.card}>
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>ETTERREGISTRERING</span><h2>Legg inn timer manuelt</h2></div></div>
    <form className={styles.formGrid} onSubmit={addManual}>
     <label>Dato<input type="date" value={manual.workDate} onChange={e=>setManual(current=>({...current,workDate:e.target.value}))} required/></label>
     <label>Timer<input inputMode="decimal" value={manual.durationHours} onChange={e=>setManual(current=>({...current,durationHours:e.target.value}))} placeholder="F.eks. 7,5" required/></label>
     <label>Eksisterende oppdrag
      <select value={manual.orderId} onChange={e=>applyOrder(setManual,e.target.value)}>
       <option value="">Ikke koblet til oppdrag</option>
       {orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.sourceQuoteTitle||order.customerName||"Oppdrag"}</option>)}
      </select>
     </label>
     <label>Prosjekt / jobb<input value={manual.projectLabel} onChange={e=>setManual(current=>({...current,projectLabel:e.target.value}))}/></label>
     <label>Kunde<input value={manual.customerLabel} onChange={e=>setManual(current=>({...current,customerLabel:e.target.value}))}/></label>
     <label>Timepris inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={manual.hourlyRate} onChange={e=>setManual(current=>({...current,hourlyRate:e.target.value}))}/></div></label>
     <label>Km<input inputMode="decimal" value={manual.distanceKm} onChange={e=>setManual(current=>({...current,distanceKm:e.target.value}))} placeholder="0"/></label>
     <label>Km-sats inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={manual.kmRate} onChange={e=>setManual(current=>({...current,kmRate:e.target.value}))}/></div></label>
     <label>Bom inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={manual.toll} onChange={e=>setManual(current=>({...current,toll:e.target.value}))} placeholder="0"/></div></label>
     <label className={styles.full}>Notat<input value={manual.note} onChange={e=>setManual(current=>({...current,note:e.target.value}))}/></label>
     <div className={styles.full}><button className={styles.saveButton} disabled={busy}>Lagre timeregistrering</button></div>
    </form>
   </section>

   <section className={styles.card}>
    <div className={styles.sectionHead}>
     <div><span className={styles.eyebrow}>REGISTRERINGER</span><h2>{monthName(month)}</h2></div>
     <span>{entries.length} {entries.length===1?"registrering":"registreringer"}</span>
    </div>
    {loading?<div className={styles.empty}>Laster arbeidstid …</div>:entries.length===0?<div className={styles.empty}>Ingen timer registrert denne måneden.</div>:
    <div className={styles.tableWrap}><table>
     <thead><tr><th>Dato</th><th>Prosjekt</th><th>Timer</th><th>Arbeid</th><th>Km</th><th>Bom</th><th>Total</th><th></th></tr></thead>
     <tbody>{entries.map(entry=>{
      const activeRow=entry.startedAt&&!entry.endedAt;
      const cost=entryCosts(entry);
      return <tr key={entry.id} className={activeRow?styles.activeRow:""}>
       <td>{dateLabel(entry.workDate)}</td>
       <td><b>{entry.projectLabel||"Arbeid"}</b><small>{entry.customerLabel||entry.note||""}</small></td>
       <td>{activeRow?<span className={styles.running}>Pågår</span>:hours(entry.durationMinutes)+" t"}</td>
       <td>{activeRow?"—":kroner(cost.labor)}</td>
       <td>{entry.distanceKm?entry.distanceKm.toLocaleString("nb-NO",{maximumFractionDigits:2})+" km":"—"}</td>
       <td>{entry.tollOre?kroner(entry.tollOre):"—"}</td>
       <td><b>{activeRow?"—":kroner(cost.total)}</b></td>
       <td>{!activeRow&&<button type="button" className={styles.editButton} onClick={()=>openEdit(entry)}>Rediger</button>}</td>
      </tr>
     })}</tbody>
    </table></div>}
   </section>

   {editing&&<div className={styles.modalBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget)setEditing(null)}}>
    <form className={styles.modal} onSubmit={saveEdit}>
     <div className={styles.modalHead}><div><span className={styles.eyebrow}>REDIGER / FLYTT TIMER</span><h2>{editing.projectLabel||"Timeregistrering"}</h2></div><button type="button" onClick={()=>setEditing(null)}>×</button></div>
     <p className={styles.modalHelp}>Endre dato for å flytte timene til en annen dag eller måned.</p>
     <div className={styles.formGrid}>
      <label>Dato<input type="date" value={editing.workDate} onChange={e=>setEditing(current=>({...current,workDate:e.target.value}))}/></label>
      <label>Timer<input inputMode="decimal" value={editing.durationHours} onChange={e=>setEditing(current=>({...current,durationHours:e.target.value}))}/></label>
      <label>Eksisterende oppdrag
       <select value={editing.orderId} onChange={e=>applyOrder(setEditing,e.target.value)}>
        <option value="">Ikke koblet til oppdrag</option>
        {orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.sourceQuoteTitle||order.customerName||"Oppdrag"}</option>)}
       </select>
      </label>
      <label>Prosjekt / jobb<input value={editing.projectLabel} onChange={e=>setEditing(current=>({...current,projectLabel:e.target.value}))}/></label>
      <label>Kunde<input value={editing.customerLabel} onChange={e=>setEditing(current=>({...current,customerLabel:e.target.value}))}/></label>
      <label>Timepris inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={editing.hourlyRate} onChange={e=>setEditing(current=>({...current,hourlyRate:e.target.value}))}/></div></label>
      <label>Km<input inputMode="decimal" value={editing.distanceKm} onChange={e=>setEditing(current=>({...current,distanceKm:e.target.value}))}/></label>
      <label>Km-sats inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={editing.kmRate} onChange={e=>setEditing(current=>({...current,kmRate:e.target.value}))}/></div></label>
      <label>Bom inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={editing.toll} onChange={e=>setEditing(current=>({...current,toll:e.target.value}))}/></div></label>
      <label className={styles.full}>Notat<input value={editing.note} onChange={e=>setEditing(current=>({...current,note:e.target.value}))}/></label>
     </div>
     <div className={styles.modalActions}><button type="button" className={styles.deleteButton} onClick={removeEntry} disabled={busy}>Slett</button><div><button type="button" className={styles.cancelButton} onClick={()=>setEditing(null)}>Avbryt</button><button className={styles.saveButton} disabled={busy}>Lagre endringer</button></div></div>
    </form>
   </div>}
  </div>
 </main>;
}
