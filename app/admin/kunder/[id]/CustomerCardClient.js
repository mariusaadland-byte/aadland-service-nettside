"use client";
import {useState} from "react";
import Link from "next/link";
export default function CustomerCardClient({contact,invoiceId}){
 const [form,setForm]=useState({...contact,paymentTermsDays:contact.paymentTermsDays??14}),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 const change=(key,value)=>{setSaved(false);setForm(x=>({...x,[key]:value}));};
 async function save(e){
  e.preventDefault();setBusy(true);setError("");setSaved(false);
  try{const r=await fetch("/api/admin/customer-contacts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const data=await r.json();if(!r.ok)throw Error(data.error);setForm(data.contact);setSaved(true);}
  catch(err){setError(err.message)}finally{setBusy(false)}
 }
 const back=invoiceId?"/admin/faktura?id="+invoiceId:"/admin";
 return <main className="admin" style={{maxWidth:720,margin:"auto",padding:24}}><Link href={back}>{invoiceId?"← Tilbake til faktura":"← Admin"}</Link><h1>Kundekort</h1><p>Rett kundens kontaktopplysninger her. Endringene oppdaterer tilknyttede fakturakladder. Utstedte fakturaer beholdes uendret.</p><form className="card" onSubmit={save} style={{padding:24}}><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><label>Navn <input required maxLength={180} autoComplete="name" value={form.name||""} onChange={e=>change("name",e.target.value)}/></label><label>Adresse og poststed <textarea rows={3} maxLength={500} autoComplete="street-address" value={form.address||""} onChange={e=>change("address",e.target.value)}/></label><label>Telefonnummer <input type="tel" maxLength={70} autoComplete="tel" value={form.phone||""} onChange={e=>change("phone",e.target.value)}/></label><label>E-postadresse <input type="email" maxLength={240} autoComplete="email" value={form.email||""} onChange={e=>change("email",e.target.value)}/></label><label>Betalingsfrist (antall dager)<input type="number" min="0" max="365" step="1" required value={form.paymentTermsDays} onChange={e=>change("paymentTermsDays",e.target.value)}/></label><p>Nye fakturaer får dagens fakturadato ved utstedelse. Forfall beregnes automatisk med denne betalingsfristen. Du kan velge en egen forfallsdato på en enkelt faktura.</p><button type="submit">{busy?"Lagrer …":"Lagre kundekort"}</button></fieldset>{error&&<p role="alert" style={{color:"crimson"}}>{error}</p>}{saved&&<p role="status">Kundekort og tilknyttede fakturakladder er oppdatert. <Link href={back}>Tilbake til faktura →</Link></p>}</form></main>;
}
