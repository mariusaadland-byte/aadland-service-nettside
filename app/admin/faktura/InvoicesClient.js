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
   <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:900}}>FAKTURA</div><div style={{fontSize:12,color:"#8c342c",fontWeight:700}}>{invoice.invoice_number?"FAKTURA "+invoice.invoice_number:"FORHÅNDSVISNING – IKKE UTSTEDT"}</div></div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:24,margin:"24px 0"}}>
   <div><div style={{fontSize:11,fontWeight:800,color:"#8a6b35"}}>FAKTURAMOTTAKER</div><strong>{invoice.customer?.name||"Kundenavn"}</strong><div style={{whiteSpace:"pre-line"}}>{invoice.customer?.address||"Kundeadresse"}</div>{invoice.customer?.phone&&<div>Telefon: {invoice.customer.phone}</div>}{invoice.customer?.email&&<div style={{overflowWrap:"anywhere"}}>{invoice.customer.email}</div>}</div>
   <div><strong>{COMPANY_INFO.name}</strong><div>{COMPANY_INFO.address}</div><div>{COMPANY_INFO.postalCode} {COMPANY_INFO.city}</div><div>Org.nr. {COMPANY_INFO.orgNumber}</div><div>Telefon: {COMPANY_INFO.phone}</div><div>{COMPANY_INFO.email}</div></div>
  </div>
  <div style={{display:"flex",gap:20,justifyContent:"space-between",flexWrap:"wrap",fontSize:12,marginBottom:18}}><div>Fakturanummer<br/><b>{invoice.invoice_number||(example?"EKSEMPEL":"Tildeles ved utstedelse")}</b></div><div>Fakturadato<br/><b>{invoice.issued_date||"Tildeles ved utstedelse"}</b></div><div>Forfallsdato<br/><b>{invoice.due_date||"Ikke valgt"}</b></div>{invoice.customer?.workDate&&<div>Leveringsdato<br/><b>{invoice.customer.workDate}</b></div>}</div>
  <h3 style={{marginBottom:18}}>{invoice.title||"Oppdrag"}</h3>{invoice.customer?.workDescription&&<section style={{marginBottom:22,whiteSpace:"pre-wrap",lineHeight:1.5}}><strong>Utført arbeid og hva som inngår</strong><p>{invoice.customer.workDescription}</p></section>}
  <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{background:"#171511",color:"#fff"}}>{["Beskrivelse","Antall","Enhetspris eks. mva.","Sum eks. MVA","Sum inkl. MVA","MVA %"].map(x=><th key={x} style={{padding:"12px 9px",textAlign:x==="Beskrivelse"?"left":"right"}}>{x}</th>)}</tr></thead><tbody>{lines.map((l,i)=><tr key={i} style={{borderBottom:"1px solid #e7e1d6"}}><td style={{padding:"12px 9px"}}>{l.description}</td><td style={{textAlign:"right",padding:9}}>{l.quantity} {l.unit}</td><td style={{textAlign:"right",padding:9}}>{fmt(l.unitPriceOre)}</td><td style={{textAlign:"right",padding:9}}>{fmt(Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0)))}</td><td style={{textAlign:"right",padding:9,fontWeight:700}}>{fmt(Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0))*(1+Number(l.vatRate||0)/100))}</td><td style={{textAlign:"right",padding:9}}>{l.vatRate}%</td></tr>)}</tbody></table></div>
  <div style={{marginLeft:"auto",maxWidth:330,marginTop:22}}><div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}><span>Sum eks. MVA</span><b>{fmt(subtotal)}</b></div><div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}><span>MVA</span><b>{fmt(vat)}</b></div><div style={{display:"flex",justifyContent:"space-between",padding:"14px 10px",background:"#f3eee5",fontSize:19,fontWeight:900}}><span>Å betale inkl. MVA</span><span>{fmt(subtotal+vat)}</span></div></div>
  <div style={{background:"#f8f5ef",padding:20,marginTop:35,borderLeft:"4px solid #c99a49"}}><b>Betalingsinformasjon</b><p style={{margin:"8px 0 0"}}>Kontonummer: <b>8450 46 22699</b><br/>Forfall: <b>{invoice.due_date||"Velges før utstedelse"}</b><br/>Betalingsreferanse: <b>{invoice.invoice_number||(example?"EKSEMPEL":"Fakturanummer tildeles ved utstedelse")}</b></p></div>
  {invoice.notes&&<p style={{marginTop:24,whiteSpace:"pre-line"}}>{invoice.notes}</p>}
  <div style={{borderTop:"1px solid #ddd4c5",marginTop:30,paddingTop:16,fontSize:12,color:"#686056"}}>{COMPANY_INFO.name} · Org.nr. {COMPANY_INFO.orgNumber}<br/>{COMPANY_ADDRESS}<br/>noreply@aadland-service.no · Telefon {COMPANY_INFO.phone}</div>
 </article>;
}
export default function InvoicesClient(){
 const [items,setItems]=useState([]),[quotes,setQuotes]=useState([]),[active,setActive]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState("");
 async function load(){try{const [a,b]=await Promise.all([fetch("/api/admin/invoices"),fetch("/api/admin/quotes")]);const x=await a.json(),y=await b.json();if(!a.ok)throw Error(x.error);setItems(x.invoices||[]);setQuotes((y.quotes||[]).filter(q=>q.status==="accepted"));}catch(e){setError(e.message||"Kunne ikke laste fakturaer.");}}
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get("id");if(id)setActive(id);load()},[]);
 async function create(quoteId){setBusy(true);setError("");try{const res=await fetch("/api/admin/invoices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(quoteId?{quoteId}:{})});const data=await res.json();if(!res.ok)throw Error(data.error);await load();setActive(data.id);window.history.replaceState(null,"","/admin/faktura?id="+encodeURIComponent(data.id));setSaved(data.count>1?data.count+" fakturakladder er klare.":"");}catch(e){setError(e.message)}finally{setBusy(false)}}
 const draft=items.find(x=>x.id===active);
 const [form,setForm]=useState(null);
 const [previewOpen,setPreviewOpen]=useState(false);
 async function downloadPdf(){setBusy(true);setError("");setSaved("");try{const id=form?form.id:"example";if(form?.status==="draft"){await persist(form);setSaved("Kladden er lagret.");}const response=await fetch("/api/admin/invoices/pdf?id="+encodeURIComponent(id));if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||"Kunne ikke lage PDF.");}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Aadland-Service-"+(id==="example"?"TESTFAKTURA":id)+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{setForm(draft?{...draft,customer:{...draft.customer},line_items:draft.line_items.map(x=>({...x}))}:null)},[active,items]);
 const change=(key,value)=>{setSaved("");setForm(x=>({...x,[key]:value}));};
 const changeLine=(i,key,value)=>{setSaved("");setForm(x=>({...x,line_items:x.line_items.map((l,j)=>j===i?{...l,[key]:value}:l)}));};
 async function persist(snapshot){const res=await fetch("/api/admin/invoices",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:snapshot.id,title:snapshot.title,customer:snapshot.customer,pricingModel:snapshot.pricing_model,lineItems:snapshot.line_items,notes:snapshot.notes,dueDate:snapshot.due_date})});const data=await res.json();if(!res.ok)throw Error(data.error||"Fakturakladden kunne ikke lagres.");}
 async function save(){setBusy(true);setError("");setSaved("");try{await persist(form);setSaved("Kladden er lagret.");await load();}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function openCustomerCard(){
  if(!form||busy)return;setBusy(true);setError("");
  try{if(form.status==="draft")await persist(form);const r=await fetch("/api/admin/invoices/customer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:form.id})});const data=await r.json();if(!r.ok)throw Error(data.error);window.location.assign(data.url);}
  catch(e){setError(e.message);setBusy(false)}
 }
 async function sendInvoice(){
  if(!form||busy)return;
  setBusy(true);setError("");setSaved("");
  try{
   if(form.status==="draft"){
    if(!form.customer?.name?.trim()||!form.customer?.address?.trim())throw Error("Fyll inn kundenavn og adresse før sending.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer?.email||""))throw Error("Fyll inn en gyldig e-postadresse.");
    if(!form.customer?.workDate)throw Error("Velg leveringsdato før sending.");
    if(!form.due_date)throw Error("Velg forfallsdato før sending.");
    await persist(form);
   }
   const response=await fetch("/api/admin/invoices/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:form.id})});
   const data=await response.json();
   await load();
   if(!response.ok)throw Error(data.error||"Fakturaen kunne ikke sendes.");
   setSaved("Faktura "+data.invoiceNumber+" er "+(data.alreadySent?"allerede sendt":"sendt")+" til "+data.sentTo+".");
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function exportCsv(){if(!form)return;const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';const rows=[["Beskrivelse","Antall","Enhet","Enhetspris eks MVA (kr)","MVA %"],...form.line_items.map(l=>[l.description,l.quantity,l.unit,(Number(l.unitPriceOre)/100).toFixed(2),l.vatRate])];const csv="\uFEFF"+rows.map(row=>row.map(esc).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="fakturakladd-"+form.id+".csv";a.click();URL.revokeObjectURL(url);}
 return <main className="admin" style={{maxWidth:1100,margin:"auto",padding:24}}><Link href="/admin">← Admin</Link><h1>Faktura</h1><p>Opprett, kontroller og send fakturaer med PDF-vedlegg. Fakturanummer tildeles automatisk ved sending.</p>
 {error&&<p role="alert" style={{color:"crimson"}}>{error}</p>}
 <section className="card" style={{padding:18,marginBottom:20}}><h2>Opprett fakturakladd</h2><p>Godkjente tilbud får egne kladder for forskudd, delbetaling og sluttoppgjør etter tilbudets betalingsplan. Velg forfallsdato på hver kladd når den skal faktureres.</p><button disabled={busy} onClick={()=>create(null)}>Ny tom kladd</button> <select id="invoiceQuote" defaultValue=""><option value="">Velg godkjent tilbud</option>{quotes.map(q=><option key={q.id} value={q.id}>{q.quoteNumber} – {q.title}</option>)}</select> <button disabled={busy} onClick={()=>{const id=document.getElementById("invoiceQuote").value;if(id)create(id);else setError("Velg et godkjent tilbud.");}}>Hent betalingsplan fra tilbud</button></section>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,330px),1fr))",gap:20,alignItems:"start"}}>
 <section className="card" style={{padding:16}}><h2>Fakturaer og kladder</h2>{items.map(x=><button key={x.id} disabled={busy} aria-pressed={active===x.id} onClick={()=>{setActive(x.id);window.history.replaceState(null,"","/admin/faktura?id="+encodeURIComponent(x.id));setSaved("");}} style={{display:"block",marginBottom:8,width:"100%",textAlign:"left",padding:10,border:active===x.id?"2px solid #b58b47":undefined}}>{x.invoice_number?x.invoice_number+" · ":""}{x.title||"Faktura"}<br/>{x.customer?.name} · {money(total(x.line_items))}<br/><small>{x.installment_index>0?"Del "+x.installment_index+" · "+x.installment_percent+" %":"Samlet faktura"} · {x.sent_at?"Sendt":x.status==="issued"?"Utstedt – ikke bekreftet sendt":"Kladd"} · Forfall: {x.due_date||"Ikke valgt"}</small></button>)}</section>
 <section className="card" style={{padding:18}}>{form?<><section style={{borderBottom:"1px solid #d8c9ae",paddingBottom:16,marginBottom:18}}><h2>{form.invoice_number?"Faktura "+form.invoice_number:"Send faktura"}</h2><button type="button" disabled={busy} onClick={openCustomerCard}>Åpne kundekort / rett kundeopplysninger</button><p><strong>{form.customer?.name}</strong> · {money(total(form.line_items))}<br/>Til: {form.customer?.email||"Fyll inn e-postadressen nedenfor"}</p>{form.status==="draft"?<p>Kontroller navn, adresse, leveringsdato og forfall. Ved sending tildeles fakturanummer, og fakturaen låses for endringer.</p>:<p>Utstedt {form.issued_date}. Fakturaen er låst for endringer.</p>}<button type="button" disabled={busy||Boolean(form.sent_at)} onClick={sendInvoice}>{busy?"Behandler …":form.sent_at?"Sendt på e-post":form.status==="draft"?"Utsted og send faktura på e-post":"Prøv e-postsending igjen"}</button>{form.sent_at&&<p role="status">Sendt til {form.customer?.email}.</p>}{form.delivery_error&&!form.sent_at&&<p role="alert">{form.delivery_error}</p>}{saved&&<p role="status">{saved}</p>}</section><fieldset disabled={busy||form.status!=="draft"} style={{border:0,padding:0,minWidth:0}}><h2>{form.status==="draft"?"Rediger fakturakladd":"Fakturadetaljer"}</h2><p><strong>{form.customer?.name}</strong> · {money(total(form.line_items))}</p>{form.installment_index>0&&<p><b>{form.installment_label} – {form.installment_percent} %</b><br/>{form.installment_trigger}</p>}<label htmlFor="invoiceDueDate"><b>Forfallsdato</b><input id="invoiceDueDate" type="date" value={form.due_date||""} onChange={e=>change("due_date",e.target.value)}/></label><button type="button" disabled={busy} onClick={save}>{busy?"Lagrer …":"Lagre forfallsdato og kladd"}</button>{form.status==="draft"&&<p>Fakturanummer tildeles når du trykker «Utsted og send faktura på e-post».</p>}
 <label>Oppdrag <input value={form.title||""} onChange={e=>change("title",e.target.value)}/></label>
 <label>Kundenavn <input value={form.customer?.name||""} onChange={e=>change("customer",{...form.customer,name:e.target.value})}/></label>
 <label>Telefonnummer <input type="tel" value={form.customer?.phone||""} onChange={e=>change("customer",{...form.customer,phone:e.target.value})}/></label>
 <label>Kundens e-post <input type="email" value={form.customer?.email||""} onChange={e=>change("customer",{...form.customer,email:e.target.value})}/></label>
 <label>Adresse <input value={form.customer?.address||""} onChange={e=>change("customer",{...form.customer,address:e.target.value})}/></label>
 <label>Leveringsdato / avtalt leveringsdato <input type="date" value={form.customer?.workDate||""} onChange={e=>change("customer",{...form.customer,workDate:e.target.value})}/></label>
 <label>Arbeidssted (hvis forskjellig fra kundens adresse) <input value={form.customer?.workAddress||""} onChange={e=>change("customer",{...form.customer,workAddress:e.target.value})}/></label>
 <label>Prismodell <select value={form.pricing_model} onChange={e=>change("pricing_model",e.target.value)}><option value="fixed">Fastpris</option><option value="hourly">Timepris – kontroller faktiske timer</option><option value="estimate">Prisoverslag</option></select></label>
 <label>Arbeidsbeskrivelse – utført arbeid og hva som inngår <textarea rows={6} maxLength={3000} placeholder="Beskriv arbeidet, materialene og hva som er inkludert i fakturaen..." value={form.customer?.workDescription||""} onChange={e=>change("customer",{...form.customer,workDescription:e.target.value})}/></label>
 <h3>Fakturalinjer</h3>{form.line_items.map((l,i)=><div key={i} style={{borderBottom:"1px solid #ccc",padding:"12px 0"}}><input aria-label="Beskrivelse" value={l.description||""} onChange={e=>changeLine(i,"description",e.target.value)}/><label>Antall <input type="number" min="0" step="0.01" value={l.quantity} onChange={e=>changeLine(i,"quantity",e.target.value)}/></label><label>Enhetspris eks. MVA (kr) <input type="number" min="0" step="0.01" value={(Number(l.unitPriceOre)||0)/100} onChange={e=>changeLine(i,"unitPriceOre",Math.round(Number(e.target.value)*100))}/></label><label>MVA % <select value={l.vatRate} onChange={e=>changeLine(i,"vatRate",Number(e.target.value))}><option value="25">25</option><option value="15">15</option><option value="12">12</option><option value="0">0</option></select></label></div>)}
 <button onClick={()=>change("line_items",[...form.line_items,{description:"",quantity:1,unit:"stk",unitPriceOre:0,vatRate:25,type:"work"}])}>Legg til linje</button>
 <h3>Sum inkl. MVA: {money(total(form.line_items))}</h3>
 <label>Notater <textarea value={form.notes||""} onChange={e=>change("notes",e.target.value)}/></label>
 <p>Kontonummer: <b>8450 46 22699</b> · Avsender: noreply@aadland-service.no</p>
 <button type="button" onClick={()=>{setPreviewOpen(true)}}>Vis fakturakladd</button> <button disabled={busy} onClick={save}>Lagre kladd</button> <button onClick={exportCsv}>Eksporter linjer (CSV)</button> {saved&&<span>{saved}</span>}
 </fieldset></>:<p>Velg en kladd til venstre.</p>}</section></div>
 <section className="invoicePreviewSection" style={{marginTop:20,border:"1px solid #d8c9ae",borderRadius:14,padding:"16px 18px",background:"#fff",maxWidth:850}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
 <div><h2 style={{margin:"0 0 4px",fontSize:20}}>Fakturaforhåndsvisning</h2><p style={{margin:0,fontSize:13,color:"#655e54"}}>{form?"Se fakturakladden i full størrelse.":"Se et eksempel på fakturadesignet."}</p></div>
 <button type="button" aria-expanded={previewOpen} onClick={()=>setPreviewOpen(x=>!x)}>{previewOpen?"Lukk faktura":"Vis faktura ›"}</button>
 </div>
 {previewOpen&&<div style={{marginTop:16}}>
 <p style={{fontSize:13}}>{form?.invoice_number?"Utstedt faktura "+form.invoice_number:"Forhåndsvisning – ikke utstedt."}</p>
 <button type="button" disabled={busy} onClick={downloadPdf}>Last ned faktura som PDF</button>{" "}
 <button type="button" onClick={()=>window.print()}>Skriv ut</button>
 <InvoicePreview invoice={form||sample} example={!form}/>
 </div>}
 </section></main>;
}