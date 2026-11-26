"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {appointmentKinds} from "../../../../lib/rentalAppointments.mjs";
import styles from "../eget-bruk/ownUse.module.css";
const empty={date:"",time:"",kind:"either"};
export default function AppointmentClient({slots,bookings,today,limited}){
 const [v,setV]=useState(empty),[slotId,setSlotId]=useState(""),[bookingId,setBookingId]=useState(""),[kind,setKind]=useState("pickup"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const lock=useRef(false),request=useRef(null),router=useRouter();
 const selected=slots.find(s=>s.id===slotId&&!s.booking_id);
 const candidates=selected?bookings.filter(b=>(kind==="pickup"?b.start_date:b.end_date)===selected.slot_date&&(kind!=="pickup"||b.status!=="active")):[];
 async function send(body){
  if(lock.current)return false;lock.current=true;setBusy(true);setError("");setNotice("");
  try{const r=await fetch("/api/admin/rental/appointments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Handlingen kunne ikke bekreftes.");setNotice("Lagret. Kontroller oversikten.");router.refresh();return true;}
  catch(e){setError(e.message);return false;}finally{lock.current=false;setBusy(false);}
 }
 function change(e){setV(x=>({...x,[e.target.name]:e.target.value}));request.current=null;}
 async function create(e){e.preventDefault();if(lock.current)return;if(!request.current)request.current=crypto.randomUUID();if(await send({...v,action:"create",requestId:request.current})){request.current=null;setV(empty);}}
 async function assign(e){e.preventDefault();if(!selected||!candidates.some(b=>b.id===bookingId)||!window.confirm("Tildele avtalen? Kunden må informeres separat."))return;if(await send({action:"assign",slotId,bookingId,kind})){setSlotId("");setBookingId("");}}
 return <>{error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status">{notice}</p>}
 <form className={styles.panel} onSubmit={create}><h2>Åpne tidsvindu</h2><div className={styles.dates}><label>Dato<input type="date" name="date" required min={today} value={v.date} onChange={change} disabled={busy}/></label><label>Klokkeslett<select name="time" required value={v.time} onChange={change} disabled={busy}><option value="">Velg tid</option>{Array.from({length:48},(_,i)=>String(Math.floor(i/2)).padStart(2,"0")+":"+(i%2?"30":"00")).map(t=><option key={t}>{t}</option>)}</select></label></div><label>Type<select name="kind" value={v.kind} onChange={change} disabled={busy}>{Object.entries(appointmentKinds).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label><button disabled={busy}>Åpne 30 minutter</button></form>
 <form className={styles.panel} onSubmit={assign}><h2>Tildel en eksisterende booking</h2><label>Ledig tidsvindu<select value={slotId} onChange={e=>{setSlotId(e.target.value);setBookingId("");const s=slots.find(x=>x.id===e.target.value);setKind(s?.kind==="return"?"return":"pickup");}} required disabled={busy}><option value="">Velg vindu</option>{slots.filter(s=>!s.booking_id).map(s=><option key={s.id} value={s.id}>{s.slot_date} kl. {s.slot_time.slice(0,5)} · {appointmentKinds[s.kind]}</option>)}</select></label><label>Henting eller retur<select value={kind} onChange={e=>{setKind(e.target.value);setBookingId("");}} disabled={busy||!selected||selected.kind!=="either"}><option value="pickup">Henting</option><option value="return">Retur</option></select></label><label>Booking<select value={bookingId} onChange={e=>setBookingId(e.target.value)} required disabled={busy||!selected}><option value="">Velg booking</option>{candidates.map(b=><option key={b.id} value={b.id}>{b.booking_number}</option>)}</select></label><button disabled={busy||!selected||!bookingId}>Tildel avtale</button></form>
 <section className={styles.panel}><h2>Planlagte tidsvinduer</h2>{limited&&<p>Viser maksimalt 500 tidsvinduer og bookinger.</p>}{!slots.length&&<p>Ingen tidsvinduer registrert.</p>}{slots.map(s=><article className={styles.entry} key={s.id}><b>{s.slot_date} kl. {s.slot_time.slice(0,5)}</b><p>{s.booking_id?appointmentKinds[s.assigned_kind]+" · "+(bookings.find(b=>b.id===s.booking_id)?.booking_number||"Tildelt booking"):appointmentKinds[s.kind]+" · Ledig"}</p>{!s.booking_id&&<button disabled={busy} onClick={()=>{if(window.confirm("Fjerne ledig tidsvindu?"))send({action:"remove",slotId:s.id});}}>Fjern</button>}</article>)}</section></>;
}
