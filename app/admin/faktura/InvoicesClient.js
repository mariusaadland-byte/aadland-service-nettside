"use client";
import {useEffect,useState,useRef} from "react";
import {osloDateKey} from "../../../lib/osloTime";
import {invoiceDueDate} from "../../../lib/invoicePaymentTerms";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
import {invoiceArchiveOverview,invoiceArchiveVisible,invoiceArchiveDueInfo} from "../../../lib/invoiceArchiveOverview";
import {scheduledInvoiceStatus,scheduledInvoiceDraftOverview,prioritizeInvoiceDrafts} from "../../../lib/invoiceScheduledDraftOverview";
import {invoiceSettlementInfo} from "../../../lib/invoiceSettlementInfo";
import {invoiceFollowUpState} from "../../../lib/invoiceFollowUpState";
import {parseInvoicePaymentAmountOre,invoicePaymentSuggestionOre,invoicePaymentAmountInput} from "../../../lib/invoicePartialPayments";
import Link from "next/link";
import InvoiceReminderPanel from "./InvoiceReminderPanel";
import InvoiceVippsPanel from "./InvoiceVippsPanel";
import InvoiceCreditNotePanel from "./InvoiceCreditNotePanel";
import InvoiceSettlementPanel from "./InvoiceSettlementPanel";
import InvoiceFollowUpDashboard from "./InvoiceFollowUpDashboard";
import InvoiceFollowUpPanel from "./InvoiceFollowUpPanel";
import InvoiceClosurePanel from "./InvoiceClosurePanel";
import InvoiceActivityTimeline from "./InvoiceActivityTimeline";
import InvoicePaymentStatementPanel from "./InvoicePaymentStatementPanel";
import InvoiceCustomerPicker from "./InvoiceCustomerPicker";
import InvoiceSplitPanel from "./InvoiceSplitPanel";
import InvoiceSecondPartReschedule from "./InvoiceSecondPartReschedule";
import {invoiceWithSelectedCustomer} from "../../../lib/invoiceCustomerSelection";
import {invoiceSavedDraft} from "../../../lib/invoiceCanonicalSave";
import {hasAdjustableVippsPriceLine,linesForCustomerTotal} from "../../../lib/vippsPriceLines";
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
   <div><div style={{fontSize:11,fontWeight:800,color:"#8a6b35"}}>FAKTURAMOTTAKER</div><strong>{invoice.customer?.name||"Kundenavn"}</strong>{invoice.customer?.organizationNumber&&<div>Org.nr. {invoice.customer.organizationNumber}</div>}{invoice.customer?.customerType==="business"&&invoice.customer?.contactPerson&&<div>Kontaktperson: {invoice.customer.contactPerson}</div>}<div style={{whiteSpace:"pre-line"}}>{invoice.customer?.address||"Kundeadresse"}</div>{invoice.customer?.phone&&<div>Telefon: {invoice.customer.phone}</div>}{invoice.customer?.email&&<div style={{overflowWrap:"anywhere"}}>{invoice.customer.email}</div>}</div>
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
export default function InvoicesClient({archiveMode=false,isOwner=false}){
 const [items,setItems]=useState([]),[quotes,setQuotes]=useState([]),[active,setActive]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState("");
 const [filter,setFilter]=useState("unpaid"),[search,setSearch]=useState(""),[sortMode,setSortMode]=useState("priority"),[loadingInvoices,setLoadingInvoices]=useState(true),[payments,setPayments]=useState([]),[canSendManualReceipts,setCanSendManualReceipts]=useState(false);
 const [paymentAmount,setPaymentAmount]=useState(""),[paymentDate,setPaymentDate]=useState(()=>osloDateKey(new Date())),[paymentNote,setPaymentNote]=useState("");
 const paymentRequest=useRef(null);
 const today=osloDateKey(new Date());
 const summary=invoiceArchiveOverview(items,today);
 const rawVisibleItems=invoiceArchiveVisible(items,today,{archiveMode,filter,query:search,sort:sortMode});
 const visibleItems=archiveMode?rawVisibleItems:prioritizeInvoiceDrafts(rawVisibleItems,today,items);
 const scheduledSummary=scheduledInvoiceDraftOverview(items,today);

 async function load(){setLoadingInvoices(true);try{const [a,b]=await Promise.all([fetch("/api/admin/invoices",{cache:"no-store"}),fetch("/api/admin/quotes",{cache:"no-store"})]);const x=await a.json(),y=await b.json();if(!a.ok)throw Error(x.error);setItems(x.invoices||[]);setQuotes((y.quotes||[]).filter(q=>q.status==="accepted"));}catch(e){setError(e.message||"Kunne ikke laste fakturaer.");}finally{setLoadingInvoices(false);}}
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get("id");if(id)setActive(id);load()},[]);
 async function create(quoteId){setBusy(true);setError("");try{const res=await fetch("/api/admin/invoices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(quoteId?{quoteId}:{})});const data=await res.json();if(!res.ok)throw Error(data.error);await load();setActive(data.id);window.history.replaceState(null,"","/admin/faktura?id="+encodeURIComponent(data.id));setSaved(data.count>1?data.count+" fakturakladder er klare.":"");}catch(e){setError(e.message)}finally{setBusy(false)}}
 const draft=items.find(x=>x.id===active);
 const [form,setForm]=useState(null);
 const [scheduledCheck,setScheduledCheck]=useState(null),[checkingScheduled,setCheckingScheduled]=useState(false);
 useEffect(()=>{setScheduledCheck(null)},[form?.id,form?.planned_send_on,form?.automatic_send,form?.auto_send_state,form?.updated_at]);
 const paymentInfo=form?invoicePaymentState(form,today):null;
 const paymentSafety=form?invoiceSettlementInfo(form,today):null;
 const manualPaymentBlocked=["activeVipps","mismatch"].includes(paymentSafety?.kind);
 const paymentDraft=(()=>{
  if(!paymentInfo||!paymentAmount.trim()||paymentInfo.outstanding<=0)return null;
  try{
   const amountOre=parseInvoicePaymentAmountOre(paymentAmount,paymentInfo.outstanding);
   return {amountOre,outstandingAfterOre:paymentInfo.outstanding-amountOre,error:null};
  }catch(e){return {amountOre:null,outstandingAfterOre:null,error:e.message||"Ugyldig innbetalt beløp."}}
 })();
 const [previewOpen,setPreviewOpen]=useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("preview")==="1");
 useEffect(()=>{
  if(!form?.id||!previewOpen||new URLSearchParams(window.location.search).get("preview")!=="1")return;
  const handle=window.setTimeout(()=>document.getElementById("invoice-draft-preview")?.scrollIntoView({behavior:"smooth",block:"start"}),150);
  return()=>window.clearTimeout(handle);
 },[form?.id,previewOpen]);
 const [printHref,setPrintHref]=useState("");
 useEffect(()=>{
  if(draft&&((archiveMode&&draft.status==="draft")||(!archiveMode&&draft.status!=="draft")))window.location.replace((draft.status==="draft"?"/admin/faktura":"/admin/faktura/arkiv")+"?id="+encodeURIComponent(draft.id));
 },[archiveMode,draft?.id,draft?.status]);
 useEffect(()=>{
  paymentRequest.current=null;setPaymentAmount("");setPaymentDate(today);setPaymentNote("");
 },[form?.id,form?.paid_ore,form?.credited_ore]);
 useEffect(()=>{
  if(!archiveMode||!form?.id)return;
  let ignore=false;setPayments([]);setCanSendManualReceipts(false);
  fetch("/api/admin/invoices/payments?invoiceId="+encodeURIComponent(form.id)).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(!ignore){setPayments(data.payments||[]);setCanSendManualReceipts(data.canSendManualReceipts===true)}}).catch(e=>{if(!ignore)setError(e.message)});
  return ()=>{ignore=true};
 },[archiveMode,form?.id,form?.payment_updated_at]);
 async function registerPayment(full=false){
  if(!form||busy||!paymentInfo?.outstanding||manualPaymentBlocked)return;
  let amountOre;
  try{
   amountOre=full?paymentInfo.outstanding:parseInvoicePaymentAmountOre(paymentAmount,paymentInfo.outstanding);
   if(paymentDate<form.issued_date||paymentDate>today)throw Error("Velg en betalingsdato mellom fakturadato og i dag.");
  }catch(e){setError(e.message||"Kontroller beløp og dato.");return;}
  const confirmation="Er "+money(amountOre)+" faktisk mottatt fra kunden på bankkonto eller kontant?"+
   "\nFaktura: "+form.invoice_number+
   "\nBetalingsdato: "+paymentDate+
   "\n"+(paymentInfo.outstanding===amountOre?"Fakturaen blir fullt oppgjort.":"Etter registrering gjenstår "+money(paymentInfo.outstanding-amountOre))+
   "\n\nIkke registrer Vipps-betalinger manuelt. De registreres automatisk når Vipps bekrefter betalingen.";
  if(!window.confirm(confirmation))return;
  setBusy(true);setError("");setSaved("");
  try{
   const body={invoiceId:form.id,amountOre,paidOn:paymentDate,note:paymentNote};
   const signature=JSON.stringify(body);
   if(paymentRequest.current?.signature!==signature)paymentRequest.current={signature,id:crypto.randomUUID()};
   const response=await fetch("/api/admin/invoices/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,requestId:paymentRequest.current.id})});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Innbetalingen kunne ikke registreres.");
   await load();paymentRequest.current=null;setPaymentAmount("");
   setSaved(data.alreadyRecorded?"Denne innbetalingen er allerede registrert. Ingen ny registrering ble opprettet.":
    data.outstandingOre===0?"Hele fakturabeløpet er registrert som betalt.":
    "Delbetaling på "+money(amountOre)+" er registrert. Gjenstående beløp: "+money(data.outstandingOre)+".");
  }catch(e){await load();setError(e.message||"Betalingen kunne ikke bekreftes.")}finally{setBusy(false)}
 }
 async function sendManualReceipt(payment){
  if(busy||!form||!canSendManualReceipts||payment.reversed_at||payment.vipps_reference||payment.receipt_sent_at)return;
  const email=String(form.customer?.email||"").trim();
  if(!email){setError("Kunden mangler e-postadresse. Oppdater kundekortet før du sender.");return;}
  if(!window.confirm("Sende ekte betalingskvittering for "+money(payment.amount_ore)+
   " til "+email+"?\nFaktura: "+form.invoice_number+
   "\nDette sender e-post med kvitterings-PDF. Ingen ny faktura opprettes."))return;
  setBusy(true);setError("");setSaved("");
  try{
   const response=await fetch("/api/admin/invoices/manual-receipts",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"send",invoiceId:form.id,paymentId:payment.id,confirmed:true})
   });
   const data=await response.json();if(!response.ok)throw Error(data.error||"Kvitteringen kunne ikke sendes.");
   setSaved(data.alreadySent?"Kvitteringen var allerede sendt til kunden.":
    "Kvittering for "+money(payment.amount_ore)+" er sendt til "+data.email+".");
   const r=await fetch("/api/admin/invoices/payments?invoiceId="+encodeURIComponent(form.id),{cache:"no-store"});
   const p=await r.json();if(r.ok)setPayments(p.payments||[]);
  }catch(e){setError((e.message||"Kvitteringen kunne ikke bekreftes.")+
   " Kontroller sendestatus før du forsøker igjen.")}
  finally{setBusy(false);}
 }
 async function reversePayment(paymentId){
  if(busy)return;
  const payment=payments.find(p=>p.id===paymentId);
  if(!payment||!window.confirm(payment.receipt_sent_at?
   "Kvittering for denne innbetalingen er sendt til kunden. Hvis du angrer betalingen, må du også informere kunden om at kvitteringen ikke lenger er gyldig. Fortsette?":
   "Angre denne manuelle betalingsregistreringen? Den blir bevart i historikken, men teller ikke lenger som innbetalt."))return;
  setBusy(true);setError("");setSaved("");
  try{const r=await fetch("/api/admin/invoices/payments",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({paymentId})});const data=await r.json();if(!r.ok)throw Error(data.error);await load();setSaved("Betalingsregistreringen er angret.");}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }

 async function downloadPdf(){setBusy(true);setError("");setSaved("");try{const id=form?form.id:"example";if(form?.status==="draft"&&!form.split_group_id){await persist(form);setSaved("Kladden er lagret.");}const response=await fetch("/api/admin/invoices/pdf?id="+encodeURIComponent(id));if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||"Kunne ikke lage PDF.");}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Aadland-Service-"+(id==="example"?"TESTFAKTURA":id)+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{setForm(draft?{...draft,customer:{...draft.customer},line_items:draft.line_items.map(x=>({...x}))}:null)},[active,items]);
 const change=(key,value)=>{setSaved("");setForm(x=>({...x,[key]:value,...(key==="due_date_mode"&&value==="auto"?{due_date:invoiceDueDate(today,x.customer?.paymentTermsDays??14)}:{})}));};
 const changeLine=(i,key,value)=>{setSaved("");setForm(x=>({...x,line_items:x.line_items.map((l,j)=>j===i?{...l,[key]:value}:l)}));};
 async function persist(snapshot){
  if(!snapshot?.id||!snapshot.updated_at)throw Error("Fakturakladden må lastes inn på nytt før lagring.");
  const res=await fetch("/api/admin/invoices",{
   method:"PATCH",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:snapshot.id,expectedUpdatedAt:snapshot.updated_at,title:snapshot.title,
    customer:snapshot.customer,pricingModel:snapshot.pricing_model,lineItems:snapshot.line_items,
    notes:snapshot.notes,dueDate:snapshot.due_date,dueDateMode:snapshot.due_date_mode||"auto"})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||"Fakturakladden kunne ikke lagres.");
  const savedInvoice=invoiceSavedDraft(snapshot,data);
  // A linked customer card may have changed while this draft was open.
  // Never overwrite the canonical, just-saved customer with stale UI values.
  setItems(current=>current.map(item=>item.id===snapshot.id?{...item,...savedInvoice.invoice}:item));
  if(savedInvoice.changed.length){
   throw Error("Kundeopplysninger er endret på kundekortet siden kladden ble åpnet ("+
    savedInvoice.changed.map(item=>item.label).join(", ")+
    "). Kladden er lagret med oppdaterte opplysninger. Kontroller mottaker og betalingsfrist før du fakturerer igjen. Ingen faktura er utstedt eller sendt.");
  }
  return savedInvoice;
 }
 function applyVippsPrice(quotedGrossOre){
  if(!form||form.status!=="draft")return;
  const result=linesForCustomerTotal(form.line_items,quotedGrossOre);
  if(!result){setError("Fakturaen mangler en egnet material- eller annen varelinje å justere. Timeprisen skal ikke endres.");return;}
  const line=result.lineItems[result.adjustedLineIndex];
  if(!window.confirm("Sette fakturaens ordinære kundepris til "+money(result.totalOre)+"?\\nBare enhetsprisen på «"+(line.description||"varelinje")+"» kan justeres. Timer og timepriser er uendret. Ikke et eget Vipps-gebyr. Prisen må være avtalt med kunden før fakturaen utstedes."))return;
  setForm(current=>({...current,line_items:result.lineItems,customer:{...current.customer,paymentMethod:"vipps",workDate:today}}));
  setSaved("Vipps-prisen er lagt inn. Kontroller fakturalinjene og lagre kladden.");
  setError("");
 }
 async function previewScheduledInvoice(){
  if(!form||busy||checkingScheduled)return;
  const invoiceId=form.id;
  setCheckingScheduled(true);setScheduledCheck(null);
  try{
   const response=await fetch("/api/admin/invoices/split?id="+encodeURIComponent(invoiceId),{cache:"no-store"});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"Forhåndskontrollen kunne ikke utføres.");
   setScheduledCheck({invoiceId,...result});
  }catch(e){setScheduledCheck({invoiceId,ready:false,reason:e.message||"Forhåndskontrollen mislyktes."});}
  finally{setCheckingScheduled(false)}
 }
 async function save(){setBusy(true);setError("");setSaved("");try{await persist(form);setSaved("Kladden er lagret.");await load();}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function reloadAfterConflict(){
  if(busy||!window.confirm("Hente siste lagrede faktura? Endringer du ikke har lagret i dette vinduet blir erstattet av den nyeste kladden."))return;
  setBusy(true);setError("");setSaved("");
  try{await load();setSaved("Siste lagrede versjon er hentet. Kontroller kunde, forfall, timer og beløp før du fortsetter.");}
  finally{setBusy(false);}
 }
 async function selectCustomer(contact,base=form){
  if(!base||base.status!=="draft")throw Error("Velg en fakturakladd først.");
  if(busy)throw Error("Fakturaen behandles. Prøv igjen.");
  setBusy(true);setError("");setSaved("");
  try{
   const next=invoiceWithSelectedCustomer(base,contact,today);
   const saved=await persist(next);
   setForm(saved.invoice);
   await load();
   setSaved("Kundekortet er valgt og lagret på fakturaen. Betalingsfrist og kontaktopplysninger er oppdatert.");
  }catch(e){setError(e.message||"Kunden kunne ikke velges.");throw e;}
  finally{setBusy(false)}
 }
 async function openNewCustomer(){
  if(!form||busy)return;
  setBusy(true);setError("");
  try{
   await persist(form);
   window.location.assign("/admin/kunder/ny?invoiceId="+encodeURIComponent(form.id));
  }catch(e){setError(e.message||"Lagre fakturakladden før du oppretter kunden.");setBusy(false);}
 }
 async function openCustomerCard(){
  if(!form||busy)return;
  if(!form.customer?.contactId){await openNewCustomer();return;}
  setBusy(true);setError("");
  try{
   if(form.status==="draft")await persist(form);
   window.location.assign("/admin/kunder/"+encodeURIComponent(form.customer.contactId)+"?invoiceId="+encodeURIComponent(form.id));
  }catch(e){setError(e.message||"Kundekortet kunne ikke åpnes.");setBusy(false)}
 }
 useEffect(()=>{
  if(archiveMode||!draft?.id||draft.status!=="draft")return;
  const params=new URLSearchParams(window.location.search);
  const contactId=params.get("customerId");
  if(!contactId||!/^[0-9a-f-]{36}$/i.test(contactId))return;
  let live=true;
  (async()=>{
   try{
    const response=await fetch("/api/admin/customer-contacts",{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Kunne ikke hente kundekortet etter registrering.");
    const selected=(data.contacts||[]).find(item=>item.id===contactId);
    if(!selected)throw Error("Kunden finnes ikke i kunderegisteret. Søk opp kunden nedenfor.");
    if(!live)return;
    await selectCustomer(selected,draft);
    if(live)window.history.replaceState(null,"","/admin/faktura?id="+encodeURIComponent(draft.id));
   }catch(e){if(live)setError(e.message||"Kunden kunne ikke kobles til fakturaen.");}
  })();
  return()=>{live=false;};
 },[archiveMode,draft?.id]);
 async function printInvoice(){
  if(!form||busy)return;
  if(form.status==="draft"&&!window.confirm("Utstede faktura på "+money(total(form.line_items))+" inkl. MVA? Fakturaen får nummer og låses for videre endringer. Den sendes ikke på e-post automatisk."))return;
  let printWindow=null;setBusy(true);setError("");setSaved("");
  try{
   if(form.status==="draft"){
    if(!form.customer?.name?.trim()||!form.customer?.address?.trim())throw Error("Fyll inn kundenavn og adresse før fakturering.");
    if(!form.customer?.workDate)throw Error("Velg leveringsdato før fakturering.");
    if(form.due_date_mode==="manual"&&!form.due_date)throw Error("Velg forfallsdato før fakturering.");
   }
   printWindow=window.open("","_blank");
   if(printWindow)printWindow.document.body.textContent="Klargjør faktura for utskrift …";
   if(form.status==="draft"&&!form.split_group_id)await persist(form);
   const response=await fetch("/api/admin/invoices/issue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:form.id})});
   const data=await response.json();await load();
   if(!response.ok)throw Error(data.error||"Fakturaen kunne ikke klargjøres.");
   setPrintHref(data.printUrl);
   if(printWindow)printWindow.location.replace(data.printUrl);
   setSaved("Faktura "+data.invoiceNumber+" er klar for utskrift.");
  }catch(e){if(printWindow)printWindow.close();setError(e.message)}finally{setBusy(false)}
 }
 async function sendInvoice(){
  if(!form||busy)return;
  const recipient=String(form.customer?.email||"").trim();
  if(!recipient){setError("Fyll inn kundens e-postadresse på kundekortet før sending.");return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){setError("Fyll inn en gyldig e-postadresse.");return;}
  if(form.status==="draft"){
   if(!form.customer?.name?.trim()||!form.customer?.address?.trim()){setError("Fyll inn kundenavn og fakturaadresse før du sender.");return;}
   if(!form.customer?.workDate){setError("Velg leveringsdato før fakturering. Du finner feltet ved fakturaforhåndsvisningen.");return;}
   if(form.due_date_mode==="manual"&&!form.due_date){setError("Velg forfallsdato før du sender.");return;}
  }
  if(!window.confirm("Sende faktura"+(form.invoice_number?" "+form.invoice_number:"")+" til "+recipient+"?\\n\\nBeløp inkl. MVA: "+money(total(form.line_items))+". Ved bekreftelse blir fakturaen utstedt hvis den er kladd, og deretter sendt til kunden."))return;
  setBusy(true);setError("");setSaved("");
  try{
   if(form.status==="draft"){
    if(!form.customer?.name?.trim()||!form.customer?.address?.trim())throw Error("Fyll inn kundenavn og adresse før sending.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer?.email||""))throw Error("Fyll inn en gyldig e-postadresse.");
    if(!form.customer?.workDate)throw Error("Velg leveringsdato før sending.");
    if(form.due_date_mode==="manual"&&!form.due_date)throw Error("Velg forfallsdato før sending.");
    if(!form.split_group_id)await persist(form);
   }
   const response=await fetch("/api/admin/invoices/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:form.id})});
   const data=await response.json();
   await load();
   if(!response.ok)throw Error(data.error||"Fakturaen kunne ikke sendes.");
   setSaved("Faktura "+data.invoiceNumber+" er "+(data.alreadySent?"allerede sendt":"sendt")+" til "+data.sentTo+".");
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function exportCsv(){if(!form)return;const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';const rows=[["Beskrivelse","Antall","Enhet","Enhetspris eks MVA (kr)","MVA %"],...form.line_items.map(l=>[l.description,l.quantity,l.unit,(Number(l.unitPriceOre)/100).toFixed(2),l.vatRate])];const csv="\uFEFF"+rows.map(row=>row.map(esc).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="fakturakladd-"+form.id+".csv";a.click();URL.revokeObjectURL(url);}
 return <main className="admin" style={{maxWidth:1100,margin:"auto",padding:24}}><Link href="/admin">← Admin</Link><h1>{archiveMode?"Fakturaarkiv":"Fakturakladder"}</h1><nav aria-label="Fakturaoversikt" style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:18}}><Link href="/admin/faktura" aria-current={!archiveMode?"page":undefined}>Kladder</Link><Link href="/admin/faktura/arkiv" aria-current={archiveMode?"page":undefined}>Fakturaarkiv – betalinger</Link>{!archiveMode&&isOwner&&<Link href="/admin/faktura/test">Prøvekjør fakturadeling</Link>}{archiveMode&&<Link href="/admin/faktura/rapport">Rapport og CSV – avsluttede fakturaer</Link>}{archiveMode&&<Link href="/admin/faktura/mva">MVA-avstemming per termin</Link>}</nav><p>{archiveMode?"Her finner du alle utstedte fakturaer. Registrer innbetalinger og se hva som gjenstår. Oversikten bygger på betalingene du registrerer her.":"Opprett og kontroller fakturakladder. Utstedte fakturaer flyttes automatisk til fakturaarkivet."}</p>
 {error&&<p role="alert" style={{color:"crimson"}}>{error} {error.includes("en annen fane")&&<button type="button" disabled={busy} onClick={reloadAfterConflict}>Hent siste fakturakladd</button>}</p>}{printHref&&<p><a href={printHref} target="_blank" rel="noreferrer">Åpne faktura for utskrift →</a></p>}
 {!archiveMode&&items.some(x=>x.auto_send_state==="needs_review"||x.auto_send_state==="processing")&&
 <p role="alert" style={{padding:12,border:"1px solid #cc9980",borderRadius:8}}>
  <strong>Planlagte fakturaer trenger oppfølging:</strong> {items.filter(x=>x.auto_send_state==="needs_review").length} stoppet for kontroll,
  {items.filter(x=>x.auto_send_state==="processing").length} under behandling.
  Åpne den aktuelle fakturakladden nedenfor før du prøver ny sending.
 </p>}
 {!archiveMode&&scheduledSummary.scheduled>0&&<section role={scheduledSummary.overdue||scheduledSummary.invalidDate?"alert":"status"} style={{padding:12,border:"1px solid #d8c9ae",borderRadius:8,marginBottom:12}}>
  <strong>{scheduledSummary.scheduled} {scheduledSummary.scheduled===1?"faktura 2 har":"fakturaer (del 2) har"} aktiv sendingsplan.</strong>
  {scheduledSummary.nextDate&&<span> Neste planlagte dato: <b>{scheduledSummary.nextDate}</b>.</span>}
  {scheduledSummary.overdue>0&&<p style={{color:"#933f2c",fontWeight:700}}>OBS: {scheduledSummary.overdue} {scheduledSummary.overdue===1?"faktura har":"fakturaer har"} passert sendingsdato uten bekreftet automatisk sending. Kontroller cron- og e-postloggen før manuell handling.</p>}
  {scheduledSummary.invalidDate>0&&<p style={{color:"#933f2c"}}>{scheduledSummary.invalidDate} sendingsplaner mangler gyldig dato.</p>}
  {scheduledSummary.firstMissing>0&&<p>{scheduledSummary.firstMissing} {scheduledSummary.firstMissing===1?"faktura venter":"fakturaer venter"} på at del 1 registreres sendt på e-post.</p>}
  <p style={{fontSize:12,marginBottom:0}}>Automatisk sending kjøres daglig kl. 10:20 UTC (normalt ca. 11:20 norsk vintertid / 12:20 sommertid). En sendingsdato er ikke et løfte om klokkeslett.</p>
 </section>}
 {!archiveMode&&<section className="card" style={{padding:18,marginBottom:20}}><h2>Opprett fakturakladd</h2><p>Godkjente tilbud får egne kladder for forskudd, delbetaling og sluttoppgjør etter tilbudets betalingsplan. Faktura- og forfallsdato beregnes automatisk når du fakturerer, etter betalingsfristen på kundekortet.</p><button disabled={busy} onClick={()=>create(null)}>Ny tom kladd</button> <select id="invoiceQuote" defaultValue=""><option value="">Velg godkjent tilbud</option>{quotes.map(q=><option key={q.id} value={q.id}>{q.quoteNumber} – {q.title}</option>)}</select> <button disabled={busy} onClick={()=>{const id=document.getElementById("invoiceQuote").value;if(id)create(id);else setError("Velg et godkjent tilbud.");}}>Hent betalingsplan fra tilbud</button></section>}
 {archiveMode&&<InvoiceFollowUpDashboard invoices={items} today={today} activeFilter={filter} onFilterChange={setFilter} loading={loadingInvoices}/>}
 {archiveMode&&<section className="card" style={{padding:18,marginBottom:20}}>
  <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:14}}>
   <div><h2 style={{margin:"0 0 5px"}}>Betalingsoversikt</h2><p className="muted" style={{margin:0}}>Basert på registrerte innbetalinger. Sjekk bank/Vipps før purring.</p></div>
   <button type="button" disabled={busy||loadingInvoices} onClick={()=>load()}>{loadingInvoices?"Oppdaterer …":"Oppdater oversikten"}</button>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12}}>
   {[
    {name:"Utestående totalt",value:money(summary.outstanding),count:summary.unpaidCount,mode:"unpaid"},
    {name:"Forfalt",value:money(summary.overdue),count:summary.overdueCount,mode:"overdue"},
    {name:"Minst 14 dager forfalt",value:money(summary.overdue14),count:summary.overdue14Count,mode:"overdue14"},
    {name:"Forfaller innen 7 dager",value:money(summary.dueSoon),count:summary.dueSoonCount,mode:"dueSoon"},
    {name:"Registrert innbetalt",value:money(summary.paid),count:summary.paidCount,mode:"paid"}
   ].map(item=><button key={item.name} type="button" onClick={()=>setFilter(item.mode)} aria-pressed={filter===item.mode} style={{padding:14,borderRadius:10,textAlign:"left",background:filter===item.mode?"#f1e7d6":"#fff",border:filter===item.mode?"2px solid #b58b47":"1px solid #dfd6c7",color:"#211b14",whiteSpace:"normal"}}>
    <span style={{fontSize:12,display:"block",marginBottom:8}}>{item.name}</span>
    <strong style={{fontSize:18,display:"block"}}>{item.value}</strong>
    <small style={{display:"block",marginTop:6}}>{item.count} {item.count===1?"faktura":"fakturaer"} · Vis</small>
   </button>)}
  </div>
  <p className="muted" style={{fontSize:12,margin:"12px 0 0"}}>Delbetalinger regnes bare med restbeløpet. «14 dager forfalt» betyr minst 14 hele kalenderdager etter forfallsdatoen. Ingen purringer sendes fra denne oversikten.</p>
 </section>}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,330px),1fr))",gap:20,alignItems:"start"}}>
 <section className="card" style={{padding:16}}><h2>{archiveMode?"Utstedte fakturaer":"Kladder"}</h2><label>Søk etter kunde eller fakturanummer <input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>{archiveMode&&<><label>Vis <select value={filter} onChange={e=>setFilter(e.target.value)}>
 <option value="unpaid">Ubetalte ({summary.unpaidCount})</option>
 <option value="overdue">Forfalte ({summary.overdueCount})</option>
 <option value="overdue14">Minst 14 dager forfalt ({summary.overdue14Count})</option>
 <option value="dueSoon">Forfaller innen 7 dager ({summary.dueSoonCount})</option>
 <option value="partial">Delbetalte ({summary.partialCount})</option>
 <option value="paid">Betalte ({summary.paidCount})</option>
 <option value="credited">Fullt krediterte ({summary.creditedCount})</option>
 <option value="review">Må kontrolleres ({summary.needsReviewCount})</option>
 <option value="refunded">Med Vipps-refusjon ({summary.refundCount})</option>
 <option value="attention">Må følges opp</option>
 <option value="ready">Klar for avslutning</option>
 <option value="closed">Administrativt avsluttede</option>
 <option value="awaiting">Venter på betaling</option>
 <option value="all">Alle fakturaer ({summary.issuedCount})</option>
 </select></label>
 <label>Sorter <select value={sortMode} onChange={e=>setSortMode(e.target.value)}>
  <option value="priority">Viktigst å følge opp først</option>
  <option value="due">Forfallsdato – eldste først</option>
  <option value="amount">Høyest restbeløp først</option>
  <option value="newest">Nyeste faktura først</option>
 </select></label></>}{!loadingInvoices&&<p className="muted" style={{fontSize:13}}>{visibleItems.length} {visibleItems.length===1?"faktura":"fakturaer"} i utvalget</p>}{loadingInvoices&&<p role="status">Oppdaterer fakturaene …</p>}{!loadingInvoices&&visibleItems.length===0&&<p>Ingen {archiveMode?"fakturaer":"kladder"} i dette utvalget.</p>}{visibleItems.map(x=>{const p=invoicePaymentState(x,today),status=invoiceSettlementInfo(x,today),follow=invoiceFollowUpState(x,today),scheduledState=scheduledInvoiceStatus(x,today,items.find(y=>y.id===x.split_group_id));return <button key={x.id} disabled={busy} aria-pressed={active===x.id} onClick={()=>{setActive(x.id);window.history.replaceState(null,"",(archiveMode?"/admin/faktura/arkiv":"/admin/faktura")+"?id="+encodeURIComponent(x.id));setSaved("");}} style={{display:"block",marginBottom:10,width:"100%",textAlign:"left",padding:12,whiteSpace:"normal",border:active===x.id?"2px solid #b58b47":undefined}}><b>{x.invoice_number||x.title||"Faktura"}</b><br/>{x.customer?.name} · {money(p.total)}<br/><small>{x.installment_index>0?"Del "+x.installment_index+" · "+x.installment_percent+" %":"Samlet faktura"} · {x.split_group_id?"Sendingsdato: "+x.planned_send_on+" · ":""}Forfall: {x.due_date||"Ikke valgt"}</small>{!archiveMode&&x.split_group_id&&<><br/><small style={{fontWeight:700,color:["needs_review","processing"].includes(x.auto_send_state)?"#933f2c":"#4a432f"}}>{x.split_part===1?"Del 1 – sendes manuelt":({scheduled:"Del 2 – autosending planlagt",processing:"Del 2 – sending pågår",needs_review:"Del 2 – stoppet, må kontrolleres",sent:"Del 2 – sendt",cancelled:"Del 2 – autosending avbrutt",manual:"Del 2 – sendes manuelt"})[x.auto_send_state]||"Del 2 – kontroller status"}</small></>}{!archiveMode&&scheduledState&&["overdue","firstMissing","invalidDate"].includes(scheduledState.kind)&&<><br/><small style={{fontWeight:800,color:scheduledState.kind==="overdue"||scheduledState.kind==="invalidDate"?"#933f2c":"#4a432f"}}>{scheduledState.label}</small></>}{archiveMode&&<><br/><strong>{status.label}</strong><br/><small style={{fontWeight:700,color:follow.requiresAction?"#933f2c":"#4a432f"}}>Oppfølging: {follow.label}</small>{p.credited>0?" · Kreditert "+money(p.credited):""}{status.refunded>0?" · Refundert "+money(status.refunded):""}{p.outstanding>0?" · Gjenstår: "+money(p.outstanding):""}{p.outstanding>0&&<><br/><small style={{fontWeight:700,color:invoiceArchiveDueInfo(x,today).kind==="oldOverdue"?"#a52a21":"inherit"}}>{invoiceArchiveDueInfo(x,today).label}</small></>}<br/><small>{x.sent_at?"Sendt på e-post":"Utstedt for utskrift / ikke sendt på e-post"}</small></>}</button>})}</section>
 <section className="card" style={{padding:18}}>{form?<><section style={{borderBottom:"1px solid #d8c9ae",paddingBottom:16,marginBottom:18}}><h2>{form.invoice_number?"Faktura "+form.invoice_number:"Send faktura"}</h2>
 {!archiveMode&&form.status==="draft"&&!form.split_group_id&&<InvoiceCustomerPicker key={form.id} customer={form.customer||{}} onChoose={selectCustomer} onCreate={openNewCustomer} disabled={busy} busy={busy} invoiceId={form.id}
 sourceQuoteId={form.source_quote_id||""}/>}
 {form.customer?.contactId&&<button type="button" disabled={busy} onClick={openCustomerCard}>Åpne / rediger kundekort</button>}
 <p><strong>{form.customer?.name}</strong> · {money(total(form.line_items))}<br/>Til: {form.customer?.email||"Fyll inn e-postadressen nedenfor"}</p>{form.status==="draft"?<p>Kontroller navn, adresse, leveringsdato og forfall. Ved sending tildeles fakturanummer, og fakturaen låses for endringer.</p>:<p>Utstedt {form.issued_date}. Fakturaen er låst for endringer.</p>}<button type="button" disabled={busy||Boolean(form.sent_at)||(form.automatic_send&&["scheduled","processing","needs_review"].includes(form.auto_send_state))} onClick={sendInvoice} style={{display:"block",width:"100%",minHeight:50,margin:"12px 0",padding:"14px 18px",background:"#d5a75a",color:"#171511",border:"1px solid #b88c43",borderRadius:10,fontSize:16,fontWeight:800,whiteSpace:"normal"}}>{busy?"Behandler …":form.sent_at?"Sendt på e-post":form.status==="draft"?"Fakturer og send på e-post" :form.delivery_error?"Prøv e-postsending igjen":"Send faktura på e-post"}</button><button type="button" disabled={busy||(form?.status==="draft"&&form.automatic_send&&["scheduled","processing","needs_review"].includes(form.auto_send_state))} onClick={printInvoice} style={{display:"block",width:"100%",minHeight:50,margin:"12px 0",padding:"14px 18px",background:"#fff",color:"#171511",border:"2px solid #b88c43",borderRadius:10,fontSize:16,fontWeight:800,whiteSpace:"normal"}}>{busy?"Behandler …":form.status==="draft"?"Fakturer og skriv ut":"Skriv ut faktura"}</button>{form.sent_at&&<p role="status">Sendt til {form.customer?.email}.</p>}{form.delivery_error&&!form.sent_at&&<p role="alert">{form.delivery_error}</p>}{saved&&<p role="status">{saved}</p>}</section>{archiveMode&&form.auto_send_state==="needs_review"&&
 <p role="alert" style={{padding:12,border:"1px solid #cc9980"}}>
  <strong>Planlagt utsendelse krever manuell avstemming.</strong> Fakturaen kan allerede være utstedt.
  Kontroller Resend-loggen, fakturanummer og faktisk sendestatus før du gjør mer.
  {form.auto_send_error&&<span style={{display:"block"}}>{form.auto_send_error}</span>}
 </p>}
 {archiveMode&&<InvoiceFollowUpPanel key={form.id} invoice={form} today={today}/>}{archiveMode&&<InvoiceClosurePanel key={form.id} invoice={form} today={today} disabled={busy} onRefresh={load}/>}{archiveMode&&<InvoiceSettlementPanel key={form.id} invoice={form} today={today}/>}{archiveMode&&<InvoiceActivityTimeline key={form.id} invoice={form}/>}{archiveMode&&<InvoicePaymentStatementPanel key={form.id} invoice={form} today={today}/>}{!form.split_group_id&&<InvoiceVippsPanel key={form.id} invoice={form} persist={persist} onRefresh={load} disabled={busy} onBusyChange={setBusy} onApplyPrice={applyVippsPrice} allowPriceAdjustment={hasAdjustableVippsPriceLine(form.line_items)} onPaymentMethodChange={method=>change("customer",{...form.customer,paymentMethod:method,workDate:method==="vipps"?today:form.customer?.workDate||""})}/>}{archiveMode&&paymentInfo&&<section style={{padding:"16px 0",borderBottom:"1px solid #d8c9ae",marginBottom:18}}><h2 id="invoice-payment-actions">Innbetalinger</h2><p>Forfallsdato: <b>{form.due_date}</b>{form.paid_date&&<><br/>Siste betalingsdato: <b>{form.paid_date}</b></>}</p>{paymentInfo.outstanding>0&&<>
 {manualPaymentBlocked&&<p role="alert" style={{padding:12,background:"#fff4e6",borderRadius:8}}>
  Manuell betalingsregistrering er midlertidig sperret: {paymentSafety?.guidance||"Kontroller Vipps-status og betalingshistorikken før ny innbetaling."}
 </p>}
 <fieldset disabled={busy||manualPaymentBlocked} style={{border:"1px solid #dfd3bd",borderRadius:10,padding:14,minWidth:0}}>
  <legend><strong>Registrer mottatt delbetaling</strong></legend>
  <p style={{fontSize:13,marginTop:4}}>Brukes bare når kunden faktisk har betalt direkte til bankkonto eller kontant. Vipps-innbetalinger registreres automatisk.</p>
  <p><strong>Restbeløp før registrering: {money(paymentInfo.outstanding)}</strong></p>
  <label>Betalingsdato <input type="date" min={form.issued_date} max={today} value={paymentDate} onChange={e=>{setPaymentDate(e.target.value);paymentRequest.current=null}}/></label>
  <div style={{margin:"12px 0"}}>
   <strong style={{display:"block",marginBottom:7,fontSize:13}}>Fyll inn beløp</strong>
   <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    {[25,50,100].map(percent=><button type="button" key={percent} onClick={()=>{
     setPaymentAmount(invoicePaymentAmountInput(invoicePaymentSuggestionOre(paymentInfo.outstanding,percent)));
     paymentRequest.current=null;
    }}>{percent===100?"Hele restbeløpet":percent+" % av restbeløpet"}</button>)}
   </div>
  </div>
  <label>Innbetalt beløp (kr)
   <input type="text" inputMode="decimal" autoComplete="off" placeholder="For eksempel 1250,50" value={paymentAmount}
    onChange={e=>{setPaymentAmount(e.target.value);paymentRequest.current=null}}/>
  </label>
  {paymentDraft?.error&&<p role="alert" style={{color:"#a52a21",fontSize:13}}>{paymentDraft.error}</p>}
  {paymentDraft&&paymentDraft.amountOre!==null&&<p style={{fontSize:13}}>
   {paymentDraft.outstandingAfterOre===0?<strong>Fakturaen blir fullt oppgjort.</strong>:
    <>Etter denne innbetalingen gjenstår <strong>{money(paymentDraft.outstandingAfterOre)}</strong>.</>}
  </p>}
  <label>Betalingsnotat (valgfritt)
   <input maxLength={500} placeholder="For eksempel bankoverføring" value={paymentNote}
    onChange={e=>{setPaymentNote(e.target.value);paymentRequest.current=null}}/>
  </label>
  <button type="button" onClick={()=>registerPayment(false)} disabled={!paymentDraft||paymentDraft.amountOre===null}>Registrer mottatt beløp</button>
 </fieldset>
 </>}<h3>Betalingshistorikk</h3>{payments.length===0&&<p>Ingen innbetalinger registrert.</p>}{payments.map(p=><div key={p.id} style={{padding:"10px 0",borderBottom:"1px solid #ddd",opacity:p.reversed_at?.72:1}}>
 <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",justifyContent:"space-between"}}>
  <b style={{textDecoration:p.reversed_at?"line-through":"none"}}>{money(p.amount_ore)}</b>
  <small>{p.paid_on}</small>
 </div>
 <div style={{fontSize:13}}>
  {p.vipps_reference?"Vipps-betaling":"Manuelt registrert betaling"}
  {p.reversed_at?" · Angret/korrigert – teller ikke med i registrert innbetalt beløp":""}
 </div>
 {!p.vipps_reference&&!p.reversed_at&&<div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
  <a target="_blank" rel="noreferrer" href={"/api/admin/invoices/manual-receipts?invoiceId="+
    encodeURIComponent(form.id)+"&paymentId="+encodeURIComponent(p.id)}>Åpne kvittering (PDF)</a>
  {p.receipt_sent_at?<span style={{fontSize:13}}>Kvittering sendt til kunden</span>:
    canSendManualReceipts&&<button type="button" disabled={busy} onClick={()=>sendManualReceipt(p)}>
     Send kvittering på e-post
    </button>}
  <button type="button" disabled={busy} onClick={()=>reversePayment(p.id)}>Angre denne registreringen</button>
 </div>}
 {p.receipt_delivery_error&&!p.receipt_sent_at&&<p role="alert" style={{fontSize:12}}>
  Siste sendeforsøk: {p.receipt_delivery_error}
 </p>}
 {p.note&&<p style={{fontSize:13,margin:"6px 0 0"}}>{p.note}</p>}
 </div>)}</section>}{archiveMode&&<InvoiceCreditNotePanel key={form.id} invoice={form} disabled={busy} onRefresh={load}/>}{archiveMode&&<InvoiceReminderPanel key={form.id} invoice={form} disabled={busy} onRefresh={load}/>}{!archiveMode&&form.status==="draft"&&!form.split_group_id&&
 <InvoiceSplitPanel key={form.id} invoice={form} today={today} disabled={busy}
  onPrepare={()=>persist(form)}
  onCreated={async split=>{await load();setActive(split.firstId);
   setSaved("Faktura delt i to. Del 1 sendes manuelt. Del 2 er klar til "+split.secondDate+". Se den andre kladden i listen.");}}/>}
 {!archiveMode&&form.split_group_id&&<section className="card"
  style={{padding:12,margin:"12px 0",border:"1px solid #c5a05e"}}>
  <strong>Del {form.split_part} av 2 – egen faktura</strong>
  <p style={{fontSize:13}}>Planlagt utsendelse: <b>{form.planned_send_on}</b>.
   Betalingsfrist: <b>{form.payment_terms_override_days} dager fra faktisk fakturadato</b>.
   {form.automatic_send?" Automatisk: ":" Manuell: "}
   <b>{({scheduled:"Planlagt",processing:"Sender",sent:"Sendt",needs_review:"Krever kontroll",cancelled:"Avbrutt",manual:"Manuell"})[form.auto_send_state]||"Manuell"}</b>.
  </p>
  {form.split_part===2&&<InvoiceSecondPartReschedule key={form.id} invoice={form} today={today}
   disabled={busy} onSaved={async plan=>{
    await load();
    setSaved("Sendingsdato, betalingsfrist og sendingsmetode er oppdatert for del 2. "+
     "Beløpet og del 1 er uendret.");
   }}/>}
  {form.split_part===2&&form.status==="draft"&&form.automatic_send&&form.auto_send_state==="scheduled"&&<>
   <button type="button" disabled={busy||checkingScheduled} onClick={previewScheduledInvoice}>
    {checkingScheduled?"Kontrollerer …":"Forhåndskontroller faktura 2 – ingen utsending"}
   </button>
   {scheduledCheck?.invoiceId===form.id&&<p role={scheduledCheck.ready?"status":"alert"}
    style={{fontSize:13,border:"1px solid #d8c9ae",borderRadius:8,padding:10}}>
    <strong>{scheduledCheck.ready?"Kontrollen er OK med lagrede opplysninger.":"Må rettes eller kontrolleres:"}</strong>
    {!scheduledCheck.ready&&<> {scheduledCheck.reason}</>}
    <span style={{display:"block",marginTop:5}}>{scheduledCheck.note||"Ingen faktura er sendt fra denne kontrollen."}</span>
   </p>}
  </>}
  {form.auto_send_state==="needs_review"&&<div role="alert">
   <p>Automatisk sending er stoppet og krever kontroll. Kontroller del 1, kundekortet og e-postloggen før du fortsetter.
    {form.auto_send_error&&<span style={{display:"block"}}>{form.auto_send_error}</span>}</p>
   {form.status==="draft"&&<button type="button" disabled={busy} onClick={async()=>{
    if(!window.confirm("Jeg har kontrollert at del 2 IKKE allerede er sendt, og at del 1 er sendt.\\n"+
     "Frigi del 2 for MANUELL fakturering? Systemet vil oppdatere mottakeropplysningene fra kundekortet.\\n"+
     "Ingen faktura sendes når du trykker OK. Kontroller mottaker og beløp på nytt før du sender."))return;
    setBusy(true);setError("");setSaved("");
    try{
     const response=await fetch("/api/admin/invoices/split",{method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:form.id,action:"review_manual",confirmed:true})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(data.error||"Fakturaen kunne ikke frigis.");
     await load();setSaved("Autosending er avsluttet. Mottakeren er kontrollert. Del 2 kan nå sendes manuelt.");
    }catch(e){setError(e.message||"Manuell frigivelse ble avvist.");}
    finally{setBusy(false);}
   }}>Frigi for manuell sending etter kontroll</button>}
  </div>}
  {form.automatic_send&&form.auto_send_state==="scheduled"&&
   <button type="button" disabled={busy} onClick={async()=>{
    if(!window.confirm("Avbryte automatisk sending av del 2? Kladden beholdes og kan sendes manuelt."))return;
    setBusy(true);setError("");
    try{
     const response=await fetch("/api/admin/invoices/split",{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:form.id,action:"cancel",confirmed:true})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(data.error||"Kunne ikke avbryte.");
     await load();setSaved("Autosending er avbrutt. Del 2 kan sendes manuelt.");
    }catch(e){setError(e.message||"Kunne ikke avbryte.");}finally{setBusy(false);}
   }}>Avbryt autosending av del 2</button>}
 </section>}
 {!archiveMode&&<fieldset disabled={busy||form.status!=="draft"||Boolean(form.split_group_id)} style={{border:0,padding:0,minWidth:0}}><h2>{form.status==="draft"?"Rediger fakturakladd":"Fakturadetaljer"}</h2><p><strong>{form.customer?.name}</strong> · {money(total(form.line_items))}</p>{form.installment_index>0&&<p><b>{form.installment_label} – {form.installment_percent} %</b><br/>{form.installment_trigger}</p>}<label>Betalingsfrist<select value={form.due_date_mode||"auto"} onChange={e=>change("due_date_mode",e.target.value)}><option value="auto">Automatisk fra kundekortet</option><option value="manual">Egen forfallsdato for denne fakturaen</option></select></label>{form.due_date_mode!=="manual"?<p>Betalingsfrist: <b>{form.customer?.paymentTermsDays??14} dager</b>. Hvis du fakturerer i dag: fakturadato <b>{today}</b>, forfall <b>{form.due_date}</b>. Datoene beregnes på nytt når du trykker fakturer. Endre antall dager på kundekortet.</p>:<label htmlFor="invoiceDueDate"><b>Forfallsdato</b><input id="invoiceDueDate" type="date" value={form.due_date||""} onChange={e=>change("due_date",e.target.value)}/></label>}<button type="button" disabled={busy} onClick={save}>{busy?"Lagrer …":"Lagre forfallsdato og kladd"}</button>{form.status==="draft"&&<p>Fakturanummer tildeles når du fakturerer med e-post eller utskrift.</p>}
 <label>Oppdrag <input value={form.title||""} onChange={e=>change("title",e.target.value)}/></label>
 <p className="muted">Kundenavn, telefon, e-post og fakturaadresse styres fra kunderegisteret ovenfor. Rediger kundekortet hvis noe skal endres.</p>
 {form.customer?.paymentMethod==="vipps"
  ?<p role="status"><strong>Leveringsdato: {today}</strong> – settes automatisk når du velger Vipps. Du trenger ikke velge dato.</p>
  :<label>Leveringsdato / avtalt leveringsdato <input type="date" value={form.customer?.workDate||""} onChange={e=>change("customer",{...form.customer,workDate:e.target.value})}/></label>}
 <label>Arbeidssted (hvis forskjellig fra kundens adresse) <input value={form.customer?.workAddress||""} onChange={e=>change("customer",{...form.customer,workAddress:e.target.value})}/></label>
 <label>Prismodell <select value={form.pricing_model} onChange={e=>change("pricing_model",e.target.value)}><option value="fixed">Fastpris</option><option value="hourly">Timepris – kontroller faktiske timer</option><option value="estimate">Prisoverslag</option></select></label>
 <label>Arbeidsbeskrivelse – utført arbeid og hva som inngår <textarea rows={6} maxLength={3000} placeholder="Beskriv arbeidet, materialene og hva som er inkludert i fakturaen..." value={form.customer?.workDescription||""} onChange={e=>change("customer",{...form.customer,workDescription:e.target.value})}/></label>
 <h3>Fakturalinjer</h3>{form.line_items.map((l,i)=><div key={i} style={{borderBottom:"1px solid #ccc",padding:"12px 0"}}><input aria-label="Beskrivelse" value={l.description||""} onChange={e=>changeLine(i,"description",e.target.value)}/><label>Antall <input type="number" min="0" step="0.01" value={l.quantity} onChange={e=>changeLine(i,"quantity",e.target.value)}/></label><label>Enhetspris eks. MVA (kr) <input type="number" min="0" step="0.01" value={(Number(l.unitPriceOre)||0)/100} onChange={e=>changeLine(i,"unitPriceOre",Math.round(Number(e.target.value)*100))}/></label><label>MVA % <select value={l.vatRate} onChange={e=>changeLine(i,"vatRate",Number(e.target.value))}><option value="25">25</option><option value="15">15</option><option value="12">12</option><option value="0">0</option></select></label></div>)}
 <button onClick={()=>change("line_items",[...form.line_items,{description:"",quantity:1,unit:"stk",unitPriceOre:0,vatRate:25,type:"work"}])}>Legg til linje</button>
 <h3>Sum inkl. MVA: {money(total(form.line_items))}</h3>
 <label>Notater <textarea value={form.notes||""} onChange={e=>change("notes",e.target.value)}/></label>
 <p>Kontonummer: <b>8450 46 22699</b> · Avsender: noreply@aadland-service.no</p>
 <button type="button" onClick={()=>{setPreviewOpen(true)}}>Vis fakturakladd</button> <button disabled={busy} onClick={save}>Lagre kladd</button> <button onClick={exportCsv}>Eksporter linjer (CSV)</button> {saved&&<span>{saved}</span>}
 </fieldset>}{!archiveMode&&<div style={{borderTop:"1px solid #d8c9ae",marginTop:18,paddingTop:12}}><strong>Til betaling: {money(total(form.line_items))}</strong><button type="button" disabled={busy||Boolean(form.sent_at)||(form.automatic_send&&["scheduled","processing","needs_review"].includes(form.auto_send_state))} onClick={sendInvoice} style={{display:"block",width:"100%",minHeight:50,margin:"12px 0",padding:"14px 18px",background:"#d5a75a",color:"#171511",border:"1px solid #b88c43",borderRadius:10,fontSize:16,fontWeight:800,whiteSpace:"normal"}}>{busy?"Behandler …":form.sent_at?"Sendt på e-post":form.status==="draft"?"Fakturer og send på e-post":"Prøv e-postsending igjen"}</button><button type="button" disabled={busy||(form?.status==="draft"&&form.automatic_send&&["scheduled","processing","needs_review"].includes(form.auto_send_state))} onClick={printInvoice} style={{display:"block",width:"100%",minHeight:50,margin:"12px 0",padding:"14px 18px",background:"#fff",color:"#171511",border:"2px solid #b88c43",borderRadius:10,fontSize:16,fontWeight:800,whiteSpace:"normal"}}>{busy?"Behandler …":form.status==="draft"?"Fakturer og skriv ut":"Skriv ut faktura"}</button></div>}</>:<p>Velg en {archiveMode?"faktura":"kladd"} i listen.</p>}</section></div>
 <section id="invoice-draft-preview" className="invoicePreviewSection" style={{marginTop:20,border:"1px solid #d8c9ae",borderRadius:14,padding:"16px 18px",background:"#fff",maxWidth:850}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
 <div><h2 style={{margin:"0 0 4px",fontSize:20}}>Fakturaforhåndsvisning</h2><p style={{margin:0,fontSize:13,color:"#655e54"}}>{form?"Se fakturakladden i full størrelse.":"Se et eksempel på fakturadesignet."}</p></div>
 <button type="button" aria-expanded={previewOpen} onClick={()=>setPreviewOpen(x=>!x)}>{previewOpen?"Lukk faktura":"Vis faktura ›"}</button>
 </div>
 {previewOpen&&<div style={{marginTop:16}}>
 {form?.status==="draft"&&(form.customer?.paymentMethod==="vipps"
  ?<p style={{marginBottom:12}}><strong>Leveringsdato: {today}</strong> – settes automatisk når Vipps-fakturaen utstedes.</p>
  :<label style={{display:"grid",gap:5,marginBottom:12,maxWidth:310}}>
    <strong>Leveringsdato / dato for utført arbeid</strong>
    <input type="date" value={form.customer?.workDate||""} disabled={busy} onChange={event=>change("customer",{...form.customer,workDate:event.target.value})}/>
    <small>Velg faktisk leveringsdato før en vanlig faktura utstedes. Datoen lagres sammen med kladden.</small>
   </label>)}
 {error&&<p role="alert" style={{color:"crimson"}}>{error}</p>}
 <p style={{fontSize:13}}>{form?.invoice_number?"Utstedt faktura "+form.invoice_number:"Forhåndsvisning – ikke utstedt."}</p>
 <button type="button" disabled={busy} onClick={downloadPdf}>Last ned faktura som PDF</button>{" "}
 <button type="button" onClick={()=>window.print()}>Skriv ut forhåndsvisning</button>
 {form&&<div style={{display:"flex",flexWrap:"wrap",gap:10,margin:"14px 0",alignItems:"center"}}>
  <button type="button" disabled={busy||Boolean(form.sent_at)||(form.automatic_send&&["scheduled","processing","needs_review"].includes(form.auto_send_state))} onClick={sendInvoice}>{busy?"Behandler …":"Fakturer og send på e-post"}</button>
  <button type="button" onClick={()=>document.getElementById("invoice-vipps-payment")?.scrollIntoView({behavior:"smooth",block:"start"})}>Vipps – åpne betalingsvalg</button>
  <small>Kontroller kunde, leveringsdato og beløp før du sender eller starter betaling.</small>
 </div>}
 <InvoicePreview invoice={form||sample} example={!form}/>
 </div>}
 </section></main>;
}