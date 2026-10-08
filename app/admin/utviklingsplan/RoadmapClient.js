"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./roadmap.module.css";
import {DEVELOPMENT_GROUPS,DEVELOPMENT_STATUSES,DEVELOPMENT_PRIORITIES} from "../../../lib/developmentTasks";

const STATUS_LABELS={todo:"Ikke startet",progress:"Under arbeid",test:"Klar for testing",done:"Ferdig"};
const PRIORITY_LABELS={high:"Høy",normal:"Normal",low:"Lav"};
export default function RoadmapClient(){
 const [tasks,setTasks]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [savingId,setSavingId]=useState("");
 const [filter,setFilter]=useState("all");
 const [search,setSearch]=useState("");
 const [openGroup,setOpenGroup]=useState("all");
 const [notesDraft,setNotesDraft]=useState({});
 const [adding,setAdding]=useState(false);
 const [newTask,setNewTask]=useState({title:"",description:"",category:"drawing",priority:"normal"});
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/admin/utviklingsplan",{cache:"no-store"});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke hente utviklingsplanen.");
   setTasks(data.tasks||[]);
   setNotesDraft(Object.fromEntries((data.tasks||[]).map(task=>[task.id,task.notes||""])));
  }catch(e){setError(e.message||"Kunne ikke laste utviklingsplanen.");}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{load()},[load]);
 async function updateTask(task,change){
  if(savingId)return;
  setSavingId(task.id);setError("");setMessage("");
  try{
   const r=await fetch("/api/admin/utviklingsplan",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:task.id,...change})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke lagre endringen.");
   setTasks(current=>current.map(item=>item.id===task.id?data.task:item));
   if(change.notes!==undefined)setNotesDraft(current=>({...current,[task.id]:data.task.notes||""}));
   setMessage("Lagret: "+data.task.title);
  }catch(e){setError(e.message||"Kunne ikke lagre endringen.");}
  finally{setSavingId("")}
 }
 async function createTask(event){
  event.preventDefault();
  if(!newTask.title.trim())return;
  setSavingId("new");setError("");setMessage("");
  try{
   const r=await fetch("/api/admin/utviklingsplan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(newTask)});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke opprette oppgaven.");
   setTasks(current=>[...current,data.task]);
   setNotesDraft(current=>({...current,[data.task.id]:""}));
   setNewTask({title:"",description:"",category:"drawing",priority:"normal"});
   setAdding(false);setFilter("all");setSearch("");setOpenGroup("all");
   setMessage("Ny oppgave er lagt til.");
  }catch(e){setError(e.message||"Kunne ikke opprette oppgaven.");}
  finally{setSavingId("")}
 }
 async function removeTask(task){
  if(!task.custom||!window.confirm("Slette oppgaven «"+task.title+"»?"))return;
  setSavingId(task.id);setError("");
  try{
   const r=await fetch("/api/admin/utviklingsplan?id="+encodeURIComponent(task.id),{method:"DELETE"});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke slette oppgaven.");
   setTasks(current=>current.filter(item=>item.id!==task.id));
   setMessage("Oppgaven er slettet.");
  }catch(e){setError(e.message||"Kunne ikke slette oppgaven.");}
  finally{setSavingId("")}
 }
 const stats=useMemo(()=>({total:tasks.length,done:tasks.filter(task=>task.status==="done").length,test:tasks.filter(task=>task.status==="test").length,progress:tasks.filter(task=>task.status==="progress").length}),[tasks]);
 const visible=useMemo(()=>tasks.filter(task=>(filter==="all"||task.status===filter)&&(!search.trim()||[task.title,task.description,task.notes].join(" ").toLocaleLowerCase("nb-NO").includes(search.trim().toLocaleLowerCase("nb-NO")))),[tasks,filter,search]);
 const groups=DEVELOPMENT_GROUPS.map(group=>({...group,tasks:visible.filter(task=>task.category===group.id)})).filter(group=>group.tasks.length&&(openGroup==="all"||openGroup===group.id));
 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.header}>
    <div><Link href="/admin" className={styles.back}>← Tilbake til admin</Link><p className={styles.eyebrow}>AADLAND SERVICE · BACKOFFICE</p><h1>Utviklingsplan</h1><p className={styles.intro}>Her ser du hva som er bygget, hva som gjenstår, og hva vi tester videre. Alle endringer lagres på serveren og følger deg mellom PC og mobil.</p></div>
    <button className={styles.primary} type="button" onClick={()=>setAdding(current=>!current)}>{adding?"Lukk":"＋ Ny oppgave"}</button>
   </header>
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {message&&<p className={styles.message} role="status">{message}</p>}
   {loading?<p className={styles.loading}>Laster utviklingsplanen …</p>:<>
    <div className={styles.stats}>
     <div><b>{stats.total}</b><span>Oppgaver totalt</span></div>
     <div><b>{stats.progress}</b><span>Under arbeid</span></div>
     <div><b>{stats.test}</b><span>Klar for testing</span></div>
     <div><b>{stats.done}</b><span>Ferdigstilt</span></div>
    </div>
    <div className={styles.progressLine} role="progressbar" aria-label="Ferdigstilte oppgaver" aria-valuemin={0} aria-valuemax={stats.total||1} aria-valuenow={stats.done}><span style={{width:(stats.total?100*stats.done/stats.total:0)+"%"}}/></div>
    {adding&&<form className={styles.addForm} onSubmit={createTask}>
     <h2>Legg til en ny oppgave</h2>
     <label>Hva skal gjøres?<input required maxLength={150} value={newTask.title} onChange={e=>setNewTask(v=>({...v,title:e.target.value}))} placeholder="F.eks. bedre mobilvisning av tegning"/></label>
     <label>Beskrivelse<textarea rows={3} maxLength={1400} value={newTask.description} onChange={e=>setNewTask(v=>({...v,description:e.target.value}))}/></label>
     <div className={styles.addFields}>
      <label>Gruppe<select value={newTask.category} onChange={e=>setNewTask(v=>({...v,category:e.target.value}))}>{DEVELOPMENT_GROUPS.map(group=><option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
      <label>Prioritet<select value={newTask.priority} onChange={e=>setNewTask(v=>({...v,priority:e.target.value}))}>{DEVELOPMENT_PRIORITIES.map(priority=><option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></label>
     </div>
     <button className={styles.primary} disabled={Boolean(savingId)}>{savingId==="new"?"Lagrer …":"Lagre ny oppgave"}</button>
    </form>}
    <section className={styles.filters} aria-label="Filtrer utviklingsplanen">
     <label>Søk<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søk etter oppgaver …"/></label>
     <label>Status<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Alle statuser</option>{DEVELOPMENT_STATUSES.map(status=><option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
     <label>Gruppe<select value={openGroup} onChange={e=>setOpenGroup(e.target.value)}><option value="all">Alle grupper</option>{DEVELOPMENT_GROUPS.map(group=><option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
    </section>
    {groups.length?groups.map(group=><section className={styles.group} key={group.id}>
      <div className={styles.groupHead}><h2>{group.label}</h2><span>{group.tasks.filter(task=>task.status==="done").length}/{group.tasks.length} ferdige</span></div>
      <div className={styles.taskList}>{group.tasks.map(task=><article key={task.id} className={styles.task+(task.status==="done"?" "+styles.complete:"")}>
       <div className={styles.taskTitle}>
        <label className={styles.doneCheck} title="Marker ferdig"><input type="checkbox" checked={task.status==="done"} disabled={Boolean(savingId)} onChange={e=>updateTask(task,{status:e.target.checked?"done":"test"})}/></label>
        <div><h3>{task.title}</h3><p>{task.description}</p></div>
       </div>
       <div className={styles.taskControls}>
        <label>Status<select value={task.status} disabled={Boolean(savingId)} onChange={e=>updateTask(task,{status:e.target.value})}>{DEVELOPMENT_STATUSES.map(status=><option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
        <label>Prioritet<select value={task.priority} disabled={Boolean(savingId)} onChange={e=>updateTask(task,{priority:e.target.value})}>{DEVELOPMENT_PRIORITIES.map(priority=><option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></label>
       </div>
       <div className={styles.noteWrap}>
        <label>Notater / hva er testet?<textarea rows={2} maxLength={3000} value={notesDraft[task.id]??task.notes??""} onChange={e=>setNotesDraft(v=>({...v,[task.id]:e.target.value}))} placeholder="Skriv feil, framdrift og det vi må huske …"/></label>
        <div className={styles.noteActions}>
         {task.custom&&<button type="button" className={styles.delete} disabled={Boolean(savingId)} onClick={()=>removeTask(task)}>Slett oppgave</button>}
         <button type="button" disabled={Boolean(savingId)||(notesDraft[task.id]??task.notes??"")===(task.notes||"")} onClick={()=>updateTask(task,{notes:notesDraft[task.id]??""})}>{savingId===task.id?"Lagrer …":"Lagre notat"}</button>
        </div>
       </div>
      </article>)}</div>
    </section>):<p className={styles.empty}>Ingen oppgaver passer filtrene.</p>}
   </>}
  </div>
 </main>;
}
