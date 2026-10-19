"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
const total=lines=>(lines||[]).reduce((sum,l)=>{const net=Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0));return sum+net+Math.round(net*Number(l.vatRate||0)/100)},0);
export default function InvoicesClient(){
 const [items,setItems]=useState([]),[quotes,setQuotes]=useState([]),[active,setActive]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState("");
 async function load(){try{const [a,b]=await Promise.all([fetch("/api/admin/invoices"),fetch("/api/admin/quotes")]);const x=await a.json(),y=await b.json();if(!a.ok)throw Error(x.error);setItems(x.invoices||[]);setQuotes((y.quotes||[]).filter(q=>q.status==="accepted"));}catch(e){setError(e.message||"Kunne ikke laste fakturaer.");}}
 useEffect(()=>{load()},[]);
 async function create(quoteId){setBusy(true);setError("");try{const res=await fetch("/api/admin/invoices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(quoteId?{quoteId}:{})});const data=await res.json();if(!res.ok)throw Error(data.error);await load();setActive(data.id);setSaved("");}catch(e){setError(e.message)}finally{setBusy(false)}}
 const draft=items.find(x=>x.id===active);
 const [form,setForm]=useState(null);
 useEffect(()=>{setForm(draft?{...draft,customer:{...draft.customer},line_items:draft.line_items.map(x=>({...x}))}:null)},[active,items]);
 const change=(key,value)=>setForm(x=>({...x,[key]:value}));
 const changeLine=(i,key,value)=>setForm(x=>({...x,line_items:x.line_items.map((l,j)=>j===i?{...l,[key]:value}:l)}));
 async function save(){setBusy(true);setError("");setSaved("");try{const res=await fetch("/api/admin/invoices",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:form.id,title:form.title,customer:form.customer,pricingModel:form.pricing_model,lineItems:form.line_items,notes:form.notes,dueDate:form.due_date})});const data=await res.json();if(!res.ok)throw Error(data.error);setSaved("Kladden er lagret.");await load();}catch(e){setError(e.message)}finally{setBusy(false)}}
 function exportCsv(){if(!form)return;const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';const rows=[["Beskrivelse","Antall","Enhet","Enhetspris eks MVA (kr)","MVA %"],...form.line_items.map(l=>[l.description,l.quantity,l.unit,(Number(l.unitPriceOre)/100).toFixed(2),l.vatRate])];const csv="\uFEFF"+rows.map(row=>row.map(esc).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="fakturakladd-"+form.id+".csv";a.click();URL.revokeObjectURL(url);}
 return <main className="admin" style={{maxWidth:1100,margin:"auto",padding:24}}><Link href="/admin">← Admin</Link><h1>Faktura</h1><p>Opprett og rediger fakturakladder. Kladdene er ikke utstedte fakturaer og kan ikke sendes ennå.</p>
 {error&&<p role="alert" style={{color:"crimson"}}>{error}</p>}
 <section className="card" style={{padding:18,marginBottom:20}}><h2>Opprett fakturakladd</h2><button disabled={busy} onClick={()=>create(null)}>Ny tom kladd</button> <select id="invoiceQuote" defaultValue=""><option value="">Velg godkjent tilbud</option>{quotes.map(q=><option key={q.id} value={q.id}>{q.quoteNumber} – {q.title}</option>)}</select> <button disabled={busy} onClick={()=>{const id=document.getElementById("invoiceQuote").value;if(id)create(id);else setError("Velg et godkjent tilbud.");}}>Opprett fra tilbud</button></section>
 <div style={{display:"grid",gridTemplateColumns:"minmax(200px,1fr) minmax(300px,2fr)",gap:20,alignItems:"start"}}>
 <section className="card" style={{padding:16}}><h2>Kladder</h2>{items.map(x=><button key={x.id} onClick={()=>{setActive(x.id);setSaved("");}} style={{display:"block",marginBottom:8,width:"100%",textAlign:"left",padding:10}}>{x.title||"Faktura"}<br/>{x.customer?.name} · {money(total(x.line_items))}</button>)}</section>
 <section className="card" style={{padding:18}}>{form?<><h2>Rediger fakturakladd</h2><p>Ingen fakturanummer er tildelt. Ikke send dette som endelig faktura.</p>
 <label>Oppdrag <input value={form.title||""} onChange={e=>change("title",e.target.value)}/></label>
 <label>Kundenavn <input value={form.customer?.name||""} onChange={e=>change("customer",{...form.customer,name:e.target.value})}/></label>
 <label>Kundens e-post <input type="email" value={form.customer?.email||""} onChange={e=>change("customer",{...form.customer,email:e.target.value})}/></label>
 <label>Adresse <input value={form.customer?.address||""} onChange={e=>change("customer",{...form.customer,address:e.target.value})}/></label>
 <label>Prismodell <select value={form.pricing_model} onChange={e=>change("pricing_model",e.target.value)}><option value="fixed">Fastpris</option><option value="hourly">Timepris – kontroller faktiske timer</option><option value="estimate">Prisoverslag</option></select></label>
 <label>Forfallsdato <input type="date" value={form.due_date||""} onChange={e=>change("due_date",e.target.value)}/></label>
 <h3>Fakturalinjer</h3>{form.line_items.map((l,i)=><div key={i} style={{borderBottom:"1px solid #ccc",padding:"12px 0"}}><input aria-label="Beskrivelse" value={l.description||""} onChange={e=>changeLine(i,"description",e.target.value)}/><label>Antall <input type="number" min="0" step="0.01" value={l.quantity} onChange={e=>changeLine(i,"quantity",e.target.value)}/></label><label>Enhetspris eks. MVA (kr) <input type="number" min="0" step="0.01" value={(Number(l.unitPriceOre)||0)/100} onChange={e=>changeLine(i,"unitPriceOre",Math.round(Number(e.target.value)*100))}/></label><label>MVA % <select value={l.vatRate} onChange={e=>changeLine(i,"vatRate",Number(e.target.value))}><option value="25">25</option><option value="15">15</option><option value="12">12</option><option value="0">0</option></select></label></div>)}
 <button onClick={()=>change("line_items",[...form.line_items,{description:"",quantity:1,unit:"stk",unitPriceOre:0,vatRate:25,type:"work"}])}>Legg til linje</button>
 <h3>Sum inkl. MVA: {money(total(form.line_items))}</h3>
 <label>Notater <textarea value={form.notes||""} onChange={e=>change("notes",e.target.value)}/></label>
 <p>Kontonummer: <b>8450 46 22699</b> · Avsender ved senere utsending: faktura@aadland-service.no</p>
 <button disabled={busy} onClick={save}>Lagre kladd</button> <button onClick={exportCsv}>Eksporter linjer (CSV)</button> {saved&&<span>{saved}</span>}
 </>:<p>Velg en kladd til venstre.</p>}</section></div></main>;
}