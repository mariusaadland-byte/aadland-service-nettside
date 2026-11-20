"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {osloDateKey} from "../../../../lib/osloTime";
import ExternalInvoiceTripletexPanel from "./ExternalInvoiceTripletexPanel";

const money=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const initial=()=>({sourceSystem:"",invoiceNumber:"",customerName:"",
 issuedOn:osloDateKey(new Date()),dueOn:"",amount:"",note:"",
 notDuplicateConfirmed:false});
const box={border:"1px solid #e1d8cb",borderRadius:12,padding:16,background:"#fff"};
const label={display:"grid",gap:6,fontSize:13,fontWeight:650,minWidth:0};
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,210px),1fr))",gap:12};
const muted={fontSize:13,color:"#625d54",lineHeight:1.5};
const btn={padding:"11px 15px",borderRadius:9,fontWeight:700,whiteSpace:"normal"};
const input={width:"100%",minWidth:0,maxWidth:"100%"};
export default function ExternalInvoiceRegisterClient(){
 const [form,setForm]=useState(initial);
 const [file,setFile]=useState(null);
 const [invoices,setInvoices]=useState([]);
 const [hasMore,setHasMore]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [moreBusy,setMoreBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [filter,setFilter]=useState("unpaid"),[search,setSearch]=useState("");
 const [paymentId,setPaymentId]=useState("");
 const [tripletexId,setTripletexId]=useState("");
 const [paidOn,setPaidOn]=useState(()=>osloDateKey(new Date()));
 const [paymentNote,setPaymentNote]=useState("");
 const [expanded,setExpanded]=useState(false);
 const put=(name,value)=>setForm(old=>({...old,[name]:value}));
 const load=async(offset=0)=>{
  const response=await fetch("/api/admin/invoices/external-register?offset="+offset,{
   cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(data.error||"Kunne ikke lese eksterne fakturaer.");
  setInvoices(old=>offset===0?data.invoices||[]:[...old,...(data.invoices||[])]);
  setHasMore(Boolean(data.hasMore));
 };
 useEffect(()=>{
  let live=true;
  (async()=>{try{await load(0);}catch(e){if(live)setError(e.message); }
   finally{if(live)setLoading(false);}})();
  return()=>{live=false};
 },[]);
 useEffect(()=>{
  const requested=new URLSearchParams(window.location.search).get("id");
  if(requested){setFilter("all");setTripletexId(requested);}
 },[]);
 async function upload(event){
  event.preventDefault();
  if(busy||!file)return;
  if(file.size>4*1024*1024||file.size<12){
   setError("Velg en PDF eller et bilde under 4 MB.");return;
  }
  if(!form.notDuplicateConfirmed){
   setError("Bekreft at fakturaen ikke er importert fra før.");return;
  }
  if(!window.confirm("Arkivere faktura "+form.invoiceNumber+" fra "+form.sourceSystem+
   " for "+form.customerName+"?\n\nOriginalfilen lagres privat. "+
   "Det opprettes IKKE en ny faktura, ingen e-post sendes, og det blir ingen "+
   "automatisk regnskapsføring eller MVA-registrering."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const data=new FormData();
   for(const [key,value] of Object.entries(form))
    data.append(key,String(value));
   data.append("file",file);
   const response=await fetch("/api/admin/invoices/external-register",{
    method:"POST",body:data
   });
   const json=await response.json().catch(()=>({}));
   if(!response.ok||!json.ok)
    throw Error(json.error||"Registreringen er uavklart. Oppdater oversikten før du prøver igjen.");
   setForm(initial());setFile(null);setExpanded(false);
   setFilter("unpaid");setSearch("");
   setNotice("Fakturaen er arkivert. Den ligger nå blant ubetalte fakturaer.");
   await load(0);
  }catch(e){
   setError(e.message||"Fakturaen kunne ikke registreres. Sjekk arkivet før nytt forsøk.");
  }finally{setBusy(false);}
 }
 async function markPaid(row){
  if(busy||paymentId!==row.id)return;
  if(!window.confirm("Er faktura "+row.invoice_number+" på "+money(row.amount_ore)+
   " FAKTISK fullt innbetalt "+paidOn+"?\n\nDette merker fakturaen betalt kun "+
   "i Aadland Service. Ingen banktransaksjon eller Tripletex-bilag opprettes."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/invoices/external-register",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:row.id,action:"mark-paid",confirmed:true,
     paidOn,paymentNote})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)
    throw Error(data.error||"Betalingsstatus er uavklart. Oppdater arkivet.");
   setNotice("Faktura "+row.invoice_number+" er markert betalt i Aadland Service.");
   setPaymentId("");setPaymentNote("");
   await load(0);
  }catch(e){setError(e.message||"Kunne ikke lagre betalingsstatus.");}
  finally{setBusy(false);}
 }
 const sorted=[...invoices].sort((a,b)=>
  (a.status==="paid")-(b.status==="paid")||
  String(a.due_on).localeCompare(String(b.due_on)));
 const visible=sorted.filter(x=>(filter==="all"||x.status===filter)&&
  [x.invoice_number,x.customer_name,x.source_system].join(" ")
   .toLocaleLowerCase("nb-NO").includes(search.trim().toLocaleLowerCase("nb-NO")));
 const unpaid=invoices.filter(x=>x.status==="unpaid").length;
 const paid=invoices.filter(x=>x.status==="paid").length;
 return <main className="admin" style={{maxWidth:1120,margin:"0 auto",
  padding:"clamp(14px,2vw,24px)",display:"grid",gap:15}}>
  <Link href="/admin/faktura/arkiv">← Til fakturaarkivet</Link>
  <div>
   <h1 style={{margin:"0 0 6px"}}>Eksterne kundefakturaer</h1>
   <p style={muted}>Samle fakturaer som du allerede har laget i Conta, Tripletex
    eller andre systemer. Du kan laste opp originalfilen, følge forfall og
    merke fakturaene betalt når du har kontrollert innbetalingen.</p>
  </div>
  <section style={box}>
   <button type="button" onClick={()=>setExpanded(x=>!x)}
    aria-expanded={expanded} disabled={busy}
    style={{...btn,width:"100%",textAlign:"left",display:"flex",
     justifyContent:"space-between",alignItems:"center"}}>
    <strong>+ Last opp faktura fra et annet system</strong>
    <span>{expanded?"Lukk":"Åpne"}</span>
   </button>
   {expanded&&<form onSubmit={upload} style={{marginTop:15,display:"grid",gap:14}}>
    <div style={grid}>
     <label style={label}>Fakturasystem
      <input style={input} required maxLength={100} placeholder="F.eks. Conta"
       value={form.sourceSystem} onChange={e=>put("sourceSystem",e.target.value)}/></label>
     <label style={label}>Fakturanummer
      <input style={input} required maxLength={90} value={form.invoiceNumber}
       onChange={e=>put("invoiceNumber",e.target.value)}/></label>
     <label style={label}>Kundenavn
      <input style={input} required maxLength={160} value={form.customerName}
       onChange={e=>put("customerName",e.target.value)}/></label>
     <label style={label}>Beløp inkl. MVA (kr)
      <input style={input} required inputMode="decimal" placeholder="1250,00"
       value={form.amount} onChange={e=>put("amount",e.target.value)}/></label>
     <label style={label}>Fakturadato
      <input style={input} type="date" required value={form.issuedOn}
       onChange={e=>put("issuedOn",e.target.value)}/></label>
     <label style={label}>Forfallsdato
      <input style={input} type="date" required min={form.issuedOn}
       value={form.dueOn} onChange={e=>put("dueOn",e.target.value)}/></label>
    </div>
    <label style={label}>Originalfaktura (PDF eller bilde, maks 4 MB)
     <input style={input} type="file" required
      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
      onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    <label style={label}>Valgfritt notat
     <textarea rows={2} maxLength={500} value={form.note}
      onChange={e=>put("note",e.target.value)}/></label>
    <label style={{display:"flex",gap:9,alignItems:"flex-start"}}>
     <input type="checkbox" checked={form.notDuplicateConfirmed}
      onChange={e=>put("notDuplicateConfirmed",e.target.checked)}/>
     Jeg har kontrollert at fakturaen ikke allerede er registrert i dette
     arkivet eller som en ordinær faktura i Aadland Service.
    </label>
    <p style={muted}><strong>Viktig:</strong> Dette er en intern kopi med
     betalingsstatus. Det sendes ingen ny faktura og opprettes ingen ny
     omsetning, MVA-postering eller overføring til Tripletex. Originalen
     må fortsatt håndteres korrekt i faktura-/regnskapssystemet som utstedte den.</p>
    <button type="submit" disabled={busy||!file||!form.notDuplicateConfirmed}
     style={{...btn,background:"#243c4b",color:"#fff",border:0}}>
     {busy?"Lagrer originalfaktura …":"Lagre ekstern faktura"}
    </button>
   </form>}
  </section>
  {error&&<p role="alert" style={{...box,borderColor:"#c35b4f",color:"#a33127"}}>{error}</p>}
  {notice&&<p role="status" style={{...box,borderColor:"#9cbfa9"}}>{notice}</p>}
  <section style={box}>
   <h2 style={{margin:"0 0 10px",fontSize:20}}>Fakturaoversikt</h2>
   <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:13}}>
    {[["unpaid","Ubetalte ("+unpaid+")"],["paid","Betalte ("+paid+")"],
     ["all","Alle ("+invoices.length+")"]].map(([value,title])=>
     <button type="button" key={value} onClick={()=>setFilter(value)}
      aria-pressed={filter===value} style={{
       ...btn,background:filter===value?"#e8d7b9":"#f6f3ee",
       border:"1px solid #c6b9a3"
      }}>{title}</button>)}
   </div>
   <label style={label}>Søk etter kunde, fakturanummer eller system
    <input style={input} type="search" value={search} placeholder="Søk …"
     onChange={e=>setSearch(e.target.value)}/></label>
   {loading&&<p role="status">Henter eksterne fakturaer …</p>}
   {!loading&&visible.length===0&&<p style={muted}>
    Ingen fakturaer i dette utvalget.</p>}
   <div style={{display:"grid",gap:10,marginTop:15}}>
    {visible.map(x=><article key={x.id} id={"external-invoice-"+x.id} style={{
     ...box,padding:14,background:"#fffdfa",minWidth:0
    }}>
     <div style={{display:"flex",gap:12,justifyContent:"space-between",flexWrap:"wrap"}}>
      <div style={{minWidth:0,overflowWrap:"anywhere"}}>
       <strong>{x.invoice_number}</strong>
       <div>{x.customer_name}</div>
       <small style={muted}>{x.source_system} · Fakturadato {x.issued_on}
        {" "}· Forfall {x.due_on}</small>
      </div>
      <div style={{textAlign:"right"}}>
       <strong>{money(x.amount_ore)}</strong>
       <div style={{fontSize:13,fontWeight:700,
        color:x.status==="paid"?"#24714c":x.due_on<osloDateKey(new Date())?"#a43a2b":"#6d573a"}}>
        {x.status==="paid"?"Betalt "+x.paid_on:
         x.due_on<osloDateKey(new Date())?"Forfalt – ubetalt":"Ubetalt"}</div>
      </div>
     </div>
     {x.note&&<p style={muted}>{x.note}</p>}
     {x.status==="paid"&&x.payment_note&&
      <p style={muted}>Betalingsnotat: {x.payment_note}</p>}
     <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
      <a href={"/api/admin/invoices/external-register?download=1&id="+
       encodeURIComponent(x.id)} style={{padding:"10px 0",fontWeight:700}}>
       Last ned original ({x.original_filename})</a>
      <button type="button" disabled={busy}
       onClick={()=>setTripletexId(v=>v===x.id?"":x.id)}
       style={btn}>{tripletexId===x.id?"Skjul Tripletex-import":
       "Overfør til Tripletex"}</button>
      {x.status==="unpaid"&&<button type="button" disabled={busy}
       onClick={()=>{
        setPaymentId(v=>v===x.id?"":x.id);
        setPaidOn(osloDateKey(new Date()));setPaymentNote("");
       }} style={btn}>{paymentId===x.id?"Lukk betaling":"Merk som betalt"}</button>}
     </div>
     {tripletexId===x.id&&<ExternalInvoiceTripletexPanel invoice={x}
      onChanged={async()=>{try{await load(0)}catch(e){setError(e.message)}}}/>}
     {x.status==="unpaid"&&paymentId===x.id&&<div style={{borderTop:"1px solid #ddd",
      marginTop:11,paddingTop:12,display:"grid",gap:10}}>
      <p style={{...muted,margin:0}}>Merk bare fakturaen betalt når hele beløpet
       faktisk er mottatt. Statusen endres kun her, ikke i Tripletex.</p>
      <div style={grid}>
       <label style={label}>Dato pengene ble mottatt
        <input type="date" style={input} required max={osloDateKey(new Date())}
         value={paidOn} onChange={e=>setPaidOn(e.target.value)}/></label>
       <label style={label}>Betalingsnotat (valgfritt)
        <input style={input} maxLength={500} placeholder="F.eks. bankoverføring"
         value={paymentNote} onChange={e=>setPaymentNote(e.target.value)}/></label>
      </div>
      <button type="button" disabled={busy||!paidOn} onClick={()=>markPaid(x)}
       style={{...btn,background:"#243c4b",color:"#fff",border:0}}>
       {busy?"Lagrer betalingsstatus …":"Bekreft at fakturaen er betalt"}
      </button>
     </div>}
    </article>)}
   </div>
   {hasMore&&<button type="button" style={{...btn,marginTop:15}}
    disabled={moreBusy} onClick={async()=>{
     setMoreBusy(true);setError("");
     try{await load(invoices.length);}
     catch(e){setError(e.message||"Kunne ikke hente flere fakturaer.");}
     finally{setMoreBusy(false);}
    }}>{moreBusy?"Henter flere …":"Vis flere fakturaer"}</button>}
   <p style={{...muted,marginTop:15}}>
    Eksterne fakturaer er atskilt fra fakturaer utstedt i Aadland Service.
    Her kan du følge opp betalingen uten å opprette nye regnskapsbilag.
    <br/>For eldre fakturaer som også må med i MVA-avstemmingen, bruk
    {" "}<Link href="/admin/faktura/mva#eldre-kundefakturaer">
     eksisterende MVA-import</Link>, og pass på at samme salg ikke telles to ganger.
   </p>
  </section>
 </main>;
}
