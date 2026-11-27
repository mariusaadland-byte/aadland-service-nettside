"use client";
import {useRef,useState} from "react";
import {rentalAppointmentValues,rentalAppointmentInput} from "../../../lib/rentalAppointments.mjs";
export default function RentalAppointmentControl({booking,canUpdate,busy,onSave}){
 const initial=rentalAppointmentValues(booking.customer);
 const [v,setV]=useState(initial),[agreed,setAgreed]=useState(false),[message,setMessage]=useState(""),[saving,setSaving]=useState(false);
 const lock=useRef(false);
 const editable=canUpdate&&!booking.archivedAt&&["new","confirmed","active"].includes(booking.status);
 const valid=rentalAppointmentInput({status:booking.status,archived_at:booking.archivedAt,customer:booking.customer,start_date:booking.startDate,end_date:booking.endDate},{...v,customerAgreed:agreed});
 const changed=v.pickupTime!==initial.pickupTime||v.returnTime!==initial.returnTime;
 async function save(){
  if(lock.current||!valid||!editable||busy||!changed)return;
  lock.current=true;setSaving(true);setMessage("");
  try{const ok=await onSave({action:"save-appointments",expectedUpdatedAt:booking.updatedAt,appointments:{...v,customerAgreed:true}});if(ok){setAgreed(false);setMessage("Tidsavtalen lagret. Ingen e-post er sendt.");}else setMessage("Lagring ikke bekreftet. Kontroller bookinglisten.");}
  catch{setMessage("Lagring ikke bekreftet. Oppdater bookingen før nytt forsøk.");}
  finally{lock.current=false;setSaving(false);}
 }
 function edit(name,value){setV(x=>({...x,[name]:value}));setAgreed(false);setMessage("");}
 return <section className="orderPaymentPanel"><h4>Avtalt utlevering og retur</h4>
 <p className="muted">Norsk lokal tid. Leieperioden og prisen endres ikke. Kontroller selv at du kan ta imot kunden til avtalt tid. Ingen automatisk tidsreservasjon eller e-post.</p>
 {editable?<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12}}>
 <label className="field">Utlevering {booking.startDate}<input type="time" value={v.pickupTime} onChange={e=>edit("pickupTime",e.target.value)} disabled={busy||saving||booking.status==="active"}/></label>
 <label className="field">Retur {booking.endDate}<input type="time" value={v.returnTime} onChange={e=>edit("returnTime",e.target.value)} disabled={busy||saving}/></label></div>
 <p className="muted">Tomt klokkeslett betyr at tidspunktet ikke er avtalt. En endring må avklares med kunden.</p>
 <label style={{display:"flex",alignItems:"flex-start",gap:8}}><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} disabled={busy||saving}/> Jeg har avklart tidspunktene med kunden, også eventuelle endringer.</label>
 <button type="button" className="btn" disabled={!valid||!changed||busy||saving} onClick={save}>{saving?"Lagrer …":"Lagre tidsavtale"}</button>{message&&<p role="status">{message}</p>}</>:<p>Utlevering: {initial.pickupTime?"kl. "+initial.pickupTime:"Avtales"} · Retur: {initial.returnTime?"kl. "+initial.returnTime:"Avtales"}</p>}
 </section>;
}
