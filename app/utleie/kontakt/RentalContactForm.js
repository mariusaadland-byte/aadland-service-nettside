"use client";
import {useState,useRef} from "react";
import {rentalContactTopics} from "../../../lib/rentalContact.mjs";
const empty={name:"",email:"",phone:"",booking:"",topic:"availability",message:"",website:""};
export default function RentalContactForm(){
 const [v,setV]=useState(empty),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState(""),[sent,setSent]=useState(false),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false),request=useRef(null);
 const change=e=>{setV(x=>({...x,[e.target.name]:e.target.value}));request.current=null;setFeedback("");};
 async function submit(e){
  e.preventDefault();if(lock.current||uncertain)return;
  lock.current=true;setBusy(true);setFeedback("");
  try{
   if(!request.current)request.current=crypto.randomUUID();
   const r=await fetch("/api/rental/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v,requestId:request.current})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){if(d.uncertain)setUncertain(true);throw Error(d.error||"Utsending kunne ikke bekreftes.");}
   setSent(true);setV(empty);request.current=null;
  }catch(e){setFeedback(e.message||"Utsending kunne ikke bekreftes.");if(e instanceof TypeError)setUncertain(true);}
  finally{lock.current=false;setBusy(false);}
 }
 return <form className="rentalContactForm" onSubmit={submit}>
  <h2>Send en henvendelse</h2>
  {sent?<p role="status">Henvendelsen er akseptert av e-posttjenesten. Vi svarer så snart vi kan.</p>:<>
  <label>Hva gjelder det?<select name="topic" value={v.topic} onChange={change} disabled={busy||uncertain}>{Object.entries(rentalContactTopics).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>Navn<input name="name" autoComplete="name" value={v.name} onChange={change} maxLength={120} required disabled={busy||uncertain}/></label>
  <label>E-post<input type="email" name="email" autoComplete="email" value={v.email} onChange={change} maxLength={254} required disabled={busy||uncertain}/></label>
  <label>Telefon (valgfritt)<input type="tel" name="phone" autoComplete="tel" value={v.phone} onChange={change} maxLength={40} disabled={busy||uncertain}/></label>
  <label>Bookingnummer (valgfritt)<input name="booking" value={v.booking} onChange={change} maxLength={60} disabled={busy||uncertain}/></label>
  <label>Melding<textarea name="message" rows={6} minLength={10} maxLength={3000} value={v.message} onChange={change} required disabled={busy||uncertain}/></label>
  <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" value={v.website} onChange={change}/></div>
  <p>Ikke oppgi betalingskort, passord, fødselsnummer eller andre unødvendige personopplysninger. Les <a href="/personvern">personvernerklæringen</a>.</p>
  <button type="submit" className="catalogGoldButton" disabled={busy||uncertain}>{busy?"Sender …":"Send henvendelse"}</button>
  {feedback&&<p role="alert">{feedback}</p>}
  </>}
 </form>;
}
