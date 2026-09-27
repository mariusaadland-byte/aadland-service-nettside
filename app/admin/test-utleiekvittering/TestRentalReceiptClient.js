"use client";

import {useState} from "react";
import Link from "next/link";

export default function TestRentalReceiptClient(){
 const [email,setEmail]=useState("");
 const [customerName,setCustomerName]=useState("Marius");
 const [customerPhone,setCustomerPhone]=useState("999 99 999");
 const [customerAddress,setCustomerAddress]=useState("Eksempelveien 12, 5000 Bergen");
 const [reference,setReference]=useState("TEST-LEIE-VIPPS-2026");
 const [depositReference,setDepositReference]=useState("TEST-DEP-2026");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 async function send(e){
  e.preventDefault();
  setBusy(true);setMessage("");setError("");
  try{
   const response=await fetch("/api/admin/test-rental-receipt",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,customerName,customerPhone,customerAddress,reference,depositReference})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Utleietesten kunne ikke sendes.");
   setMessage("Test av utleiekvittering med PDF er sendt til "+(data.sentTo||email)+".");
  }catch(err){
   setError(err.message||"Utleietesten kunne ikke sendes.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="admin">
  <section className="adminmain" style={{marginLeft:0,maxWidth:800}}>
   <Link href="/admin">← Tilbake til backoffice</Link>
   <div className="kicker" style={{marginTop:28}}>PREVIEW / TEST</div>
   <h1>Test utleiekvittering</h1>
   <div className="card">
    <p><b>Denne testen oppretter ingen booking, registrerer ingen betaling og endrer ikke depositum.</b></p>
    <p className="muted">Eksempelet bruker 4 375 kr i leie og 2 500 kr i depositum. Depositumet vises separat og er ikke med i «Totalt betalt». Det følger med utskriftsvennlig PDF.</p>
    <form onSubmit={send}>
     <div className="field"><label>Send testen til e-post</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="din@epost.no"/></div>
     <div className="field"><label>Kundenavn</label><input maxLength={120} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></div>
     <div className="field"><label>Telefon</label><input maxLength={40} value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></div>
     <div className="field"><label>Adresse</label><input maxLength={500} value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)}/></div>
     <div className="field"><label>Referanse for leiebetaling</label><input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)}/></div>
     <div className="field"><label>Referanse for depositum</label><input maxLength={120} value={depositReference} onChange={e=>setDepositReference(e.target.value)}/></div>
     {error&&<p className="notice">{error}</p>}
     {message&&<p className="success">{message}</p>}
     <button className="btn" disabled={busy}>{busy?"Sender …":"Send test av utleiekvittering"}</button>
    </form>
   </div>
  </section>
 </main>;
}
