"use client";
import {useEffect,useRef,useState} from "react";
import {invoiceGrossOre,invoiceTotalOre} from "../../../lib/invoicePaymentStatus";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100);
export default function InvoiceCreditNotePanel({invoice,disabled=false,onRefresh}){
 const [notes,setNotes]=useState([]),[qty,setQty]=useState({}),[reason,setReason]=useState("");
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [loaded,setLoaded]=useState(false),[canIssue,setCanIssue]=useState(false);
 const requestId=useRef(null);
 const invoiceId=invoice.id;
 async function refresh(){
  const r=await fetch("/api/admin/invoices/credit-notes?invoiceId="+encodeURIComponent(invoiceId),{cache:"no-store"});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Kreditnotahistorikken er utilgjengelig.");
  setNotes(d.creditNotes||[]);setCanIssue(d.canIssue===true);setLoaded(true);
 }
 useEffect(()=>{let active=true;setLoaded(false);setCanIssue(false);setNotes([]);setError("");setNotice("");setOpen(false);setQty({});requestId.current=null;
  fetch("/api/admin/invoices/credit-notes?invoiceId="+encodeURIComponent(invoiceId),{cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setNotes(d.creditNotes||[]);setCanIssue(d.canIssue===true);setLoaded(true);}})
   .catch(e=>{if(active)setError(e.message||"Kunne ikke hente kreditnotaer.");});
  return()=>{active=false};
 },[invoiceId]);
 const remaining=(invoice.line_items||[]).map((line,index)=>{
  const credited=notes.reduce((sum,note)=>sum+(note.lines||[]).filter(item=>Number(item.sourceIndex)===index)
   .reduce((n,item)=>n+Number(item.quantity||0),0),0);
  return Math.max(0,Math.round((Number(line.quantity||0)-credited)*1000)/1000);
 });
 const lines=(invoice.line_items||[]).flatMap((line,index)=>{
  const n=Number(String(qty[index]||"").replace(",","."));
  if(!Number.isFinite(n)||n<=0)return [];
  const net=Math.round(n*Number(line.unitPriceOre||0));
  const vat=Math.round(net*Number(line.vatRate||0)/100);
  return [{sourceIndex:index,quantity:n,net,vat,gross:net+vat}];
 });
 const total=lines.reduce((sum,x)=>sum+x.gross,0),paid=Math.max(0,Number(invoice.paid_ore)||0);
 const netOutstanding=Math.max(0,invoiceTotalOre(invoice)-paid);
 const valid=loaded&&lines.length>0&&lines.every(x=>x.quantity<=remaining[x.sourceIndex]&&
  Math.round(x.quantity*1000)===x.quantity*1000&&x.gross>0)
  &&total<=netOutstanding&&reason.trim().length>=5&&reason.trim().length<=500;
 async function sendCredit(note){
  if(busy||disabled||!canIssue||!note?.id||note.sent_at)return;
  const recipient=String(invoice.customer?.email||"").trim();
  if(!recipient||!window.confirm("Sende kreditnota "+note.credit_number+" som PDF til "+recipient+
   "?\\n\\nKreditert beløp: "+money(note.total_ore)+". Dette er en ekte e-post til kunden."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/admin/invoices/credit-notes",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"send",invoiceId,documentId:note.id,confirmed:true})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Kreditnotaen kunne ikke sendes.");
   setNotice(d.alreadySent?"Kreditnotaen var allerede sendt.":"Kreditnota "+note.credit_number+" er sendt til "+d.sentTo+".");
   await refresh();
  }catch(e){setError(e.message||"E-postsendingen kunne ikke bekreftes. Kontroller loggen før du sender på nytt.");}
  finally{setBusy(false)}
 }
 async function issue(){
  if(busy||disabled||!canIssue||!valid)return;
  const summary="Utstede en EKTE, nummerert kreditnota for faktura "+invoice.invoice_number+
   "\nKreditert inkl. MVA: "+money(total)+"\nÅrsak: "+reason.trim()+
   "\n\nDette reduserer fakturakravet permanent, men sender ikke e-post og refunderer ikke penger. Fortsette?";
  if(!window.confirm(summary))return;
  if(window.prompt("Skriv KREDITNOTA for å bekrefte utstedelsen:")!=="KREDITNOTA")return;
  setBusy(true);setError("");setNotice("");
  try{
   requestId.current||=crypto.randomUUID();
   const r=await fetch("/api/admin/invoices/credit-notes",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({invoiceId,requestId:requestId.current,reason:reason.trim(),
     lines:lines.map(({sourceIndex,quantity})=>({sourceIndex,quantity})),
     expectedCreditedOre:Number(invoice.credited_ore)||0,confirmed:true})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Kreditnotaen kunne ikke utstedes.");
   requestId.current=null;setQty({});setReason("");setOpen(false);
   setNotice(d.warning?"Kreditnota "+d.creditNoteNumber+" er utstedt. "+d.warning:
    "Kreditnota "+d.creditNoteNumber+" er utstedt og har egen PDF. Ingen penger er refundert.");
   await refresh();await onRefresh?.();
  }catch(e){setError(e.message||"Kreditnotaen kunne ikke behandles. Kontroller historikken før du forsøker på nytt.");}
  finally{setBusy(false);}
 }
 return <section style={{borderBottom:"1px solid #d8c9ae",padding:"16px 0",marginBottom:18}}>
  <h2>Kreditnota</h2>
  <p>Originalfakturaen beholdes. En kreditnota får eget nummer, minusbeløp og MVA, og reduserer betalingskravet. Tilbakebetaling via Vipps gjøres separat.</p>
  {!loaded&&<p>Henter kreditnotahistorikken …</p>}
  {loaded&&notes.length>0&&<><h3>Tidligere kreditnotaer</h3>
   {notes.map(n=><div key={n.id} style={{padding:"10px 0",borderBottom:"1px solid #ddd"}}>
    <strong>{n.credit_number}</strong> · {n.credit_date} · Kreditert {money(n.total_ore)}
    <div style={{fontSize:13}}>{n.reason}</div>
    <a target="_blank" rel="noreferrer" href={"/api/admin/invoices/credit-notes?invoiceId="+encodeURIComponent(invoiceId)+"&documentId="+encodeURIComponent(n.id)}>Åpne kreditnota som PDF</a>
    <div style={{marginTop:8}}>{n.sent_at?<span>Sendt til kunden</span>:canIssue?<button type="button" disabled={busy||disabled} onClick={()=>sendCredit(n)}>Send kreditnota på e-post</button>:<span>Ikke sendt til kunden</span>}
     {n.delivery_error&&<p role="alert" style={{fontSize:12}}>Siste sendeforsøk: {n.delivery_error}</p>}
    </div>
   </div>)}
  </>}
  {loaded&&canIssue&&netOutstanding>0&&<button type="button" disabled={busy||disabled} onClick={()=>setOpen(v=>!v)}>{open?"Lukk":"Opprett kreditnota"}</button>}
  {loaded&&canIssue&&netOutstanding===0&&<p>Det finnes ikke et utestående beløp å kreditere. Er fakturaen betalt, må tilbakebetaling avklares før kreditnota kan utstedes i denne løsningen.</p>}
  {open&&<div style={{border:"1px solid #d8c9ae",borderRadius:10,padding:16,marginTop:12}}>
   <h3>Velg fakturalinjer og antall</h3>
   <p>Fyll inn antallet som skal krediteres. Original pris og MVA-sats hentes fra den utstedte fakturaen.</p>
   {(invoice.line_items||[]).map((line,index)=><label key={index} style={{display:"block",marginBottom:12}}>
    <strong>{line.description}</strong> · {money(Number(line.unitPriceOre))} eks. MVA · {line.vatRate}% MVA
    <span style={{display:"block",fontSize:12}}>Tilgjengelig antall: {remaining[index]} {line.unit||"stk"}</span>
    <input type="number" min="0" max={remaining[index]} step="0.001" value={qty[index]??""}
     disabled={busy||disabled||remaining[index]<=0} placeholder="Antall som krediteres"
     onChange={e=>{setQty(x=>({...x,[index]:e.target.value}));requestId.current=null}}/>
   </label>)}
   <label>Årsak til kreditnotaen (vises på PDF)
    <textarea value={reason} maxLength={500} rows={3} style={{display:"block",width:"100%",boxSizing:"border-box"}}
     onChange={e=>{setReason(e.target.value);requestId.current=null}} placeholder="For eksempel prisavslag, feil vare eller feil antall"/>
   </label>
   <p>Eks. MVA: <strong>{money(lines.reduce((sum,l)=>sum+l.net,0))}</strong><br/>
    MVA: <strong>{money(lines.reduce((sum,l)=>sum+l.vat,0))}</strong><br/>
    Kreditnota inkl. MVA: <strong>{money(total)}</strong><br/>
    Gjenstående krav etter kreditnota: <strong>{money(Math.max(0,netOutstanding-total))}</strong></p>
   {total>netOutstanding&&<p role="alert">Beløpet overstiger ubetalt del av fakturaen. Refunder allerede betalte beløp først, eller reduser antallet.</p>}
   <button type="button" disabled={busy||disabled||!canIssue||!valid} onClick={issue}>{busy?"Utsteder …":"Utsted kreditnota"}</button>
  </div>}
  {error&&<p role="alert" style={{color:"crimson"}}>{error} <button type="button" onClick={()=>refresh().catch(e=>setError(e.message))}>Oppdater historikk</button></p>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
