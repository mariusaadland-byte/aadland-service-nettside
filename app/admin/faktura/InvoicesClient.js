"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {COMPANY_INFO,COMPANY_ADDRESS} from "../../../lib/companyInfo";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
const total=lines=>(lines||[]).reduce((sum,l)=>{const net=Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0));return sum+net+Math.round(net*Number(l.vatRate||0)/100)},0);
const sample={title:"Eksempel – montering og vedlikehold",customer:{name:"Ola Nordmann",address:"Eksempelveien 12, 5000 Bergen",workDescription:"Utført montering og tilpasning som avtalt med kunden.\nFakturaen omfatter 8 timer tømrerarbeid samt materialer og festemidler."},pricing_model:"fixed",line_items:[{description:"Tømrerarbeid",quantity:8,unit:"time",unitPriceOre:65000,vatRate:25},{description:"Materialer og festemidler",quantity:1,unit:"stk",unitPriceOre:189000,vatRate:25}],due_date:"2026-11-03",notes:"Takk for oppdraget!"};
function InvoicePreview({invoice,example=false}){
 const lines=invoice.line_items||[];
 const subtotal=lines.reduce((sum,l)=>sum+Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0)),0);
 const vat=lines.reduce((sum,l)=>{const net=Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0));return sum+Math.round(net*Number(l.vatRate||0)/100)},0);
 const fmt=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
 return <article className="invoicePrintable" style={{background:"#fff",color:"#201d18",border:"1px solid #ddd4c5",boxShadow:"0 8px 32px #00000013",padding:"clamp(18px,4vw,48px)",marginTop:16,maxWidth:850}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"start",borderBottom:"3px solid #c99a49",paddingBottom:25,flexWrap:"wrap"}}>
   <div><img src="/aadland-service-logo.webp" alt="Aadland Service sin originale logo" style={{width:185,maxWidth:"100%",height:"auto",objectFit:"contain"}}/></div>
   <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:900}}>FAKTURA</div><div style={{fontSize:12,color:"#8c342c",fontWeight:700}}>FORHÅNDSVISNING – IKKE UTSTEDT</div></div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:25,margin:"30px 0"}}>
   <div><div style={{fontSize:11,fontWeight:800,color:"#8a6b35"}}>FAKTURAMOTTAKER</div><strong>{invoice.customer?.name||"Kundenavn"}</strong><div style={{whiteSpace:"pre-line",marginTop:5}}>{invoice.customer?.address||"Kundeadresse"}</div></div>
   <div><div style={{fontSize:11,fontWeight:800,color:"#8a6b35"}}>FAKTURADETALJER</div><div>Fakturanummer: <b>{example?"EKSEMPEL":"Tildeles ved utstedelse"}</b></div><div>Forfallsdato: <b>{invoice.due_date||"Ikke valgt"}</b></div><div>Referanse: <b>{example?"EKSEMPEL":"Tildeles ved utstedelse"}</b></div></div>
  </div>
  <h3 style={{marginBottom:18}}>{invoice.title||"Oppdrag"}</h3>{invoice.customer?.workDescription&&<section style={{marginBottom:22,whiteSpace:"pre-wrap",lineHeight:1.5}}><strong>Utført arbeid og hva som inngår</strong><p>{invoice.customer.workDescription}</p></section>}
  <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{background:"#171511",color:"#fff"}}>{["Beskrivelse","Antall","Enhetspris eks. mva.","Sum eks. MVA","Sum inkl. MVA","MVA %"].map(x=><th key={x} style={{padding:"12px 9px",textAlign:x==="Beskrivelse"?"left":"right"}}>{x}</th>)}</tr></thead><tbody>{lines.map((l,i)=><tr key={i} style={{borderBottom:"1px solid #e7e1d6"}}><td style={{padding:"12px 9px"}}>{l.description}</td><td style={{textAlign:"right",padding:9}}>{l.quantity} {l.unit}</td><td style={{textAlign:"right",padding:9}}>{fmt(l.unitPriceOre)}</td><td style={{textAlign:"right",padding:9}}>{fmt(Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0)))}</td><td style={{textAlign:"right",padding:9,fontWeight:700}}>{fmt(Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0))*(1+Number(l.vatRate||0)/100))}</td><td style={{textAlign:"right",padding:9}}>{l.vatRate}%</td></tr>)}</tbody></table></div>
  <div style={{marginLeft:"auto",maxWidth:330,marginTop:22}}><div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}><span>Sum eks. MVA</span><b>{fmt(subtotal)}</b></div><div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}><span>MVA</span><b>{fmt(vat)}</b></div><div style={{display:"flex",justifyContent:"space-between",padding:"14px 10px",background:"#f3eee5",fontSize:19,fontWeight:900}}><span>Å betale inkl. MVA</span><span>{fmt(subtotal+vat)}</span></div></div>
  <div style={{background:"#f8f5ef",padding:20,marginTop:35,borderLeft:"4px solid #c99a49"}}><b>Betalingsinformasjon</b><p style={{margin:"8px 0 0"}}>Kontonummer: <b>8450 46 22699</b><br/>Forfall: <b>{invoice.due_date||"Velges før utstedelse"}</b><br/>Betalingsreferanse: <b>{example?"EKSEMPEL":"Fakturanummer tildeles ved utstedelse"}</b></p></div>
  {invoice.notes&&<p style={{marginTop:24,whiteSpace:"pre-line"}}>{invoice.notes}</p>}
  <div style={{borderTop:"1px solid #ddd4c5",marginTop:30,paddingTop:16,fontSize:12,color:"#686056"}}>{COMPANY_INFO.name} · Org.nr. {COMPANY_INFO.orgNumber}<br/>{COMPANY_ADDRESS}<br/>noreply@aadland-service.no · Telefon {COMPANY_INFO.phone}</div>
 </article>;
}
export default function InvoicesClient(){
 const [items,setItems]=useState([]),[quotes,setQuotes]=useState([]),[active,setActive]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState("");
 async function load(){try{const [a,b]=await Promise.all([fetch("/api/admin/invoices"),fetch("/api/admin/quotes")]);const x=await a.json(),y=await b.json();if(!a.ok)throw Error(x.error);setItems(x.invoices||[]);setQuotes((y.quotes||[]).filter(q=>q.status==="accepted"));}catch(e){setError(e.message||"Kunne ikke laste fakturaer.");}}
 useEffect(()=>{load()},[]);
 async function create(quoteId){setBusy(true);setError("");try{const res=await fetch("/api/admin/invoices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(quoteId?{quoteId}:{})});const data=await res.json();if(!res.ok)throw Error(data.error);await load();setActive(data.id);setSaved("");}catch(e){setError(e.message)}finally{setBusy(false)}}
 const draft=items.find(x=>x.id===active);
 const [form,setForm]=useState(null);
 const [showPreview,setShowPreview]=useState(false);
 const [previewOpen,setPreviewOpen]=useState(false);
 async function downloadPdf(){setBusy(true);setError("");try{const id=showPreview&&form?form.id:"example";const response=await fetch("/api/admin/invoices/pdf?id="+encodeURIComponent(id));if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||"Kunne ikke lage PDF.");}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Aadland-Service-"+(id==="example"?"TESTFAKTURA":id)+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){setError(e.message)}finally{setBusy(false)}}
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
 <label>Arbeidsbeskrivelse – utført arbeid og hva som inngår <textarea rows={6} maxLength={3000} placeholder="Beskriv arbeidet, materialene og hva som er inkludert i fakturaen..." value={form.customer?.workDescription||""} onChange={e=>change("customer",{...form.customer,workDescription:e.target.value})}/></label>
 <h3>Fakturalinjer</h3>{form.line_items.map((l,i)=><div key={i} style={{borderBottom:"1px solid #ccc",padding:"12px 0"}}><input aria-label="Beskrivelse" value={l.description||""} onChange={e=>changeLine(i,"description",e.target.value)}/><label>Antall <input type="number" min="0" step="0.01" value={l.quantity} onChange={e=>changeLine(i,"quantity",e.target.value)}/></label><label>Enhetspris eks. MVA (kr) <input type="number" min="0" step="0.01" value={(Number(l.unitPriceOre)||0)/100} onChange={e=>changeLine(i,"unitPriceOre",Math.round(Number(e.target.value)*100))}/></label><label>MVA % <select value={l.vatRate} onChange={e=>changeLine(i,"vatRate",Number(e.target.value))}><option value="25">25</option><option value="15">15</option><option value="12">12</option><option value="0">0</option></select></label></div>)}
 <button onClick={()=>change("line_items",[...form.line_items,{description:"",quantity:1,unit:"stk",unitPriceOre:0,vatRate:25,type:"work"}])}>Legg til linje</button>
 <h3>Sum inkl. MVA: {money(total(form.line_items))}</h3>
 <label>Notater <textarea value={form.notes||""} onChange={e=>change("notes",e.target.value)}/></label>
 <p>Kontonummer: <b>8450 46 22699</b> · Avsender ved senere utsending: noreply@aadland-service.no</p>
 <button type="button" onClick={()=>{setShowPreview(true);setPreviewOpen(true)}}>Vis fakturakladd</button> <button disabled={busy} onClick={save}>Lagre kladd</button> <button onClick={exportCsv}>Eksporter linjer (CSV)</button> {saved&&<span>{saved}</span>}
 </>:<p>Velg en kladd til venstre.</p>}</section></div>
 <section className="invoicePreviewSection" style={{marginTop:20,border:"1px solid #d8c9ae",borderRadius:14,padding:"16px 18px",background:"#fff",maxWidth:850}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
 <div><h2 style={{margin:"0 0 4px",fontSize:20}}>Fakturaforhåndsvisning</h2><p style={{margin:0,fontSize:13,color:"#655e54"}}>{form?"Se fakturakladden i full størrelse.":"Se et eksempel på fakturadesignet."}</p></div>
 <button type="button" aria-expanded={previewOpen} onClick={()=>setPreviewOpen(x=>!x)}>{previewOpen?"Lukk faktura":"Vis faktura ›"}</button>
 </div>
 {previewOpen&&<div style={{marginTop:16}}>
 <p style={{fontSize:13}}>Forhåndsvisning – ikke utstedt.</p>
 <button type="button" disabled={busy} onClick={downloadPdf}>Last ned faktura som PDF</button>{" "}
 <button type="button" onClick={()=>window.print()}>Skriv ut</button>
 <InvoicePreview invoice={showPreview&&form?form:sample} example={!(showPreview&&form)}/>
 </div>}
 </section></main>;
}