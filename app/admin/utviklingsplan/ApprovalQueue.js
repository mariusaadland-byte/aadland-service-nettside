"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {APPROVAL_GROUPS,developmentApprovalQueue} from "../../../lib/developmentApprovalChecklist";
import {developmentTaskLink} from "../../../lib/developmentTaskLinks";
import styles from "./roadmap.module.css";

export default function ApprovalQueue({tasks=[],savingId="",onApprove=async()=>false}){
 const queue=useMemo(()=>developmentApprovalQueue(tasks),[tasks]);
 const [selectedId,setSelectedId]=useState(null);
 const [checks,setChecks]=useState({});
 const [showAll,setShowAll]=useState(false);
 const [busy,setBusy]=useState(false);
 const current=queue.find(x=>x.id===selectedId)||queue[0]||null;
 const criteria=current?.approval.checks||[];
 const marked=criteria.filter((_,i)=>checks[current?.id]?.[i]===true).length;
 const done=criteria.length>0&&marked===criteria.length;
 const remaining={
  quick:queue.filter(x=>x.approval.group==="quick").length,
  workflow:queue.filter(x=>x.approval.group==="workflow").length,
  dependent:queue.filter(x=>x.approval.group==="dependent").length
 };
 async function approveCurrent(){
  if(!current||!done||savingId||busy)return;
  if(!window.confirm("Godkjenne «"+current.title+"» som FERDIG?\n\n"+
   "Dette bekrefter at alle kontrollpunktene er gjennomgått i faktisk system, "+
   "ikke bare at koden finnes. Du kan fortsatt endre status tilbake senere."))return;
  setBusy(true);
  try{
   const ok=await onApprove(current);
   if(ok){
    setSelectedId(null);
    setChecks({});
   }
  }finally{setBusy(false);}
 }
 function next(){
  if(!queue.length)return;
  const index=queue.findIndex(x=>x.id===current?.id);
  const other=queue[(index+1)%queue.length];
  setSelectedId(other.id);
 }
 return <section className={styles.approvalBoard} aria-label="Godkjenningskø én oppgave om gangen">
  <div className={styles.approvalHeader}>
   <div>
    <p className={styles.approvalEyebrow}>KONTROLL FØR FERDIGSTILLING</p>
    <h2>Godkjenningskø – én oppgave om gangen</h2>
    <p>Vi tester konkrete funksjoner før de merkes ferdige.
     Ingen oppgave lukkes automatisk. Merk kontrollpunktene etter at du faktisk har prøvd dem.</p>
   </div>
   <div className={styles.approvalCount}><strong>{queue.length}</strong><span>til godkjenning</span></div>
  </div>
  <div className={styles.approvalBuckets}>
   <span><strong>{remaining.quick}</strong> kan kontrolleres i admin</span>
   <span><strong>{remaining.workflow}</strong> krever full testflyt</span>
   <span><strong>{remaining.dependent}</strong> avventer ekstra oppsett eller kontroll</span>
  </div>
  {current?
   <div className={styles.approvalMain}>
    <div className={styles.approvalTaskTop}>
     <span>Oppgave {Math.max(1,queue.findIndex(x=>x.id===current.id)+1)} av {queue.length}</span>
     <span>{APPROVAL_GROUPS[current.approval.group]?.label}</span>
    </div>
    <h3>{current.title}</h3>
    <p className={styles.approvalDesc}>{current.description}</p>
    {current.approval.dependency&&
     <p className={styles.approvalDependency}><strong>Før godkjenning: </strong>
      {current.approval.dependency}
     </p>}
    <div className={styles.approvalSteps}>
     <div className={styles.approvalStepHead}><strong>Dette må fungere</strong>
      <span>{marked} av {criteria.length} kontrollert</span></div>
     {criteria.map((step,i)=><label key={i} className={styles.approvalStep}>
      <input type="checkbox" checked={checks[current.id]?.[i]===true}
       disabled={Boolean(savingId)||busy}
       onChange={e=>setChecks(prev=>({...prev,[current.id]:{
        ...(prev[current.id]||{}),[i]:e.target.checked
       }}))}/>
      <span>{step}</span>
     </label>)}
    </div>
    <div className={styles.approvalActions}>
     {developmentTaskLink(current)&&
      <Link className={styles.approvalOpen} href={developmentTaskLink(current)}>
       Åpne funksjonen for testing
      </Link>}
     <button type="button" onClick={next} disabled={Boolean(savingId)||busy}
      className={styles.approvalSkip}>Neste / ta denne senere</button>
     <button type="button" onClick={approveCurrent}
      disabled={!done||Boolean(savingId)||busy} className={styles.approvalDone}>
      {busy||savingId===current.id?"Lagrer godkjenning …":
       "Godkjenn og merk ferdig"}
     </button>
    </div>
    {!done&&<p className={styles.approvalFooter}>
     Godkjenningsknappen åpnes først når alle punktene er testet og huket av.
     Ikke bruk ekte kundedata til prøvebetalinger eller testutsendinger.
    </p>}
   </div>:
   <p className={styles.approvalEmpty}>Alle oppgaver i «Klar for testing» er nå vurdert.
    Nye oppgaver som blir klare til test, dukker opp her automatisk.</p>}
  {queue.length>1&&<div className={styles.approvalQueueList}>
   <button type="button" onClick={()=>setShowAll(v=>!v)}
    aria-expanded={showAll} className={styles.approvalListToggle}>
    {showAll?"Skjul oppgavelisten":"Vis hele godkjenningslisten ("+queue.length+")"}
   </button>
   {showAll&&<div className={styles.approvalAllItems}>
    {queue.map((item,i)=><button key={item.id} type="button"
     className={styles.approvalListItem}
     aria-current={current?.id===item.id?"step":undefined}
     onClick={()=>setSelectedId(item.id)}>
     <span>{i+1}. {item.title}</span>
     <small>{APPROVAL_GROUPS[item.approval.group]?.label}</small>
    </button>)}
   </div>}
  </div>}
 </section>;
}
