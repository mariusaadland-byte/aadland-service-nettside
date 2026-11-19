"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {MAX_VIPPS_FEE_BATCH,feeQueueKey,vippsFeeQueue,validVippsFeePreview}
 from "../../../../../lib/vippsFeeQueue";
import styles from "./TripletexReceipts.module.css";

const kr=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const errorText=e=>e?.message||"Kontrollen kunne ikke fullføres.";
export default function VippsFeeQueuePanel({
 unit,from,to,feeRows,complete,unknownEntryTypes,onBusyChange,onRefresh,
 externallyDisabled=false
}){
 const [selected,setSelected]=useState([]);
 const [busy,setBusy]=useState(false);
 const [prepared,setPrepared]=useState(null);
 const [accepted,setAccepted]=useState(false);
 const [error,setError]=useState("");
 const [progress,setProgress]=useState("");
 const [completed,setCompleted]=useState([]);
 const [show,setShow]=useState(false);
 const checking=useRef(null);
 const queue=useMemo(()=>vippsFeeQueue({
  unit,rows:feeRows,complete,unknownEntryTypes
 }),[unit,feeRows,complete,unknownEntryTypes]);
 const keys=queue.eligible.map(feeQueueKey);
 const selectedRows=queue.eligible.filter(r=>selected.includes(feeQueueKey(r)));
 const disable=busy||externallyDisabled||unit!=="service";
 const changeSelection=(key,checked)=>{
  if(busy)return;
  setPrepared(null);setAccepted(false);setError("");
  setSelected(old=>checked?
   old.includes(key)||old.length>=MAX_VIPPS_FEE_BATCH?old:[...old,key]:
   old.filter(x=>x!==key));
 };
 useEffect(()=>{
  checking.current?.abort();checking.current=null;
  setSelected([]);setPrepared(null);setAccepted(false);
  setError("");setProgress("");setCompleted([]);setShow(false);
 },[unit,from,to]);
 useEffect(()=>()=>checking.current?.abort(),[]);
 async function checkSelected(){
  if(busy||externallyDisabled||!selectedRows.length||selectedRows.length>MAX_VIPPS_FEE_BATCH)return;
  const controller=new AbortController();
  checking.current=controller;
  setBusy(true);onBusyChange?.(true);setError("");setProgress("");
  setPrepared(null);setAccepted(false);setCompleted([]);
  try{
   let feeAccountId=null;
   const verified=[];
   for(let i=0;i<selectedRows.length;i++){
    const row=selectedRows[i];
    setProgress("Kontrollerer gebyr "+(i+1)+" av "+selectedRows.length+" mot Vipps og Tripletex …");
    const query=new URLSearchParams({unit:"service",date:row.date,feeId:row.pspReference});
    const response=await fetch("/api/admin/tripletex/vipps-fees?"+query,{
     cache:"no-store",signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!validVippsFeePreview(row,data))
     throw Error(data.error||"Gebyret "+row.date+" kunne ikke bekreftes sikkert. Ingen bilag er sendt.");
    const account=data.feeAccounts.find(a=>Number(a.number)===7770);
    if(feeAccountId!==null&&feeAccountId!==Number(account.id))
     throw Error("Gebyrkontoen er ikke entydig i Tripletex. Ingen bilag er sendt.");
    feeAccountId=Number(account.id);
    verified.push({row,digest:data.digest,feeAccountId});
   }
   if(!controller.signal.aborted)setPrepared({
    entries:verified,feeAccountId,amountOre:verified.reduce((sum,x)=>sum+x.row.amountOre,0)
   });
  }catch(e){
   if(!controller.signal.aborted)
    setError(errorText(e)+" Kontroller eventuelt gebyrene enkeltvis.");
  }finally{
   if(checking.current===controller)checking.current=null;
   setProgress("");setBusy(false);onBusyChange?.(false);
  }
 }
 async function transfer(){
  if(busy||externallyDisabled||!prepared?.entries?.length||!accepted)return;
  const list=prepared.entries;
  if(!window.confirm("Du er i ferd med å bokføre "+list.length+
   " bekreftede Vipps-gebyrer på til sammen "+kr(prepared.amountOre)+
   " til gebyrkonto 7770 i Tripletex, mot Vipps oppgjørskunde 10009. "+
   "Ingen bankutbetaling opprettes. Dette er ekte regnskapsbilag. "+
   "Bekrefter du at disse ikke allerede er bokført på annen måte?"))return;
  setBusy(true);onBusyChange?.(true);setError("");setCompleted([]);
  setProgress("");
  let added=0;
  try{
   for(let i=0;i<list.length;i++){
    const item=list[i];
    setProgress("Bokfører gebyr "+(i+1)+" av "+list.length+
     ". Ikke lukk fanen eller gjenta overføringen.");
    // Intentionally no automatic retry, even on timeout/connection loss.
    const response=await fetch("/api/admin/tripletex/vipps-fees",{
     method:"POST",headers:{"Content-Type":"application/json"},
     cache:"no-store",
     body:JSON.stringify({
      action:"record-retained-fee",unit:"service",
      date:item.row.date,feeId:item.row.pspReference,
      expectedDigest:item.digest,feeAccountId:item.feeAccountId,
      confirmed:true,notImportedPreviously:true
     })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok||!Number.isSafeInteger(Number(data.voucherId))||Number(data.voucherId)<=0)
     throw Error("Stoppet på "+item.row.date+": "+(data.error||
      "Tripletex-bokføringen er uavklart. Ikke forsøk samme gebyr på nytt før det er kontrollert."));
    added++;
    setCompleted(old=>[...old,{date:item.row.date,amountOre:item.row.amountOre,
     voucherId:data.voucherId}]);
   }
  }catch(e){
   setError(errorText(e)+" Resten av køen er ikke sendt. "+
    "Kontroller Tripletex og oppdater oversikten før du gjør noe mer.");
  }finally{
   setPrepared(null);setAccepted(false);setSelected([]);
   setProgress("");setBusy(false);onBusyChange?.(false);
   if(added)try{await onRefresh?.();}catch{
    setError(old=>old+" Bokføringsstatus må oppdateres ved å trykke «Vis lagrede rapporter».");
   }
  }
 }
 return <section style={{
  margin:"16px 0",padding:14,border:"1px solid #cbd6dd",borderRadius:10
 }}>
  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
   justifyContent:"space-between"}}>
   <div>
    <h3 style={{fontSize:18,margin:"0 0 4px"}}>Samlet føring av Vipps-gebyrer</h3>
    <p className={styles.hint} style={{margin:0}}>
     {queue.confirmedCount||0} bekreftet bokført · {queue.eligible.length} nye gebyrer
    </p>
   </div>
   {queue.eligible.length>0&&<button type="button" onClick={()=>setShow(x=>!x)}
    disabled={disable} style={{padding:"10px 14px",borderRadius:8}}>
    {show?"Skjul gebyrkø":"Vis nye gebyrer"}
   </button>}
  </div>
  {!queue.eligible.length&&!queue.issues.length&&<p className={styles.hint}>
   Ingen nye trukne gebyrer å bokføre i denne perioden.</p>}
  {queue.issues.length>0&&<p className={styles.hint} role="status">
   {queue.issues.join(" ")} Manuell gjennomgang er fortsatt tilgjengelig i detaljlisten nedenfor.
  </p>}
  {completed.length>0&&<div role="status" style={{
   margin:"10px 0",padding:10,borderRadius:8,border:"1px solid #a7d2b0"
  }}>
   <strong>{completed.length} gebyrer bekreftet bokført i Tripletex</strong>
   {completed.map((x,i)=><div key={x.voucherId+"-"+i}>
    {x.date}: {kr(x.amountOre)} – bilags-ID {x.voucherId}</div>)}
  </div>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {busy&&progress&&<p role="status">{progress}</p>}
  {show&&queue.eligible.length>0&&<div style={{marginTop:12}}>
   <p className={styles.hint}>Velg inntil {MAX_VIPPS_FEE_BATCH} gebyrer. Det gjøres en
    separat sikker forhåndskontroll for hvert gebyr før noe bokføres. Bilagene
    sendes ett om gangen og køen stopper ved første feil.</p>
   <button type="button" disabled={disable} onClick={()=>{
    setSelected(keys.slice(0,MAX_VIPPS_FEE_BATCH));
    setPrepared(null);setAccepted(false);setError("");
   }} style={{marginBottom:8}}>Velg opptil {MAX_VIPPS_FEE_BATCH} nye</button>
   <div style={{display:"grid",gap:7}}>
    {queue.eligible.map(row=><label key={feeQueueKey(row)}
     style={{display:"flex",alignItems:"center",gap:9,padding:8,
      border:"1px solid #e1e4e6",borderRadius:7,flexWrap:"wrap"}}>
     <input type="checkbox" disabled={disable||
      (!selected.includes(feeQueueKey(row))&&selected.length>=MAX_VIPPS_FEE_BATCH)}
      checked={selected.includes(feeQueueKey(row))}
      onChange={event=>changeSelection(feeQueueKey(row),event.target.checked)}/>
     <strong>{row.date}</strong>
     <span>{kr(row.amountOre)}</span>
     <small style={{opacity:0.7}}>{row.pspReference}</small>
    </label>)}
   </div>
   <p>Valgt: <strong>{selectedRows.length}</strong> · {kr(selectedRows.reduce((s,x)=>s+x.amountOre,0))}</p>
   <button type="button" disabled={disable||!selectedRows.length}
    onClick={checkSelected} className={styles.primary}>
    Kontroller {selectedRows.length} valgte mot Tripletex
   </button>
   {prepared&&<div style={{marginTop:12,padding:12,
    border:"1px solid #c0d4c7",borderRadius:9}}>
    <strong>{prepared.entries.length} gebyrer ferdig kontrollert</strong>
    <p style={{margin:"7px 0"}}>Totalt {kr(prepared.amountOre)} ·
     kostnadskonto 7770 · Vipps oppgjørskunde 10009 · bankutbetaling 0 kr.</p>
    <label style={{display:"flex",alignItems:"start",gap:8,margin:"10px 0"}}>
     <input type="checkbox" checked={accepted} disabled={busy}
      onChange={event=>setAccepted(event.target.checked)}/>
     Jeg har kontrollert at alle valgte gebyrer faktisk er trukket av Vipps,
     og at ingen er bokført eller fakturert separat i Tripletex.
    </label>
    <button type="button" disabled={disable||!accepted} onClick={transfer}
     style={{background:"#23394c",color:"white",fontWeight:700,
      padding:"12px 15px",borderRadius:8}}>
     Bokfør {prepared.entries.length} godkjente gebyrer i Tripletex
    </button>
    <p className={styles.hint}>Ingen automatisk gjentakelse ved feil. Eksisterende
     bilag, korrigeringer og uavklarte poster er sperret for masseføring.</p>
   </div>}
  </div>}
 </section>;
}
