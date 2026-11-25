"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {APPROVAL_GROUPS,developmentApprovalQueue} from "../../../lib/developmentApprovalChecklist";
import {developmentTaskLink} from "../../../lib/developmentTaskLinks";
import {
 TEST_WIZARD_STORAGE_KEY,sanitizeTestProgress,testWizardCurrentStep,
 markTestWizardStep,wizardAllPassed
} from "../../../lib/developmentTestWizard";
import styles from "./roadmap.module.css";

export default function ApprovalQueue({
 tasks=[],savingId="",onApprove=async()=>false,onReport=async()=>false,initialScope="service-final"
}){
 const allQueue=useMemo(()=>developmentApprovalQueue(tasks),[tasks]);
 const [scope,setScope]=useState(initialScope);
 const queue=useMemo(()=>allQueue.filter(t=>scope==="service-final"?t.id.startsWith("service-final-"):scope==="rental-final"?t.id.startsWith("rental-final-"):!t.id.startsWith("service-final-")&&!t.id.startsWith("rental-final-")),[allQueue,scope]);
 const finalCount=allQueue.filter(t=>t.id.startsWith("service-final-")).length;
 const rentalCount=allQueue.filter(t=>t.id.startsWith("rental-final-")).length;
 const rentalApproved=tasks.filter(t=>t.id.startsWith("rental-final-")&&t.status==="done").length;
 const earlierCount=allQueue.length-finalCount-rentalCount;
 const [selectedId,setSelectedId]=useState(null);
 const [isOpen,setIsOpen]=useState(false);
 const [progress,setProgress]=useState({});
 const [hydrated,setHydrated]=useState(false);
 const [showAll,setShowAll]=useState(false);
 const [busy,setBusy]=useState(false);
 const [showIssue,setShowIssue]=useState(false);
 const [issueText,setIssueText]=useState("");
 const [notice,setNotice]=useState("");
 const current=queue.find(x=>x.id===selectedId)||queue[0]||null;
 const criteria=current?.approval.checks||[];
 const savedProgress=current?progress[current.id]:null;
 const step=testWizardCurrentStep(savedProgress,criteria.length);
 const passedCount=criteria.filter((_,i)=>savedProgress?.passed?.includes(i)).length;
 const done=wizardAllPassed(savedProgress,criteria.length);
 const remaining={
  quick:queue.filter(x=>x.approval.group==="quick").length,
  workflow:queue.filter(x=>x.approval.group==="workflow").length,
  dependent:queue.filter(x=>x.approval.group==="dependent").length
 };
 useEffect(()=>{
  try{
   const raw=JSON.parse(window.localStorage.getItem(TEST_WIZARD_STORAGE_KEY)||"{}");
   setProgress(sanitizeTestProgress(raw,allQueue));
  }catch{setProgress({});}
  setHydrated(true);
  // Queue is loaded before ApprovalQueue is mounted.
 },[]);
 useEffect(()=>{
  if(!hydrated)return;
  try{window.localStorage.setItem(TEST_WIZARD_STORAGE_KEY,JSON.stringify(progress));}
  catch{/* Private browsing or storage restrictions: testing still works this session. */}
 },[progress,hydrated]);
 useEffect(()=>{
  if(!isOpen)return;
  const previous=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const closeOnEsc=e=>{if(e.key==="Escape"&&!busy&&!savingId)setIsOpen(false);};
  document.addEventListener("keydown",closeOnEsc);
  return()=>{
   document.body.style.overflow=previous;
   document.removeEventListener("keydown",closeOnEsc);
  };
 },[isOpen,busy,savingId]);
 function openTask(task){
  if(!task)return;
  setSelectedId(task.id);
  setNotice("");
  setShowIssue(false);
  setIssueText(progress[task.id]?.issue||"");
  setIsOpen(true);
 }
 function goNext(){
  if(!queue.length){setIsOpen(false);return;}
  const index=queue.findIndex(x=>x.id===current?.id);
  const next=queue[(index+1)%queue.length];
  if(next){
   setSelectedId(next.id);
   setIssueText(progress[next.id]?.issue||"");
   setShowIssue(false);
   setNotice("");
  }
 }
 function markPassed(){
  if(!current||busy||savingId||done)return;
  const updated=markTestWizardStep(savedProgress,step,criteria.length);
  setProgress(prev=>({...prev,[current.id]:updated}));
  setShowIssue(false);
  setNotice(updated.passed.length===criteria.length?
   "Alle stegene er kontrollert. Nå kan du godkjenne hele oppgaven.":"Steget er kontrollert. Her er neste test.");
 }
 function resetCurrent(){
  if(!current||busy||savingId)return;
  if(!window.confirm("Starte denne testen på nytt? Tidligere avkrysninger for denne testen fjernes fra nettleseren."))return;
  setProgress(prev=>({...prev,[current.id]:{passed:[],step:0,issue:""}}));
  setIssueText("");setShowIssue(false);setNotice("");
 }
 async function approveCurrent(){
  if(!current||!done||savingId||busy)return;
  if(!window.confirm("Godkjenne «"+current.title+"» som FERDIG?\n\n"+
   "Dette bekrefter at du faktisk har prøvd alle "+criteria.length+
   " teststegene. Oppgaven fjernes fra testkøen."))return;
  setBusy(true);
  try{
   const ok=await onApprove(current);
   if(ok){
    setProgress(prev=>{
     const next={...prev};delete next[current.id];return next;
    });
    const next=queue.find(x=>x.id!==current.id);
    if(next){
     setSelectedId(next.id);
     setIssueText(progress[next.id]?.issue||"");
     setShowIssue(false);
     setNotice("Oppgaven er ferdigmerket. Her er neste test.");
    }else{
     setSelectedId(null);
     setIsOpen(false);
    }
   }
  }finally{setBusy(false);}
 }
 async function reportIssue(){
  if(!current||busy||savingId)return;
  const description=issueText.trim();
  if(description.length<6){
   setNotice("Skriv kort hva som ikke fungerer før du lagrer feilen.");
   return;
  }
  setBusy(true);setNotice("");
  try{
   const ok=await onReport(current,description);
   if(ok){
    setProgress(prev=>({...prev,[current.id]:{
     passed:prev[current.id]?.passed||[],step,
     issue:description
    }}));
    if(queue.length>1){
     const next=queue.find(x=>x.id!==current.id);
     openTask(next);
     setNotice("Feilen er lagret i utviklingsplanen. Vi lar oppgaven stå til testing og går videre.");
    }else{
     setIsOpen(false);
    }
   }
  }finally{setBusy(false);}
 }
 return <section className={styles.approvalBoard}
  aria-label="Godkjenningskø én oppgave om gangen">
  <div className={styles.approvalHeader}>
   <div>
    <p className={styles.approvalEyebrow}>TEST OG GODKJENN</p>
    <h2>Trykk på en boks for å starte testen</h2>
    <p>Du får ett teststeg om gangen i et eget vindu. Når steget
     fungerer, trykker du «Fungerer – neste steg». Du trenger ikke huske
     hva du skal teste.</p>
   </div>
   <div className={styles.approvalCount}><strong>{queue.length}</strong><span>venter på test</span></div>
  </div>
  <div className={styles.approvalBuckets}>
   <button type="button" className={styles.approvalOpen} aria-pressed={scope==="service-final"} disabled={busy||Boolean(savingId)} onClick={()=>{setScope("service-final");setSelectedId(null);setIsOpen(false);setShowAll(false);}}>Service-sluttkontroll ({finalCount})</button>
   <button type="button" className={styles.approvalOpen} aria-pressed={scope==="rental-final"} disabled={busy||Boolean(savingId)} onClick={()=>{setScope("rental-final");setSelectedId(null);setIsOpen(false);setShowAll(true);}}>Utleie-sluttkontroll ({rentalCount})</button>
   <button type="button" className={styles.approvalOpen} aria-pressed={scope==="earlier"} disabled={busy||Boolean(savingId)} onClick={()=>{setScope("earlier");setSelectedId(null);setIsOpen(false);setShowAll(false);}}>Tidligere oppgaver ({earlierCount})</button>
  </div>
  {scope==="rental-final"&&<p className={styles.wizardTip}>Aadland Utleie · {rentalApproved} av 27 godkjent. Bruk bare lesende kontroll i produksjon, isolert testdatabase for endringer og særskilt godkjent betalings- og e-postoppsett. Testboksene er ikke et isolert testmiljø. Ikke godkjenn manglende funksjoner eller oppsett.</p>}
  {scope==="service-final"&&<p className={styles.wizardTip}>Kun Aadland Service. Bruk isolerte testdata og egne testkontoer. Godkjenn bare etter faktisk kontroll; uavklart ekstern bekreftelse skal stå åpen. Delsteg lagres i denne nettleseren, endelig godkjenning lagres på serveren.</p>}
  <div className={styles.approvalBuckets}>
   <span><strong>{remaining.quick}</strong> raske kontroller</span>
   <span><strong>{remaining.workflow}</strong> hele testflyter</span>
   <span><strong>{remaining.dependent}</strong> ekstra oppsett</span>
  </div>
  {queue.length?
   <>
    <div className={styles.wizardTileGrid}>
     {(showAll||scope==="rental-final"?queue:queue.slice(0,6)).map((task,i)=>{
      const checkpoint=progress[task.id];
      const total=task.approval.checks.length;
      const passed=checkpoint?.passed?.length||0;
      return <button key={task.id} type="button"
       className={styles.wizardTile} onClick={()=>openTask(task)}
       disabled={Boolean(savingId)||busy}>
       <span className={styles.wizardTileIndex}>Test {i+1}</span>
       <strong>{task.title}</strong>
       <span>{APPROVAL_GROUPS[task.approval.group]?.label}</span>
       <span className={styles.wizardTileFooter}>
        {passed} av {total} steg kontrollert <b>{passed?"Fortsett test":"Start test"}</b>
       </span>
      </button>
     })}
    </div>
    {scope!=="rental-final"&&queue.length>6&&<button className={styles.approvalListToggle}
     type="button" onClick={()=>setShowAll(x=>!x)}>
     {showAll?"Vis færre tester":"Vis alle "+queue.length+" tester"}
    </button>}
   </>:
   <p className={styles.approvalEmpty}>
    Alle oppgaver som var klare til testing er vurdert. Nye tester vises her når de er klare.
   </p>}
  {isOpen&&current&&<div className={styles.wizardBackdrop}>
   <div className={styles.wizardDialog} role="dialog" aria-modal="true"
    aria-labelledby="wizard-title" aria-describedby="wizard-explanation">
    <div className={styles.wizardDialogHeader}>
     <div>
      <p className={styles.approvalEyebrow}>TESTVINDU · {Math.max(1,queue.findIndex(x=>x.id===current.id)+1)} AV {queue.length} · {APPROVAL_GROUPS[current.approval.group]?.label}</p>
      <h2 id="wizard-title">{current.title}</h2>
     </div>
     <button type="button" className={styles.wizardClose} onClick={()=>setIsOpen(false)}
      disabled={busy||Boolean(savingId)} aria-label="Lukk testvinduet">Lukk ✕</button>
    </div>
    <p id="wizard-explanation" className={styles.wizardIntro}>
     Gjør testen som står nedenfor. Funksjonen åpnes i en ny fane,
     så dette vinduet blir liggende klart med instruksjonene.
    </p>
    {notice&&<p className={styles.wizardNotice} role="status">{notice}</p>}
    {current.approval.dependency&&<p className={styles.approvalDependency}>
     <strong>Før testen: </strong>{current.approval.dependency}
    </p>}
    <div className={styles.wizardStepTrack} role="progressbar"
     aria-label="Fullførte teststeg" aria-valuemin={0} aria-valuemax={criteria.length}
     aria-valuenow={passedCount}>
     <span style={{width:(100*passedCount/Math.max(1,criteria.length))+"%"}}/>
    </div>
    {!done?
     <div className={styles.wizardStepBody}>
      <p className={styles.wizardStepCount}>STEG {step+1} AV {criteria.length}</p>
      <h3>Dette skal du teste nå</h3>
      <p className={styles.wizardInstruction}>{criteria[step]}</p>
      {developmentTaskLink(current)?
       <Link href={developmentTaskLink(current)} target="_blank"
        rel="noopener noreferrer" className={styles.approvalOpen}>
        Åpne funksjonen i ny fane
       </Link>:
       <p className={styles.approvalDesc}>
        Denne oppgaven har ingen egen testside. Følg instruksjonen over og
        kontroller relevant funksjon via adminmenyen.
       </p>}
      <p className={styles.wizardTip}>
       Gå tilbake til dette vinduet når du har prøvd steget.
      </p>
      {showIssue&&<div className={styles.wizardIssue}>
       <label htmlFor="wizard-issue">Hva fungerte ikke?</label>
       <textarea id="wizard-issue" rows={3} maxLength={1000}
        value={issueText} onChange={e=>setIssueText(e.target.value)}
        placeholder="Beskriv kort hva som skjedde, så blir det lagret på oppgaven."/>
       <button type="button" disabled={busy||Boolean(savingId)}
        onClick={reportIssue} className={styles.wizardIssueSave}>
        Lagre feil og gå til neste test
       </button>
      </div>}
      <div className={styles.wizardButtons}>
       <button type="button" className={styles.wizardPrimary}
        onClick={markPassed} disabled={busy||Boolean(savingId)}>
        {step+1===criteria.length?"Fungerer – fullfør testen":"Fungerer – neste steg"}
       </button>
       {!showIssue&&<button type="button" className={styles.wizardIssueButton}
        onClick={()=>{setShowIssue(true);setNotice("");}}>
        Fungerer ikke
       </button>}
      </div>
     </div>:
     <div className={styles.wizardStepBody}>
      <p className={styles.wizardStepCount}>ALLE {criteria.length} STEG KONTROLLERT</p>
      <h3>Testen er gjennomført</h3>
      <p className={styles.wizardInstruction}>
       Du har bekreftet hvert teststeg. Godkjenn oppgaven for å merke den
       ferdig i utviklingsplanen. Neste test åpnes automatisk.
      </p>
      <button type="button" onClick={approveCurrent}
       disabled={!done||Boolean(savingId)||busy} className={styles.wizardPrimary}>
       {busy||savingId===current.id?"Lagrer godkjenning …":"Godkjenn og gå til neste test"}
      </button>
     </div>}
    <div className={styles.wizardDialogFooter}>
     <button type="button" onClick={goNext} disabled={busy||Boolean(savingId)}>
      Ta denne senere – neste test
     </button>
     <button type="button" onClick={resetCurrent} disabled={busy||Boolean(savingId)}>
      Start testen på nytt
     </button>
     <p>Ingen fakturaer, betalinger eller andre kundedata endres av selve testvinduet.</p>
    </div>
   </div>
  </div>}
 </section>;
}
