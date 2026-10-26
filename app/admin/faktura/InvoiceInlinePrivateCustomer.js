"use client";
import {useState} from "react";

const empty={customerType:"private",name:"",email:"",phone:"",address:"",
 paymentTermsDays:14,preferredPaymentMethod:"bank",internalNote:""};
const label={display:"grid",gap:5,fontSize:13};
export default function InvoiceInlinePrivateCustomer({onChoose,onCreated,onClose,disabled=false}){
 const [form,setForm]=useState(empty);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [stored,setStored]=useState(null),[existing,setExisting]=useState(false);
 const [success,setSuccess]=useState("");
 const change=(key,value)=>{setForm(prev=>({...prev,[key]:value}));setError("");};
 async function attach(contact){
  if(!contact?.id)throw Error("Kundekortet mangler lagret ID.");
  await onChoose(contact);
  onClose?.();
 }
 async function selectStored(){
  if(disabled||busy||!stored)return;
  setBusy(true);setError("");
  try{await attach(stored);}
  catch(e){setError((e.message||"Kunne ikke velge kunden på fakturaen.")+
   " Kundekortet finnes allerede. Prøv å velge det på nytt nedenfor.");}
  finally{setBusy(false);}
 }
 async function submit(e){
  e.preventDefault();
  if(busy||disabled||stored)return;
  if(!form.name.trim())return setError("Oppgi kundens navn.");
  if(!form.email.trim()&&!form.phone.trim())
   return setError("Legg inn minst e-post eller telefonnummer, slik at kunden kan kontaktes.");
  if(!window.confirm("Opprette privatkunden "+form.name.trim()+
   " og velge den på fakturakladden?\nIngen faktura eller e-post blir sendt nå."))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/customer-contacts",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(form)
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kundekortet kunne ikke lagres.");
   if(!data.contact?.id)throw Error("Kundekortet ble ikke bekreftet lagret.");
   // Durable retry handle: never issue a second POST after a successful response.
   setStored(data.contact);
   onCreated?.(data.contact);
   if(data.existing){
    setExisting(true);
    setSuccess("E-postadressen er allerede knyttet til et kundekort. Kontroller navnet og velg det eksisterende kundekortet nedenfor.");
    return;
   }
   setSuccess("Privatkunden er lagret. Velger kunden på fakturakladden …");
   try{await attach(data.contact);}
   catch(e){setError((e.message||"Kunden kunne ikke kobles til fakturaen.")+
    " Kundekortet er lagret. Prøv koblingen på nytt nedenfor.");}
  }catch(e){setError(e.message||"Kunden kunne ikke opprettes.");}
  finally{setBusy(false);}
 }
 return <section aria-label="Opprett privatkunde direkte fra faktura"
  style={{marginTop:16,background:"#f6f7f4",border:"1px solid #cad2cb",padding:14,borderRadius:10}}>
  <h4 style={{margin:"0 0 6px"}}>Opprett privatkunde på fakturaen</h4>
  <p style={{fontSize:13,margin:"0 0 12px"}}>
   Fyll inn kunden én gang. Betalingsfrist og kontaktopplysninger følger med på fakturaen.
   Ingen faktura blir sendt når du oppretter kundekortet.
  </p>
  {!stored&&<form onSubmit={submit} style={{display:"grid",gap:10}}>
   <label style={label}>Fullt navn *
    <input required maxLength={180} autoComplete="name" value={form.name}
     onChange={e=>change("name",e.target.value)}/>
   </label>
   <label style={label}>Adresse, postnummer og poststed
    <textarea maxLength={500} rows={2} autoComplete="street-address" value={form.address}
     onChange={e=>change("address",e.target.value)}/>
   </label>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:10}}>
    <label style={label}>E-post til faktura
     <input type="email" maxLength={240} value={form.email}
      onChange={e=>change("email",e.target.value)} autoComplete="email"
      placeholder="kunde@eksempel.no"/>
    </label>
    <label style={label}>Mobilnummer / telefon
     <input type="tel" maxLength={70} value={form.phone}
      onChange={e=>change("phone",e.target.value)} autoComplete="tel"/>
    </label>
   </div>
   <div style={{display:"flex",alignItems:"end",gap:12,flexWrap:"wrap"}}>
    <label style={label}>Betalingsfrist (dager)
     <input required type="number" min={0} max={365} step={1}
      value={form.paymentTermsDays} onChange={e=>change("paymentTermsDays",e.target.value)}/>
    </label>
    <label style={label}>Standard betalingsmåte
     <select value={form.preferredPaymentMethod}
      onChange={e=>change("preferredPaymentMethod",e.target.value)}>
      <option value="bank">Vanlig faktura / bank</option>
      <option value="vipps">Vipps – når tilgjengelig</option>
     </select>
    </label>
   </div>
   <p style={{fontSize:12,margin:0}}>
    Kontroller fakturaadressen og e-posten. E-post kreves senere dersom du vil sende fakturaen på e-post.
    Kunden får ingen automatisk e-post eller Min side-konto når du oppretter kundekortet.
   </p>
   <button type="submit" disabled={busy||disabled||!form.name.trim()||
    (!form.email.trim()&&!form.phone.trim())}>
    {busy?"Lagrer og velger privatkunde …":"Opprett og bruk på faktura"}
   </button>
  </form>}
  {stored&&<div style={{background:"#fff",padding:12,borderRadius:9,marginTop:10}}>
   <strong>{existing?"Eksisterende kundekort":"Lagret kundekort"}: {stored.name}</strong>
   <small style={{display:"block"}}>{[stored.email,stored.phone,stored.address].filter(Boolean).join(" · ")}</small>
   {existing&&stored.customerType==="business"&&<p style={{fontSize:13,color:"#9e301e"}}>
    E-postadressen finnes på en bedriftskunde. Kontroller kundekortet før du bruker det på en privat faktura.
   </p>}
   <button type="button" onClick={selectStored} disabled={busy||disabled} style={{marginTop:9}}>
    {busy?"Velger …":"Bruk dette kundekortet på fakturaen"}
   </button>
  </div>}
  {error&&<p role="alert" style={{color:"#aa2e20",fontSize:13}}>{error}</p>}
  {success&&<p role="status" style={{fontSize:13}}>{success}</p>}
  <button type="button" onClick={()=>onClose?.()} disabled={busy||disabled}
   style={{marginTop:12}}>Lukk privatkunderegistrering</button>
 </section>;
}
