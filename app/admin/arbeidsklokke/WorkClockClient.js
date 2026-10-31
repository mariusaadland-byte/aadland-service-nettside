"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./workClock.module.css";
import {clockAfterDeduction,formatDeductionHours,parseDeductionHours} from "../../../lib/workTimeDeduction";
import WorkClockCustomerPicker from "./WorkClockCustomerPicker";

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
function osloDateTimeLocal(iso){
 if(!iso)return "";
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Oslo",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(new Date(iso));
 const get=type=>parts.find(item=>item.type===type)?.value||"";
 return get("year")+"-"+get("month")+"-"+get("day")+"T"+get("hour")+":"+get("minute");
}
function fromOsloDateTimeLocal(local){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local||""))return "";
 const base=Date.parse(local+"Z");
 if(!Number.isFinite(base))return "";
 for(const h of [2,1]){
  const candidate=new Date(base-h*3600000);
  if(osloDateTimeLocal(candidate.toISOString())===local)return candidate.toISOString();
 }
 return "";
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
 const net=(Number(entry.durationMinutes)||0)-(Number(entry.deductedMinutes)||0);
 const labor=Math.round(net*(Number(entry.hourlyRateOre)||0)/60);
 const travel=Math.round((Number(entry.distanceKm)||0)*(Number(entry.kmRateOre)||0));
 const toll=Number(entry.tollOre)||0;
 return {labor,travel,toll,total:labor+travel+toll};
}
function xml(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
}
function moneyNumber(oreValue){return ((Number(oreValue)||0)/100).toFixed(2)}
function defaultDraft(){
 return {orderId:"",customerRef:"",projectLabel:"",customerLabel:"",note:"",hourlyRate:DEFAULT_RATE,deductedHours:"0"};
}
function defaultManual(){
 return {...defaultDraft(),workDate:osloDate(),durationHours:"",deductedHours:"0",distanceKm:"",kmRate:DEFAULT_KM_RATE,toll:""};
}

