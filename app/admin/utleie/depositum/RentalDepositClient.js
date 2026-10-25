"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./deposit.module.css";

const kr=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
const day=value=>value?new Date(value+"T12:00:00Z").toLocaleDateString("nb-NO",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}):"–";
const time=value=>value?new Date(value).toLocaleString("nb-NO",{dateStyle:"short",timeStyle:"short"}):"–";
const statuses={new:"Venter betaling",confirmed:"Bekreftet",active:"Utlevert",returned:"Returnert",completed:"Ferdig",cancelled:"Avbrutt"};
const deposits={not_paid:"Ikke registrert",held:"Registrert som holdt",released:"Registrert frigitt",partially_charged:"Delvis brukt",charged:"Registrert brukt"};
function reason(booking){
 if(["returned","completed"].includes(booking.status)&&!booking.inspections.length)return "Trenger returkontroll";
 if(booking.status==="returned"&&booking.inspections.length&&!booking.depositReleasedAt)return "Venter depositumoppgjør";
 if(booking.status==="active"&&booking.depositStatus==="not_paid")return "Utlevert uten registrert depositum";
 if(booking.status==="confirmed"&&booking.depositStatus==="not_paid")return "Mangler depositum før utlevering";
 if(booking.status==="cancelled"&&booking.depositStatus==="held"&&!booking.depositReleasedAt)return "Avbrutt – oppgjør må avklares";
 return "";
}
export default function RentalDepositClient(){
 const [items,setItems]=useState([]);
 const [canUpdate,setCanUpdate]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [saving,setSaving]=useState("");
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState("attention");
 const [drafts,setDrafts]=useState({});
 async function refresh(){
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/admin/rental-deposits",{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Kunne ikke hente depositumoversikten.");
   setItems(data.bookings||[]);setCanUpdate(data.canUpdate===true);
  }catch(e){setError(e.message||"Depositumoversikten kunne ikke lastes.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{refresh()},[]);
 const attention=useMemo(()=>items.filter(b=>reason(b)),[items]);
 const visible=useMemo(()=>items.filter(b=>{
  const matches=(b.bookingNumber+" "+b.customerName+" "+b.itemName).toLowerCase().includes(search.toLowerCase().trim());
  return matches&&(filter==="all"||(filter==="attention"&&Boolean(reason(b)))||(filter==="returned"&&["returned","completed"].includes(b.status))||(filter==="reviewed"&&b.inspections.length>0));
 }),[items,filter,search]);
 const updateDraft=(id,key,value)=>setDrafts(curr=>({...curr,[id]:{...curr[id],[key]:value}}));
 async function inspect(b,result){
  const draft=drafts[b.id]||{};
  const amount=result==="damage"?Number(draft.estimate):0;
  const note=String(draft.note||"").trim();
  if(result==="damage"&&(!note||note.length<10)){setError("Beskriv skaden med minst 10 tegn.");return;}
  if(!Number.isSafeInteger(amount)||amount<0||amount>b.depositOre/100){setError("Skadeanslaget kan ikke overstige depositumet.");return;}
  const prompt=result==="ok"?"Registrere at utstyret er kontrollert uten skade?":`Registrere skadevurdering med anslag ${kr(Math.round(amount*100))}? Dette trekker ikke penger.`;
  if(!window.confirm(prompt))return;
  const requestId=crypto.randomUUID();
  setSaving(b.id);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/rental-deposits",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({bookingId:b.id,requestId,result,damageEstimateOre:Math.round(amount*100),note})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kontrollen kunne ikke lagres.");
   setSuccess("Returkontrollen er lagret. Depositum må fortsatt gjøres opp separat.");
   setDrafts(curr=>({...curr,[b.id]:{note:"",estimate:""}}));
   await refresh();
  }catch(e){setError(e.message||"Kontrollen kunne ikke lagres.");}
  finally{setSaving("");}
 }
 return <main className={styles.root}>
  <header className={styles.heading}>
   <Link href="/admin/mobil" className={styles.back}>← Admin-appen</Link>
   <p className={styles.eyebrow}>AADLAND UTLEIE</p>
   <h1>Depositum og returkontroll</h1>
   <p>Oversikt over depositum, registrert returkontroll og skadevurderinger. Ingen penger flyttes fra denne siden.</p>
  </header>
  <div className={styles.stats}>
   <div><strong>{items.length}</strong><span>Bookinger med depositum</span></div>
   <div><strong>{attention.length}</strong><span>Krever oppfølging</span></div>
   <div><strong>{items.filter(b=>b.inspections.length>0).length}</strong><span>Kontroller dokumentert</span></div>
  </div>
  <nav className={styles.links}>
   <Link href="/admin">Bookinger og betaling</Link>
   <Link href="/admin/utleie">Utleieprodukter</Link>
   <button type="button" onClick={refresh} disabled={loading}>Oppdater</button>
  </nav>
  <p className={styles.notice}><strong>Viktig:</strong> «Registrert som holdt» betyr ikke at Vipps har bekreftet en kortreservasjon. «Registrert frigitt» betyr ikke at Vipps har refundert. Kontroller betaling og oppgjør før du endrer økonomiske statuser i bookingadministrasjonen.</p>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {success&&<p className={styles.success} role="status">{success}</p>}
  <div className={styles.controls}>
   <label>Søk etter booking, kunde eller utstyr<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søk…" type="search"/></label>
   <label>Vis<select value={filter} onChange={e=>setFilter(e.target.value)}>
    <option value="attention">Trenger oppfølging</option><option value="returned">Returnert / ferdig</option><option value="reviewed">Med returkontroll</option><option value="all">Alle bookinger</option>
   </select></label>
  </div>
  {loading?<p>Laster inn …</p>:visible.length===0?<div className={styles.empty}>Ingen bookinger i dette utvalget.</div>:
   <div className={styles.list}>{visible.map(b=>{
    const last=b.inspections[0]||null;const problem=reason(b);
    const canInspect=canUpdate&&["returned","completed"].includes(b.status);
    return <article key={b.id} className={styles.card}>
     <div className={styles.cardHeader}><div><span className={styles.code}>{b.bookingNumber}</span><h2>{b.itemName}</h2><p>{b.customerName} · {day(b.startDate)}–{day(b.endDate)}</p></div>
      <span className={styles.tag}>{statuses[b.status]||b.status}</span></div>
     {problem&&<p className={styles.warning}>{problem}</p>}
     <div className={styles.financial}>
      <div><small>Sikkerhetsdepositum</small><strong>{kr(b.depositOre)}</strong></div>
      <div><small>Depositumstatus</small><strong>{deposits[b.depositStatus]||b.depositStatus}</strong></div>
      <div><small>Registrert brukt</small><strong>{kr(b.depositChargedOre)}</strong></div>
     </div>
     <p className={styles.meta}>Referanse: {b.depositReference||"Ingen"} · Frigivelse registrert: {time(b.depositReleasedAt)}</p>
     <section className={styles.history}>
      <h3>Returkontroll</h3>
      {last?<p><strong>{last.result==="ok"?"Skadefri ved kontroll":"Skade notert"}</strong> – {time(last.createdAt)}{last.result==="damage"?" · Skadeanslag "+kr(last.damageEstimateOre):""}. {last.note}</p>:<p>Ingen returkontroll registrert.</p>}
      {b.inspections.length>1&&<details><summary>Vis alle kontroller ({b.inspections.length})</summary>
       <ul>{b.inspections.map(e=><li key={e.id}>{time(e.createdAt)} · {e.result==="ok"?"Skadefri":"Skade"} · {kr(e.damageEstimateOre)} · {e.note||"Ingen merknad"}</li>)}</ul></details>}
     </section>
     {canInspect&&<div className={styles.form}>
       <label>Notater fra kontrollen<textarea value={drafts[b.id]?.note||""} onChange={e=>updateDraft(b.id,"note",e.target.value)} maxLength={2000} rows={2} placeholder="Tilstand, skader eller merknader …"/></label>
       <label>Skadeanslag (kr – trekkes ikke automatisk)<input value={drafts[b.id]?.estimate||""} onChange={e=>updateDraft(b.id,"estimate",e.target.value)} type="number" min="0" max={b.depositOre/100} step="1" placeholder="0"/></label>
       <div className={styles.buttons}>
        <button disabled={saving===b.id} onClick={()=>inspect(b,"ok")}>Registrer skadefri retur</button>
        <button disabled={saving===b.id} className={styles.danger} onClick={()=>inspect(b,"damage")}>Registrer skade</button>
       </div>
      </div>}
     <p className={styles.foot}>Vurderingen registreres med historikk, men frigjør ikke penger og oppretter ikke skadefaktura. Gå til <Link href="/admin">bookinger og betaling</Link> for å behandle et faktisk oppgjør.</p>
    </article>;
   })}</div>}
 </main>;
}
