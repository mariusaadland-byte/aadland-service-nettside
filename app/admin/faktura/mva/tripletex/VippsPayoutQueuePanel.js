"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {MAX_VIPPS_PAYOUT_BATCH,payoutQueueKey,
 vippsPayoutQueue,validVippsPayoutPreview} from "../../../../../lib/vippsPayoutQueue";
import styles from "./TripletexReceipts.module.css";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
 .format(Number(ore||0)/100);
const message=e=>e?.message||"Kontrollen av utbetalingene feilet.";

export default function VippsPayoutQueuePanel({
 unit,from,to,payoutRows,complete,unknownEntryTypes,
 onBusyChange,onRefresh,externallyDisabled=false
}){
 const [expanded,setExpanded]=useState(false);
 const [selected,setSelected]=useState([]);
 const [prepared,setPrepared]=useState(null);
 const [approvals,setApprovals]=useState({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [progress,setProgress]=useState("");
 const [completed,setCompleted]=useState([]);
 const previewAbort=useRef(null);
 const queue=useMemo(()=>vippsPayoutQueue({
  unit,rows:payoutRows,complete,unknownEntryTypes
 }),[unit,payoutRows,complete,unknownEntryTypes]);
 const disabled=busy||externallyDisabled||unit!=="service";
 const selectedRows=queue.eligible.filter(row=>selected.includes(payoutQueueKey(row)));
 const canTransfer=Boolean(prepared?.length)&&prepared.every(item=>{
  const checked=approvals[payoutQueueKey(item.row)];
  return checked?.bankId&&checked.received&&checked.notImported&&
   item.bankAccounts.some(a=>Number(a.id)===Number(checked.bankId));
 });
 const clearPreflight=()=>{setPrepared(null);setApprovals({});};
 useEffect(()=>{
  previewAbort.current?.abort();previewAbort.current=null;
  setExpanded(false);setSelected([]);setPrepared(null);
  setApprovals({});setError("");setProgress("");setCompleted([]);
 },[unit,from,to]);
 useEffect(()=>()=>previewAbort.current?.abort(),[]);
 function toggle(row,isChecked){
  if(disabled)return;
  const id=payoutQueueKey(row);
  clearPreflight();setError("");
  setSelected(list=>isChecked?
   list.includes(id)||list.length>=MAX_VIPPS_PAYOUT_BATCH?list:[...list,id]:
   list.filter(x=>x!==id));
 }
 async function review(){
  if(disabled||!selectedRows.length||selectedRows.length>MAX_VIPPS_PAYOUT_BATCH)return;
  const controller=new AbortController();
  previewAbort.current=controller;
  setBusy(true);onBusyChange?.(true);setError("");setProgress("");
  clearPreflight();setCompleted([]);
  try{
   const checked=[];
   const initialApprovals={};
   for(let i=0;i<selectedRows.length;i++){
    const row=selectedRows[i];
    setProgress("Kontrollerer oppgjør "+(i+1)+" av "+selectedRows.length+
     " mot Vipps, fakturaer og Tripletex …");
    const query=new URLSearchParams({unit:"service",date:row.date,
     payoutId:row.pspReference});
    const response=await fetch("/api/admin/tripletex/vipps-transfer?"+query,{
     cache:"no-store",signal:controller.signal
    });
    const preview=await response.json().catch(()=>({}));
    if(!response.ok||!validVippsPayoutPreview(row,preview))
     throw Error(preview.error||"Oppgjøret "+row.date+
      " kunne ikke kontrolleres sikkert. Ingen bilag er opprettet.");
    const feeAccount=preview.feeAccounts.find(a=>Number(a.number)===7770);
    const id=payoutQueueKey(row);
    initialApprovals[id]={
     bankId:preview.bankAccounts.length===1?String(preview.bankAccounts[0].id):"",
     received:false,notImported:false
    };
    checked.push({row,digest:preview.digest,plan:preview.plan,
     bankAccounts:preview.bankAccounts,feeAccountId:Number(feeAccount.id)});
   }
   if(!controller.signal.aborted){
    setPrepared(checked);setApprovals(initialApprovals);
   }
  }catch(e){
   if(!controller.signal.aborted)setError(message(e)+
    " Ingen oppgjør er sendt. Kontroller eventuelt enkeltoppgjøret nedenfor.");
  }finally{
   if(previewAbort.current===controller)previewAbort.current=null;
   setProgress("");setBusy(false);onBusyChange?.(false);
  }
 }
 function changeApproval(id,field,value){
  if(disabled)return;
  setApprovals(old=>({...old,[id]:{...old[id],[field]:value}}));
 }
 async function transfer(){
  if(disabled||!canTransfer)return;
  const items=prepared;
  const confirmation=items.map(item=>{
   const approval=approvals[payoutQueueKey(item.row)];
   const bank=item.bankAccounts.find(x=>Number(x.id)===Number(approval?.bankId));
   return {item,bankAccountId:Number(bank.id)};
  });
  // Each item was explicitly checked against its own REAL bank transaction,
  // and the destination bank account was chosen separately for every payout.
  if(!window.confirm("Bokføre "+items.length+" reelle Vipps-utbetalinger på "+
   money(items.reduce((sum,x)=>sum+x.plan.payoutOre,0))+" i Tripletex? "+
   "Du bekrefter at hvert beløp er mottatt på valgt bankkonto og IKKE allerede "+
   "er bokført/importert. Hvert bilag føres separat, og behandlingen stopper "+
   "ved første feil. Dette oppretter ekte regnskapsbilag."))return;
  setBusy(true);onBusyChange?.(true);setError("");setCompleted([]);
  let posted=0;
  try{
   for(let i=0;i<confirmation.length;i++){
    const {item,bankAccountId}=confirmation[i];
    setProgress("Overfører bankoppgjør "+(i+1)+" av "+confirmation.length+
     " — ikke send eller start på nytt dersom det blir avbrutt.");
    // No automatic retry of a non-idempotent Tripletex journal request.
    const response=await fetch("/api/admin/tripletex/vipps-transfer",{
     method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
     body:JSON.stringify({action:"transfer",unit:"service",
      date:item.row.date,payoutId:item.row.pspReference,
      bankAccountId,feeAccountId:item.feeAccountId,
      expectedDigest:item.digest,confirmed:true,
      bankReceived:true,notImportedPreviously:true})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok||!Number.isSafeInteger(Number(data.voucherId))||
     Number(data.voucherId)<=0)
     throw Error("Stoppet på "+item.row.date+": "+(data.error||
      "Tripletex-bokføringen er uavklart. Ikke prøv på nytt før regnskapet er kontrollert."));
    posted++;
    setCompleted(prev=>[...prev,{date:item.row.date,
     amountOre:item.plan.payoutOre,voucherId:data.voucherId}]);
   }
  }catch(e){
   setError(message(e)+" Resterende oppgjør er IKKE sendt. "+
    "Kontroller Tripletex og oppdater rapporten før et nytt forsøk.");
  }finally{
   clearPreflight();setSelected([]);
   setProgress("");
   if(posted)try{await onRefresh?.();}catch{
    setError(prev=>prev+" Oppdater oversikten med «Vis lagrede rapporter».");
   }
   setBusy(false);onBusyChange?.(false);
  }
 }
 return <section style={{padding:14,border:"1px solid #cbd6dd",
  borderRadius:10,margin:"16px 0"}}>
  <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",
   justifyContent:"space-between",gap:10}}>
   <div>
    <h3 style={{margin:"0 0 4px",fontSize:18}}>
     Samlet kontroll av Vipps-utbetalinger
    </h3>
    <p className={styles.hint} style={{margin:0}}>
     {queue.confirmedCount} bokført · {queue.eligible.length} planlagte uten registrert overføring
     {queue.reviewCount>0?" · "+queue.reviewCount+" må kontrolleres":""}
    </p>
   </div>
   {queue.eligible.length>0&&<button type="button" disabled={disabled}
    onClick={()=>setExpanded(x=>!x)}
    style={{padding:"10px 14px",borderRadius:8}}>
    {expanded?"Skjul oppgjør":"Vis oppgjør som kan kontrolleres"}
   </button>}
  </div>
  {!queue.eligible.length&&!queue.issues.length&&<p className={styles.hint}>
   Ingen nye planlagte bankutbetalinger å kontrollere i valgt periode.
  </p>}
  {queue.issues.length>0&&<p role="status" className={styles.hint}>
   {queue.issues.join(" ")} Detaljvisningen nedenfor er tilgjengelig for manuell kontroll.
  </p>}
  <p className={styles.hint} style={{margin:"9px 0"}}>
   Vipps viser planlagte utbetalinger, ikke bekreftede bankinnskudd.
   Ingen oppgjør bokføres før du har kontrollert bankkonto, mottatt beløp
   og tidligere import for hver utbetaling.
  </p>
  {completed.length>0&&<div role="status" style={{padding:10,borderRadius:8,
   border:"1px solid #a7d2b0",margin:"10px 0"}}>
   <strong>{completed.length} oppgjørsbilag bekreftet i Tripletex</strong>
   {completed.map(row=><p key={row.voucherId} style={{margin:"5px 0"}}>
    {row.date} · {money(row.amountOre)} · bilags-ID {row.voucherId}
   </p>)}
  </div>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {busy&&progress&&<p role="status">{progress}</p>}
  {expanded&&queue.eligible.length>0&&<div style={{marginTop:12}}>
   <p className={styles.hint}>Velg opptil {MAX_VIPPS_PAYOUT_BATCH} planlagte oppgjør.
    Kontrollen må godkjenne alle før bankbekreftelsene blir tilgjengelige.</p>
   <button type="button" disabled={disabled} onClick={()=>{
    setSelected(queue.eligible.slice(0,MAX_VIPPS_PAYOUT_BATCH).map(payoutQueueKey));
    clearPreflight();setError("");
   }} style={{marginBottom:9}}>Velg opptil {MAX_VIPPS_PAYOUT_BATCH}</button>
   <div style={{display:"grid",gap:7}}>
    {queue.eligible.map(row=><label key={payoutQueueKey(row)}
     style={{display:"flex",gap:9,alignItems:"center",flexWrap:"wrap",
      padding:8,borderRadius:7,border:"1px solid #e1e4e6"}}>
     <input type="checkbox" disabled={disabled||
      (!selected.includes(payoutQueueKey(row))&&
       selected.length>=MAX_VIPPS_PAYOUT_BATCH)}
      checked={selected.includes(payoutQueueKey(row))}
      onChange={e=>toggle(row,e.target.checked)}/>
     <strong>{row.date}</strong><span>{money(row.amountOre)}</span>
     <small style={{opacity:0.75}}>{row.pspReference}</small>
    </label>)}
   </div>
   <p>Valgt: <strong>{selectedRows.length}</strong> ·
    {money(selectedRows.reduce((sum,row)=>sum+row.amountOre,0))}</p>
   <button type="button" className={styles.primary}
    disabled={disabled||selectedRows.length===0} onClick={review}>
    Kontroller {selectedRows.length} valgte oppgjør
   </button>
   {prepared?.length>0&&<div style={{marginTop:14}}>
    <strong>{prepared.length} oppgjør kontrollert – bekreft mottak hver for seg</strong>
    <div style={{display:"grid",gap:12,marginTop:10}}>
     {prepared.map(item=>{
      const id=payoutQueueKey(item.row);
      const choice=approvals[id]||{};
      return <div key={id} style={{border:"1px solid #cad6d6",
       borderRadius:9,padding:12}}>
       <strong>{item.row.date} · {money(item.plan.payoutOre)} til bank</strong>
       <p style={{margin:"7px 0",fontSize:13}}>
        Fakturabetalinger: {money(item.plan.grossOre)} · gebyrer: {money(item.plan.feeOre)}
        {" "}· allerede bokførte gebyrer: {money(item.plan.previouslyBookedFeeOre)}
       </p>
       <p className={styles.hint} style={{margin:"6px 0"}}>
        {item.plan.paymentCount} betalinger er kontrollert mot Tripletex.
        Planlagt Vipps-utbetaling er ikke bankkvittering.
       </p>
       <label style={{display:"grid",gap:4}}>
        Bankkonto som faktisk har mottatt dette beløpet
        <select value={choice.bankId||""} disabled={disabled}
         onChange={e=>changeApproval(id,"bankId",e.target.value)}>
         <option value="">Velg bankkonto</option>
         {item.bankAccounts.map(a=><option key={a.id} value={a.id}>
          {a.number} – {a.name}</option>)}
        </select>
       </label>
       <label style={{display:"flex",alignItems:"start",gap:8,marginTop:12}}>
        <input type="checkbox" disabled={disabled} checked={Boolean(choice.received)}
         onChange={e=>changeApproval(id,"received",e.target.checked)}/>
        Jeg har sett dette nøyaktige beløpet innbetalt på den valgte bankkontoen.
       </label>
       <label style={{display:"flex",alignItems:"start",gap:8,marginTop:9}}>
        <input type="checkbox" disabled={disabled} checked={Boolean(choice.notImported)}
         onChange={e=>changeApproval(id,"notImported",e.target.checked)}/>
        Jeg har kontrollert at dette oppgjøret ikke allerede er bokført
        eller importert i Tripletex/bankintegrasjonen.
       </label>
      </div>;
     })}
    </div>
    <button type="button" disabled={disabled||!canTransfer} onClick={transfer}
     style={{marginTop:12,padding:"12px 14px",borderRadius:8,
      color:"white",background:"#23394c",fontWeight:700}}>
     Bokfør {prepared.length} bekreftede bankoppgjør i Tripletex
    </button>
    <p className={styles.hint}>Oppgjørene bokføres ett om gangen. Ved feil
     stopper resten, og ukjente utfall blir aldri forsøkt automatisk igjen.
     Etter bokføring må åpne poster lukkes og banktransaksjonene avstemmes.</p>
   </div>}
  </div>}
 </section>;
}
