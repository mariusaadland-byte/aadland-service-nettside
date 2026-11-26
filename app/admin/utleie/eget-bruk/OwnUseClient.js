"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import styles from "./ownUse.module.css";
const blank={itemId:"",startDate:"",endDate:"",jobReference:"",note:""};
export default function OwnUseClient({items,reservations,today,enabled,limited}){
 const [v,setV]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const router=useRouter(),lock=useRef(false),request=useRef(null);
 const item=items.find(x=>x.id===v.itemId);
 function change(e){setV(x=>({...x,[e.target.name]:e.target.value}));request.current=null;}
 async function submit(e){
  e.preventDefault();if(lock.current||!enabled)return;
  if(!window.confirm("Reservere hele produkttypen i valgt periode?"))return;
  lock.current=true;setBusy(true);setError("");setNotice("");
  try{if(!request.current)request.current=crypto.randomUUID();
   const r=await fetch("/api/admin/rental/blocks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v,kind:"own_use",requestId:request.current})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Reservasjonen kunne ikke bekreftes.");
   setV(blank);request.current=null;setNotice("Intern reservasjon registrert.");router.refresh();
  }catch(e){setError(e.message||"Oppdater oversikten før nytt forsøk.");}finally{lock.current=false;setBusy(false);}
 }
 async function remove(x){
  if(lock.current||!enabled||!window.confirm("Fjerne reservasjonen og frigjøre den manuelle sperren?"))return;
  lock.current=true;setBusy(true);setError("");setNotice("");
  try{const r=await fetch("/api/admin/rental/blocks",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:x.id})});
   if(!r.ok)throw Error("Reservasjonen kunne ikke fjernes.");setNotice("Reservasjonen er fjernet.");router.refresh();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <><form className={styles.panel} onSubmit={submit}><h2>Ny intern reservasjon</h2>
 {!enabled&&<p>Registrering er stengt i dette miljøet.</p>}
 <label>Utstyr<select name="itemId" required value={v.itemId} onChange={change} disabled={busy||!enabled}><option value="">Velg utstyr</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.quantity} stk)</option>)}</select></label>
 {item&&<p>Alle {item.quantity} registrerte eksemplarer sperres i perioden.</p>}
 <div className={styles.dates}><label>Fra<input type="date" name="startDate" min={today} required value={v.startDate} onChange={change} disabled={busy||!enabled}/></label><label>Til og med<input type="date" name="endDate" min={v.startDate||today} required value={v.endDate} onChange={change} disabled={busy||!enabled}/></label></div>
 <label>Intern oppdragsreferanse<input name="jobReference" required minLength={2} maxLength={100} value={v.jobReference} onChange={change} disabled={busy||!enabled} placeholder="Oppdragsnummer eller kort intern referanse"/></label>
 <label>Internt notat (valgfritt)<textarea name="note" maxLength={500} value={v.note} onChange={change} disabled={busy||!enabled} rows={3}/></label><p>Ikke legg inn kundens personopplysninger i notatet.</p>
 <button disabled={busy||!enabled}>{busy?"Behandler …":"Reserver utstyr"}</button></form>
 {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status">{notice}</p>}
 <section className={styles.panel}><h2>Interne reservasjoner</h2>{limited&&<p>Viser maksimalt 500 registreringer.</p>}{reservations.length===0&&<p>Ingen interne reservasjoner registrert.</p>}
 {reservations.map(x=><article className={styles.entry} key={x.id}><b>{items.find(i=>i.id===x.rental_item_id)?.name||"Utstyr"}</b><p>{x.start_date} – {x.end_date}</p><p>{x.reference}</p><small>{x.end_date<today?"Tidligere periode":"Reservert / planlagt"}</small>{enabled&&<button type="button" disabled={busy} onClick={()=>remove(x)}>Fjern reservasjon</button>}</article>)}</section></>;
}
