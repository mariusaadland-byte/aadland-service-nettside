"use client";
import {useState} from "react";
import CompanyRegistrySearch from "../kunder/CompanyRegistrySearch";

const empty={customerType:"business",name:"",organizationNumber:"",address:"",
 email:"",phone:"",contactPerson:"",paymentTermsDays:14,preferredPaymentMethod:"bank",internalNote:""};
const labelStyle={display:"grid",gap:5,fontSize:13};
export default function InvoiceInlineBusinessCustomer({onChoose,onCreated,onClose,disabled=false}){
 const [form,setForm]=useState(empty);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [stored,setStored]=useState(null),[success,setSuccess]=useState("");
 const set=(name,value)=>{setForm(old=>({...old,[name]:value}));setError("");};
 async function attach(contact){
  if(!contact?.id)throw Error("Kunne ikke velge en lagret kunde.");
  await onChoose(contact);
  onClose?.();
 }
 async function useExisting(contact){
  if(busy||disabled)return;
  setBusy(true);setError("");setSuccess("");
  try{await attach(contact);}
  catch(e){setStored(contact);setError(e.message||"Kundekortet kunne ikke velges på fakturaen. Prøv igjen.");}
  finally{setBusy(false);}
 }
 async function submit(e){
  e.preventDefault();if(busy||disabled||stored)return;
  if(!window.confirm("Opprette bedriftskunden "+form.name+" og velge den på denne fakturakladden?\nDette sender ingen faktura eller e-post."))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/customer-contacts",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Bedriftskunden kunne ikke opprettes.");
   if(!data.contact?.id)throw Error("Kundekortet ble ikke bekreftet lagret.");
   // Save the returned record immediately, even if subsequent invoice binding fails.
   // Retry selects the same card without creating a second record.
   setStored(data.contact);
   onCreated?.(data.contact);
   setSuccess(data.existing?"Bedriften finnes allerede. Eksisterende kundekort brukes.":
    "Bedriftskunden er lagret. Velger den på fakturakladden …");
   try{await attach(data.contact);}
   catch(e){setError((e.message||"Kunne ikke knytte kunden til fakturaen.")+
    " Kundekortet er lagret. Bruk knappen nedenfor for å prøve å velge det på nytt.");}
  }catch(e){setError(e.message||"Kunne ikke opprette bedriftskunden.");}
  finally{setBusy(false);}
 }
 return <section aria-label="Opprett bedriftskunde direkte fra faktura"
  style={{marginTop:16,background:"#f6f7f4",border:"1px solid #cad2cb",padding:14,borderRadius:10}}>
  <h4 style={{margin:"0 0 6px"}}>Søk opp og opprett bedrift på fakturaen</h4>
  <p style={{fontSize:13,margin:"0 0 8px"}}>Søk i Brønnøysundregistrene. Hvis bedriften finnes
   i kunderegisteret ditt, velger du eksisterende kundekort. Nye bedrifter lagres bare
   når du selv trykker «Opprett og bruk på faktura».</p>
  {!stored&&<form onSubmit={submit} style={{display:"grid",gap:10}}>
   <CompanyRegistrySearch checkExisting disabled={disabled||busy}
    onUseExisting={useExisting}
    onSelect={company=>{
     setForm(old=>({...old,name:company.name,organizationNumber:company.organizationNumber,
      address:company.address||old.address}));
     setError("");
    }}/>
   <label style={labelStyle}>Firmanavn *
    <input required maxLength={180} value={form.name} onChange={e=>set("name",e.target.value)}/>
   </label>
   <label style={labelStyle}>Organisasjonsnummer (9 sifre) *
    <input required inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9}
     value={form.organizationNumber} onChange={e=>set("organizationNumber",e.target.value)}/>
   </label>
   <label style={labelStyle}>Fakturaadresse
    <textarea rows={2} maxLength={500} value={form.address} onChange={e=>set("address",e.target.value)}/>
   </label>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:10}}>
    <label style={labelStyle}>E-post til faktura
     <input type="email" maxLength={240} value={form.email} onChange={e=>set("email",e.target.value)}
      placeholder="faktura@bedrift.no"/>
    </label>
    <label style={labelStyle}>Telefon
     <input type="tel" maxLength={70} value={form.phone} onChange={e=>set("phone",e.target.value)}/>
    </label>
   </div>
   <label style={labelStyle}>Kontaktperson
    <input maxLength={180} value={form.contactPerson} onChange={e=>set("contactPerson",e.target.value)}/>
   </label>
   <div style={{display:"flex",alignItems:"end",gap:12,flexWrap:"wrap"}}>
    <label style={labelStyle}>Betalingsfrist (dager)
     <input required type="number" min={0} max={365} step={1} value={form.paymentTermsDays}
      onChange={e=>set("paymentTermsDays",e.target.value)}/>
    </label>
    <label style={labelStyle}>Betalingsmåte
     <select value={form.preferredPaymentMethod} onChange={e=>set("preferredPaymentMethod",e.target.value)}>
      <option value="bank">Faktura / bank</option>
      <option value="vipps">Vipps – når tilgjengelig</option>
     </select>
    </label>
   </div>
   <p style={{fontSize:12,margin:0}}>Kontroller særlig fakturaadressen og e-posten.
    Det opprettes ingen faktura og ingenting sendes før du senere velger å fakturere.</p>
   <button type="submit" disabled={busy||disabled||!form.name.trim()||
    !/^[0-9]{9}$/.test(form.organizationNumber)}>
    {busy?"Lagrer og velger kunde …":"Opprett og bruk på faktura"}
   </button>
  </form>}
  {stored&&<div style={{background:"#fff",padding:12,borderRadius:9,marginTop:10}}>
   <strong>Lagret kundekort: {stored.name}</strong>
   <small style={{display:"block"}}>Org.nr. {stored.organizationNumber||""}</small>
   <button type="button" onClick={()=>useExisting(stored)} disabled={busy||disabled}
    style={{marginTop:9}}>{busy?"Velger …":"Velg lagret kundekort på fakturaen"}</button>
  </div>}
  {error&&<p role="alert" style={{color:"#aa2e20",fontSize:13}}>{error}</p>}
  {success&&<p role="status" style={{fontSize:13}}>{success}</p>}
  <button type="button" disabled={busy||disabled} style={{marginTop:12}}
   onClick={()=>onClose?.()}>Lukk bedriftsregistrering</button>
 </section>;
}