export default function WorkClockClient({userName}){
 const [month,setMonth]=useState(currentMonth());
 const [entries,setEntries]=useState([]);
 const [active,setActive]=useState(null);
 const [orders,setOrders]=useState([]);
 const [customers,setCustomers]=useState([]);
 const [customerLoadError,setCustomerLoadError]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [setupRequired,setSetupRequired]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [timerDraft,setTimerDraft]=useState(defaultDraft);
 const [manual,setManual]=useState(defaultManual);
 const [editing,setEditing]=useState(null);
 const [credits,setCredits]=useState([]);
 const [laborOreByScope,setLaborOreByScope]=useState({});
 const [netMinutesByScope,setNetMinutesByScope]=useState({});
 const [activeMinusInput,setActiveMinusInput]=useState("0");
 const [creditEditor,setCreditEditor]=useState(null);
 const [selectedCreditOrder,setSelectedCreditOrder]=useState("");

 async function load(targetMonth=month){
  setLoading(true); setError(""); setMessage("");
  try{
   const [timeResponse,ordersResponse,customerResponse]=await Promise.all([
    fetch("/api/admin/work-time?month="+encodeURIComponent(targetMonth)),
    fetch("/api/admin/orders"),
    fetch("/api/admin/work-time/customers",{cache:"no-store"})
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
   setActiveMinusInput(formatDeductionHours(data.active?.deductedMinutes||0));
   setNetMinutesByScope(data.netMinutesByScope||{});
   setCredits(Array.isArray(data.credits)?data.credits:[]);
   setLaborOreByScope(data.laborOreByScope||{});

   if(ordersResponse.ok){
    const orderData=await ordersResponse.json().catch(()=>({}));
    setOrders(Array.isArray(orderData.orders)?orderData.orders.filter(order=>order.orderType==="custom"&&!order.archivedAt&&order.status!=="cancelled"):[]);
   }
   if(customerResponse.ok){
    const list=await customerResponse.json().catch(()=>({}));
    setCustomers(Array.isArray(list.customers)?list.customers:[]);
    setCustomerLoadError("");
   }else{
    const details=await customerResponse.json().catch(()=>({}));
    setCustomerLoadError(details.error||"Kunne ikke hente kunderegisteret. Du kan fortsatt skrive inn kunden manuelt.");
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
   customerRef:job?"":current.customerRef,
   projectLabel:job?(job.sourceQuoteTitle||job.orderNumber||"Oppdrag"):current.projectLabel,
   customerLabel:job?(job.customerName||job.customer?.name||""):current.customerLabel
  }));
 }
 function chooseCustomer(setter,customer){
  setter(current=>({
   ...current,
   orderId:"",
   projectLabel:current.orderId?"":current.projectLabel,
   customerRef:customer?.customerRef||"",
   customerLabel:customer?.name||""
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
  const deductedMinutes=parseDeductionHours(timerDraft.deductedHours);
  if(deductedMinutes===null){setError("Oppgi gyldig minustid i timer, f.eks. 15 eller 1,5.");return;}
  const data=await request("POST",{
   action:"start",
   orderId:timerDraft.orderId||null,
   customerRef:timerDraft.customerRef||"",
   projectLabel:timerDraft.projectLabel,
   customerLabel:timerDraft.customerLabel,
   note:timerDraft.note,
   hourlyRateOre:ore(timerDraft.hourlyRate),
   deductedMinutes,
   distanceKm:0,
   kmRateOre:ore(DEFAULT_KM_RATE),
   tollOre:0
  });
  if(!data)return;
  setActive(data.entry);
  setActiveMinusInput(formatDeductionHours(data.entry.deductedMinutes));
  const startedScope=data.entry.orderId?"order:"+data.entry.orderId:"entry:"+data.entry.id;
  setNetMinutesByScope(current=>({...current,[startedScope]:(Number(current[startedScope])||0)-deductedMinutes}));
  setLaborOreByScope(current=>({...current,[startedScope]:
   (Number(current[startedScope])||0)-Math.round(deductedMinutes*Number(data.entry.hourlyRateOre||0)/60)}));
  setMessage("Arbeidsklokken er startet. Minustiden telles opp mot null.");
  if(data.entry?.workDate?.slice(0,7)===month)setEntries(current=>[data.entry,...current.filter(item=>item.id!==data.entry.id)]);
 }
 async function resume(entry){
  // Only a finished timer with no order may be resumed. Never create
  // a second entry; the API reopens the existing row by ID.
  if(busy||active||entry.orderId||!entry.startedAt||!entry.endedAt)return;
  const data=await request("PATCH",{action:"resume",id:entry.id});
  if(!data)return;
  setEditing(null);
  setActive(data.entry);
  setActiveMinusInput(formatDeductionHours(data.entry.deductedMinutes));
  setNow(Date.now());
  setMessage("Klokken fortsetter på samme registrering. Tidligere timer er beholdt.");
  setEntries(current=>current.map(item=>item.id===data.entry.id?data.entry:item));
 }
 async function lunch(deltaMinutes){
  if(!active||busy)return;
  const data=await request("PATCH",{
   action:"deduct",id:active.id,deltaMinutes,expectedUpdatedAt:active.updatedAt
  });
  if(!data)return;
  setActive(data.entry);
  const scope=active.orderId?"order:"+active.orderId:"entry:"+active.id;
  const saved=Number(active.durationMinutes)||0,rate=Number(active.hourlyRateOre)||0;
  const oldBase=Math.round((saved-(Number(active.deductedMinutes)||0))*rate/60);
  const newBase=Math.round((saved-(Number(data.entry.deductedMinutes)||0))*rate/60);
  setLaborOreByScope(previous=>({...previous,[scope]:(Number(previous[scope])||0)+newBase-oldBase}));
  setNetMinutesByScope(previous=>({...previous,[scope]:(Number(previous[scope])||0)+
   (Number(active.deductedMinutes)||0)-(Number(data.entry.deductedMinutes)||0)}));
  setActiveMinusInput(formatDeductionHours(data.entry.deductedMinutes));
  setEntries(current=>current.map(entry=>entry.id===data.entry.id?data.entry:entry));
  setMessage(deltaMinutes>0?"30 minutter lunsj er trukket fra arbeidstiden.":"Siste lunsjtrekk er angret.");
 }
 async function saveRunningMinus(){
  if(!active||busy)return;
  const deductedMinutes=parseDeductionHours(activeMinusInput);
  if(deductedMinutes===null){
   setError("Skriv minustid i timer: 1,5 betyr 1 time og 30 minutter, 15 betyr 15 timer.");return;
  }
  const data=await request("PATCH",{action:"setDeduction",id:active.id,
   deductedMinutes,expectedUpdatedAt:active.updatedAt});
  if(!data)return;
  const scope=active.orderId?"order:"+active.orderId:"entry:"+active.id;
  const delta=Number(active.deductedMinutes||0)-Number(data.entry.deductedMinutes||0);
  setNetMinutesByScope(previous=>({...previous,[scope]:(Number(previous[scope])||0)+delta}));
  setLaborOreByScope(previous=>({...previous,[scope]:(Number(previous[scope])||0)+
   Math.round(delta*Number(active.hourlyRateOre||0)/60)}));
  setActive(data.entry);
  setActiveMinusInput(formatDeductionHours(data.entry.deductedMinutes));
  setEntries(previous=>previous.map(e=>e.id===data.entry.id?data.entry:e));
  setMessage("Minustiden er lagret. Klokken fortsetter og saldoen kan være negativ.");
 }
 function scopeKey(entry){return entry?.orderId?"order:"+entry.orderId:"entry:"+entry?.id}
 function showCreditEditor(entry){
  const key=scopeKey(entry);
  const saved=credits.find(c=>c.scopeKey===key);
  setCreditEditor({entryId:entry.orderId?null:entry.id,orderId:entry.orderId||null,
   scopeKey:key,agreedValueKroner:saved?String(saved.agreedValueOre/100).replace(".",","):"",
   description:saved?.description||""});
 }
 async function saveCredit(event){
  event.preventDefault();
  if(!creditEditor)return;
  const input=String(creditEditor.agreedValueKroner||"").trim().replace(",",".");
  if(!/^\d+(?:\.\d{1,2})?$/.test(input)){
   setError("Oppgi avtalt verdi som et gyldig kronebeløp, for eksempel 5000.");
   return;
  }
  const amount=Math.round(Number(input)*100);
  const data=await request(creditEditor.orderId?"POST":"PATCH",{
   action:creditEditor.orderId?"setOrderCredit":"setCredit",
   ...(creditEditor.orderId?{orderId:creditEditor.orderId}:{id:creditEditor.entryId}),
   agreedValueOre:amount,creditDescription:creditEditor.description});
  if(!data)return;
  setCredits(current=>[...current.filter(c=>c.scopeKey!==data.credit.scopeKey),data.credit]);
  setCreditEditor(null);
  setMessage("Avtalt motregningsverdi er lagret. Den trekkes fra prosjektets arbeidsverdi, ikke fra timene.");
 }
 function workCreditProgress(entry){
  const scope=scopeKey(entry),credit=credits.find(c=>c.scopeKey===scope);
  if(!credit||credit.agreedValueOre<=0)return null;
  const saved=Number(laborOreByScope[scope]||0);
  const currentIsActive=active&&scopeKey(active)===scope;
  const liveMinutes=currentIsActive?Math.max(0,(now-Date.parse(active.startedAt))/60000):0;
  const runningSavedMinutes=currentIsActive?
   (Number(active.durationMinutes)||0)-(Number(active.deductedMinutes)||0):0;
  const runningNowMinutes=currentIsActive?
   (Number(active.durationMinutes)||0)+liveMinutes-(Number(active.deductedMinutes)||0):0;
  const activeLaborDelta=currentIsActive?
   Math.round(runningNowMinutes*(Number(active.hourlyRateOre)||0)/60)-
   Math.round(runningSavedMinutes*(Number(active.hourlyRateOre)||0)/60):0;
  const labor=saved+activeLaborDelta;
  const remaining=Math.max(0,credit.agreedValueOre-labor);
  const extra=Math.max(0,labor-credit.agreedValueOre);
  const hourlyRate=Number(active?.hourlyRateOre||entry.hourlyRateOre)||0;
  return {credit,labor,remaining,extra,remainingMinutes:hourlyRate>0?
   Math.ceil(remaining*60/hourlyRate):null};
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
  const deductedMinutes=parseDeductionHours(manual.deductedHours);
  if(deductedMinutes===null){
   setError("Skriv minustid i timer, for eksempel 1,5 for halvannen time eller 15 for femten timer.");
   return;
  }
  const data=await request("POST",{
   action:"manual",
   orderId:manual.orderId||null,
   customerRef:manual.customerRef||"",
   workDate:manual.workDate,
   durationMinutes:minutesFromHours(manual.durationHours),
   deductedMinutes,
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
   customerRef:entry.customerRef||"",
   workDate:entry.workDate,
   durationHours:String(Math.round((entry.durationMinutes/60)*100)/100).replace(".",","),
   projectLabel:entry.projectLabel||"",
   customerLabel:entry.customerLabel||"",
   note:entry.note||"",
   hourlyRate:String((entry.hourlyRateOre||0)/100).replace(".",","),
   distanceKm:String(entry.distanceKm||"").replace(".",","),
   kmRate:String((entry.kmRateOre||0)/100).replace(".",","),
   toll:String((entry.tollOre||0)/100).replace(".",","),
   deductedHours:formatDeductionHours(entry.deductedMinutes||0),
   stampEditorEnabled:Boolean(entry.startedAt&&entry.endedAt),
   sessions:(entry.sessions||[]).map(item=>({
    startedAt:item.startedAt?osloDateTimeLocal(item.startedAt):"",
    endedAt:item.endedAt?osloDateTimeLocal(item.endedAt):"",
    minutes:item.minutes,
    historical:Boolean(item.historical)
   }))
  });
 }
 async function saveEdit(event){
  event.preventDefault();
  if(!editing)return;
  const deductedMinutes=parseDeductionHours(editing.deductedHours);
  if(deductedMinutes===null){
   setError("Skriv minustid i timer, for eksempel 1,5 for halvannen time eller 15 for femten timer.");
   return;
  }
  let sessions;
  if(editing.stampEditorEnabled){
   sessions=editing.sessions.map(item=>item.historical
    ?{startedAt:null,endedAt:null,minutes:item.minutes,historical:true}
    :{startedAt:fromOsloDateTimeLocal(item.startedAt),
      endedAt:fromOsloDateTimeLocal(item.endedAt)});
   if(sessions.some(item=>!item.historical&&(!item.startedAt||!item.endedAt))){
    setError("Kontroller dato og klokkeslett. Enkelte klokkeslett finnes ikke ved sommertid.");
    return;
   }
  }
  const data=await request("PATCH",{
   action:"update",id:editing.id,
   orderId:editing.orderId||null,
   customerRef:editing.customerRef||"",
   workDate:editing.workDate,
   durationMinutes:minutesFromHours(editing.durationHours),
   deductedMinutes,
   ...(sessions?{sessions}:{}),
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
  sum.minutes+=(Number(entry.durationMinutes)||0)-(Number(entry.deductedMinutes)||0);
  sum.labor+=cost.labor;
  sum.km+=Number(entry.distanceKm)||0;
  sum.travel+=cost.travel;
  sum.toll+=cost.toll;
  sum.total+=cost.total;
  return sum;
 },{minutes:0,labor:0,km:0,travel:0,toll:0,total:0}),[entries]);

 function exportExcel(){
  const rows=entries.filter(entry=>!(entry.startedAt&&!entry.endedAt));
  const header=["Dato","Prosjekt","Kunde","Timer netto","Lunsj/minustid (timer)","Timepris inkl. mva","Arbeid inkl. mva","Km","Km-sats inkl. mva","Kjøring inkl. mva","Bom inkl. mva","Total inkl. mva","Notat"];
  const tableRows=[
   header.map(value=>'<Cell><Data ss:Type="String">'+xml(value)+'</Data></Cell>').join(""),
   ...rows.map(entry=>{
    const cost=entryCosts(entry);
    const cells=[
     ["String",entry.workDate],["String",entry.projectLabel],["String",entry.customerLabel],
     ["Number",((entry.durationMinutes-(entry.deductedMinutes||0))/60).toFixed(2)],
     ["Number",((Number(entry.deductedMinutes)||0)/60).toFixed(2)],["Number",moneyNumber(entry.hourlyRateOre)],
     ["Number",moneyNumber(cost.labor)],["Number",Number(entry.distanceKm||0).toFixed(2)],
     ["Number",moneyNumber(entry.kmRateOre)],["Number",moneyNumber(cost.travel)],
     ["Number",moneyNumber(cost.toll)],["Number",moneyNumber(cost.total)],["String",entry.note]
    ];
    return cells.map(([type,value])=>'<Cell><Data ss:Type="'+type+'">'+xml(value)+'</Data></Cell>').join("");
   }),
   [
    ["String","TOTAL"],["String",""],["String",""],["Number",(totals.minutes/60).toFixed(2)],
    ["String",""],["String",""],["Number",moneyNumber(totals.labor)],["Number",totals.km.toFixed(2)],["String",""],
    ["Number",moneyNumber(totals.travel)],["Number",moneyNumber(totals.toll)],["Number",moneyNumber(totals.total)],["String",""]
   ].map(([type,value])=>'<Cell><Data ss:Type="'+type+'">'+xml(value)+'</Data></Cell>').join("")
  ].map(cells=>"<Row>"+cells+"</Row>").join("");

  const workbook='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'
   +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
   +'<Worksheet ss:Name="'+xml(month)+'"><Table>'+tableRows+'</Table></Worksheet></Workbook>';
  const blob=new Blob([workbook],{type:"application/vnd.ms-excel;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url; link.download="arbeidstid-"+month+".xls"; link.click();
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
      {active&&<p>{active.customerLabel||"Ingen kunde valgt"} · startet {new Date(active.startedAt).toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Oslo"})}
       {active.durationMinutes>0&&<> · {hours(active.durationMinutes)} t lagret fra før</>}</p>}
     </div>
     {active&&<div className={styles.liveTime} aria-label="Samlet registrert og pågående arbeidstid">
      {clockAfterDeduction(active.durationMinutes,active.startedAt,now,active.deductedMinutes)}
     </div>}
    </div>
    {active&&<div className={styles.runningBreak}>
     <button type="button" className={styles.lunchButton}
      disabled={busy||active.lunchDays?.includes(osloDate())}
      onClick={()=>lunch(30)}>🍽️ {active.lunchDays?.includes(osloDate())?"Lunsj er trukket i dag":"Lunsj −30 min"}</button>
     {active.lunchDays?.includes(osloDate())&&<button type="button" className={styles.undoLunch}
      disabled={busy} onClick={()=>lunch(-30)}>Angre lunsj i dag</button>}
     <span>Minustid totalt: {formatDeductionHours(active.deductedMinutes||0)} t. Arbeidsklokken går videre.</span>
    </div>}
    {active&&<div className={styles.runningMinusEditor}>
     <label>Minustid / startsaldo (timer)
      <input type="text" inputMode="decimal" value={activeMinusInput}
       onChange={e=>setActiveMinusInput(e.target.value)} placeholder="F.eks. 15 eller 1,5"/>
     </label>
     <button type="button" disabled={busy} onClick={saveRunningMinus}>Lagre minustid</button>
     <small>Du kan legge inn mer minustid enn du har jobbet. Klokken teller da opp fra minus mot null.</small>
    </div>}
    {active&&<div className={styles.scopeBalance} aria-live="polite">
     <span>{active.orderId?"Samlet timessaldo for oppdraget":"Saldo for denne registreringen"}</span>
     <strong>{hours((Number(netMinutesByScope[scopeKey(active)])||0)+
      Math.max(0,(now-Date.parse(active.startedAt))/60000))} t</strong>
     {active.orderId&&<small>Inkluderer tidligere registreringer på oppdraget, også fra andre måneder.</small>}
    </div>}
    {active&&<div className={styles.creditLive}>
     {(()=>{const progress=workCreditProgress(active);return progress?<>
      <b>Motregning: {kroner(progress.credit.agreedValueOre)}</b>
      <span>Arbeid utført: {kroner(progress.labor)}</span>
      <strong>{progress.remaining>0?"Verdi igjen: "+kroner(progress.remaining):
       "Til fakturering utover avtalen: "+kroner(progress.extra)}</strong>
      {progress.remainingMinutes!==null&&progress.remaining>0&&
       <small>Ca. {hours(progress.remainingMinutes)} arbeidstimer igjen ved dagens timepris</small>}
     </>:null})()}
     <button type="button" disabled={busy} onClick={()=>showCreditEditor(active)}>
      {workCreditProgress(active)?"Endre avtalt verdi":"Legg inn avtalt verdi / motregning"}
     </button>
    </div>}

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
     <div className={styles.full}>
      <WorkClockCustomerPicker customers={customers} value={timerDraft.customerRef}
       disabled={busy||Boolean(timerDraft.orderId)} loadError={customerLoadError}
       onSelect={customer=>chooseCustomer(setTimerDraft,customer)}/>
     </div>
     {!timerDraft.customerRef&&<label>Kunde (valgfritt navn)
      <input value={timerDraft.customerLabel}
       onChange={e=>setTimerDraft(current=>({...current,customerLabel:e.target.value}))}
       placeholder="Eller skriv navn uten kundekort"/>
     </label>}
     <label>Minustid ved start (timer)
      <input type="text" inputMode="decimal" value={timerDraft.deductedHours}
       onChange={e=>setTimerDraft(current=>({...current,deductedHours:e.target.value}))}
       placeholder="0 eller 15"/>
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

   <section className={styles.creditProject}>
    <div><span className={styles.eyebrow}>OPPDRAG / MOTREGNING</span>
     <h2>Avtalt verdi for eksisterende oppdrag</h2>
     <p>Legg inn verdien du skal arbeide for, for eksempel en bil. Klokken regner ned verdien i kroner og viser arbeid som overstiger avtalen.</p>
    </div>
    <div className={styles.creditProjectControls}>
     <label>Velg oppdrag
      <select value={selectedCreditOrder} onChange={e=>setSelectedCreditOrder(e.target.value)}>
       <option value="">Velg eksisterende oppdrag</option>
       {orders.map(o=><option key={o.id} value={o.id}>{o.orderNumber} · {o.sourceQuoteTitle||o.customerName||"Oppdrag"}</option>)}
      </select>
     </label>
     <button type="button" disabled={busy||!selectedCreditOrder}
      onClick={()=>showCreditEditor({id:null,orderId:selectedCreditOrder,hourlyRateOre:0})}>
      {credits.some(c=>c.scopeKey==="order:"+selectedCreditOrder)?"Endre avtalt verdi":"Legg inn avtalt verdi"}
     </button>
    </div>
    {selectedCreditOrder&&(()=>{const c=credits.find(x=>x.scopeKey==="order:"+selectedCreditOrder);
     if(!c||c.agreedValueOre<=0)return null;
     const spent=Number(laborOreByScope["order:"+selectedCreditOrder]||0);
     return <p className={styles.creditProjectSummary}>
      Avtalt: <b>{kroner(c.agreedValueOre)}</b> · Utført arbeid: <b>{kroner(spent)}</b> ·
      {spent<c.agreedValueOre?" Verdi igjen: ":" Til fakturering utover avtalen: "}
      <b>{kroner(Math.abs(c.agreedValueOre-spent))}</b>
     </p>;
    })()}
    {selectedCreditOrder&&<p className={styles.scopeBalance}>
     Samlet timessaldo for oppdraget: <strong>
      {hours((Number(netMinutesByScope["order:"+selectedCreditOrder])||0)+
       (active?.orderId===selectedCreditOrder?
        Math.max(0,(now-Date.parse(active.startedAt))/60000):0))} t
     </strong>
    </p>}
    <small>Dette er en intern beregning. Faktura eller motregningsbilag lages ikke automatisk.</small>
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
     <label>Timer<input inputMode="decimal" value={manual.durationHours} onChange={e=>setManual(current=>({...current,durationHours:e.target.value}))} placeholder="0 eller 7,5"/></label>
     <label>Eksisterende oppdrag
      <select value={manual.orderId} onChange={e=>applyOrder(setManual,e.target.value)}>
       <option value="">Ikke koblet til oppdrag</option>
       {orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.sourceQuoteTitle||order.customerName||"Oppdrag"}</option>)}
      </select>
     </label>
     <label>Prosjekt / jobb<input value={manual.projectLabel} onChange={e=>setManual(current=>({...current,projectLabel:e.target.value}))}/></label>
     <div className={styles.full}>
      <WorkClockCustomerPicker customers={customers} value={manual.customerRef}
       disabled={busy||Boolean(manual.orderId)} loadError={customerLoadError}
       onSelect={customer=>chooseCustomer(setManual,customer)}/>
     </div>
     {!manual.customerRef&&<label>Kunde (valgfritt navn)
      <input value={manual.customerLabel} onChange={e=>setManual(current=>({...current,customerLabel:e.target.value}))}/>
     </label>}
     <label>Timepris inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={manual.hourlyRate} onChange={e=>setManual(current=>({...current,hourlyRate:e.target.value}))}/></div></label>
     <label>Minustid (timer, kan være høyere enn arbeidstiden)
      <input type="text" inputMode="decimal" value={manual.deductedHours}
       onChange={e=>setManual(current=>({...current,deductedHours:e.target.value}))}
       placeholder="0 eller 1,5"/>
     </label>
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
       <td>{!activeRow
        ?<button type="button" className={styles.entryNameButton} onClick={()=>openEdit(entry)} disabled={busy}
          title="Åpne timeregistrering og rediger stemplingene">{entry.projectLabel||"Arbeid"}</button>
        :<b>{entry.projectLabel||"Arbeid"}</b>}
        <small>{entry.customerLabel||entry.note||""}</small>
        {!activeRow&&!entry.orderId&&Boolean(entry.startedAt&&entry.endedAt)&&
         <button type="button" className={styles.resumeButton} disabled={busy||Boolean(active)}
          title={active?"Stopp klokken som går før du fortsetter en annen.":"Fortsett på samme timeregistrering"}
          onClick={()=>resume(entry)}>▶ Fortsett</button>}
       </td>
       <td>{activeRow?<span className={styles.running}>Pågår</span>:<>
        {hours(entry.durationMinutes-(entry.deductedMinutes||0))} t
        {entry.deductedMinutes>0&&<small>−{formatDeductionHours(entry.deductedMinutes)} t lunsj/fratrekk</small>}
       </>}</td>
       <td>{activeRow?"—":kroner(cost.labor)}</td>
       <td>{entry.distanceKm?entry.distanceKm.toLocaleString("nb-NO",{maximumFractionDigits:2})+" km":"—"}</td>
       <td>{entry.tollOre?kroner(entry.tollOre):"—"}</td>
       <td><b>{activeRow?"—":kroner(cost.total)}</b></td>
       <td><div className={styles.entryActions}>
        {!activeRow&&<button type="button" className={styles.editButton} disabled={busy} onClick={()=>openEdit(entry)}>Rediger</button>}
       </div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </section>

   {creditEditor&&<div className={`${styles.modalBackdrop} ${styles.creditBackdrop}`}>
    <form className={styles.creditModal} onSubmit={saveCredit}>
     <div className={styles.modalHead}><h2>Avtalt verdi / motregning</h2>
      <button type="button" onClick={()=>setCreditEditor(null)}>×</button></div>
     <p>Registrer verdien du allerede har fått/avtalt å jobbe opp, for eksempel en bil.
      Faktisk arbeidstid blir beholdt. Når arbeidsverdien overstiger avtalen, vises overskytende beløp som fakturerbart.</p>
     <label>Avtalt verdi inkl. mva (kr)
      <input inputMode="decimal" required value={creditEditor.agreedValueKroner}
       onChange={e=>setCreditEditor(x=>({...x,agreedValueKroner:e.target.value}))} placeholder="F.eks. 5000"/>
     </label>
     <label>Hva gjelder motregningen?
      <input value={creditEditor.description} onChange={e=>setCreditEditor(x=>({...x,description:e.target.value}))}
       placeholder="F.eks. bil – avtalt arbeidsverdi"/>
     </label>
     <p>Dette er en beregning, ikke automatisk fakturering eller bokføring. Kontroller MVA og dokumentasjon ved byttehandel.</p>
     <div className={styles.modalActions}>
      <button type="button" onClick={()=>setCreditEditor(null)}>Avbryt</button>
      <button className={styles.saveButton} disabled={busy}>Lagre avtalt verdi</button>
     </div>
    </form>
   </div>}
   {editing&&<div className={styles.modalBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget)setEditing(null)}}>
    <form className={styles.modal} onSubmit={saveEdit}>
     <div className={styles.modalHead}><div><span className={styles.eyebrow}>REDIGER / FLYTT TIMER</span><h2>{editing.projectLabel||"Timeregistrering"}</h2></div><button type="button" onClick={()=>setEditing(null)}>×</button></div>
     <p className={styles.modalHelp}>Endre dato for å flytte timene til en annen dag eller måned.</p>
     <div className={styles.formGrid}>
      <label>Dato<input type="date" value={editing.workDate} onChange={e=>setEditing(current=>({...current,workDate:e.target.value}))}/></label>
      <label>Timer<input inputMode="decimal" value={editing.durationHours} onChange={e=>setEditing(current=>({...current,durationHours:e.target.value}))}
       disabled={editing.stampEditorEnabled} title={editing.stampEditorEnabled
        ?"Summen regnes automatisk fra stemplingene. Endre klokkeslettene nedenfor.":""}/></label>
      <label>Minustid (timer, kan være høyere enn arbeidstiden)
       <input type="text" inputMode="decimal"
        value={editing.deductedHours} onChange={e=>setEditing(current=>({...current,deductedHours:e.target.value}))}
        placeholder="0 eller 1,5"/>
      </label>
      <label>Eksisterende oppdrag
       <select value={editing.orderId} onChange={e=>applyOrder(setEditing,e.target.value)}>
        <option value="">Ikke koblet til oppdrag</option>
        {orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.sourceQuoteTitle||order.customerName||"Oppdrag"}</option>)}
       </select>
      </label>
      <label>Prosjekt / jobb<input value={editing.projectLabel} onChange={e=>setEditing(current=>({...current,projectLabel:e.target.value}))}/></label>
      <div className={styles.full}>
       <WorkClockCustomerPicker customers={customers} value={editing.customerRef}
        disabled={busy||Boolean(editing.orderId)} loadError={customerLoadError}
        onSelect={customer=>chooseCustomer(setEditing,customer)}/>
      </div>
      {!editing.customerRef&&<label>Kunde (valgfritt navn)
       <input value={editing.customerLabel} onChange={e=>setEditing(current=>({...current,customerLabel:e.target.value}))}/>
      </label>}
      <label>Timepris inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={editing.hourlyRate} onChange={e=>setEditing(current=>({...current,hourlyRate:e.target.value}))}/></div></label>
      <label>Km<input inputMode="decimal" value={editing.distanceKm} onChange={e=>setEditing(current=>({...current,distanceKm:e.target.value}))}/></label>
      <label>Km-sats inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={editing.kmRate} onChange={e=>setEditing(current=>({...current,kmRate:e.target.value}))}/></div></label>
      <label>Bom inkl. mva<div className={styles.money}><span>kr</span><input inputMode="decimal" value={editing.toll} onChange={e=>setEditing(current=>({...current,toll:e.target.value}))}/></div></label>
      <label className={styles.full}>Notat<input value={editing.note} onChange={e=>setEditing(current=>({...current,note:e.target.value}))}/></label>
     </div>
     <div className={styles.creditEditAction}>
      <button type="button" onClick={()=>showCreditEditor(editing)} disabled={busy}>
       {credits.some(c=>c.scopeKey===(editing.orderId?"order:"+editing.orderId:"entry:"+editing.id))?
        "Rediger avtalt verdi / motregning":"Legg til avtalt verdi / motregning"}
      </button>
      <p>En avtalt verdi gjelder hele oppdraget, eller bare denne registreringen hvis den ikke er koblet til et oppdrag.</p>
     </div>
     {editing.stampEditorEnabled&&<section className={styles.stampEditor}>
      <h3>Inn- og utstemplinger</h3>
      <p>Endre dato og klokkeslett for hver økt. Samlet tid regnes automatisk når du lagrer.</p>
      {editing.sessions.map((stamp,index)=><div className={styles.stampLine} key={index}>
       {stamp.historical?<div className={styles.stampLegacy}>
        <strong>Historiske timer: {hours(stamp.minutes)} t</strong>
        <span>Klokkeslettene ble ikke lagret tidligere. Timene beholdes uendret.</span>
       </div>:<>
        <label>Inn
         <input type="datetime-local" value={stamp.startedAt} required
          onChange={e=>setEditing(current=>({...current,sessions:current.sessions.map((item,i)=>
           i===index?{...item,startedAt:e.target.value}:item)}))}/>
        </label>
        <label>Ut
         <input type="datetime-local" value={stamp.endedAt} required
          onChange={e=>setEditing(current=>({...current,sessions:current.sessions.map((item,i)=>
           i===index?{...item,endedAt:e.target.value}:item)}))}/>
        </label>
        <button type="button" className={styles.removeStamp} onClick={()=>
         setEditing(current=>({...current,sessions:current.sessions.filter((_,i)=>i!==index)}))}>
         Fjern økt
        </button>
       </>}
      </div>)}
      <button type="button" className={styles.addStamp} onClick={()=>setEditing(current=>({
       ...current,sessions:[...current.sessions,{startedAt:"",endedAt:"",minutes:0,historical:false}]
      }))}>＋ Legg til stempling</button>
     </section>}
     <div className={styles.modalActions}><button type="button" className={styles.deleteButton} onClick={removeEntry} disabled={busy}>Slett</button><div><button type="button" className={styles.cancelButton} onClick={()=>setEditing(null)}>Avbryt</button><button className={styles.saveButton} disabled={busy}>Lagre endringer</button></div></div>
    </form>
   </div>}
  </div>
 </main>;
}
