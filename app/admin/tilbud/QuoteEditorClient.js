"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";

const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:2}).format((Number(ore)||0)/100);
const lineId=()=>("line-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7));
const defaultValidUntil=()=>{
 const d=new Date();
 d.setDate(d.getDate()+30);
 return d.toISOString().slice(0,10);
};
const defaultPlan=[
 {id:"deposit",label:"Forskudd",percent:25,trigger:"Ved aksept av tilbud"},
 {id:"halfway",label:"Halvført arbeid",percent:50,trigger:"Når omtrent halvparten av arbeidet er utført"},
 {id:"completion",label:"Ferdigstillelse",percent:25,trigger:"Ved ferdigstillelse"}
];
const defaultTerms="Tilbudet gjelder arbeid og leveranser som er beskrevet i tilbudet. Endringer eller tilleggsarbeid avtales særskilt og kan faktureres i tillegg. Eventuelle forhold som ikke var synlige eller kjent ved tilbudstidspunktet kan medføre endring i pris eller fremdrift.";

function blankState(){
 return {
  title:"",
  status:"draft",
  customer:{name:"",email:"",phone:"",address:""},
  introText:"Takk for forespørselen. Vi tilbyr følgende arbeid og leveranser:",
  lineItems:[{id:lineId(),type:"work",description:"",quantity:1,unit:"time",unitPriceOre:"",vatRate:25}],
  paymentPlan:defaultPlan,
  notes:"",
  terms:defaultTerms,
  validUntil:defaultValidUntil(),
  plannedStartDate:"",
  autoFollowUp:true
 };
}
function calculate(lines){
 let subtotal=0,vat=0;
 for(const line of lines){
  const quantity=Number(line.quantity)||0;
  const unitPrice=Number(line.unitPriceOre)||0;
  const rate=Number(line.vatRate)||0;
  const net=Math.round(quantity*unitPrice);
  subtotal+=net;
  vat+=Math.round(net*rate/100);
 }
 return {subtotal,vat,total:subtotal+vat};
}

export default function QuoteEditorClient({quoteId=null,sourceOrderId=null,initialCustomer=null}){
 const router=useRouter();
 const [v,setV]=useState(blankState);
 const [quoteNumber,setQuoteNumber]=useState("");
 const [history,setHistory]=useState({createdAt:null,sentAt:null,acceptedAt:null,declinedAt:null});
 const [convertedOrderId,setConvertedOrderId]=useState(null);
 const [converting,setConverting]=useState(false);
 const [loading,setLoading]=useState(Boolean(quoteId));
 const [saving,setSaving]=useState(false);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [savedMessage,setSavedMessage]=useState("");
 const calc=useMemo(()=>calculate(v.lineItems),[v.lineItems]);
 const planSum=useMemo(()=>v.paymentPlan.reduce((sum,row)=>sum+(Number(row.percent)||0),0),[v.paymentPlan]);

 useEffect(()=>{
  if(quoteId||sourceOrderId||!initialCustomer)return;
  const hasValue=["name","email","phone","address"].some(key=>String(initialCustomer?.[key]||"").trim());
  if(!hasValue)return;
  setV(current=>({
   ...current,
   customer:{
    name:String(initialCustomer.name||""),
    email:String(initialCustomer.email||""),
    phone:String(initialCustomer.phone||""),
    address:String(initialCustomer.address||"")
   }
  }));
 },[quoteId,sourceOrderId,initialCustomer]);

 useEffect(()=>{
  if(quoteId||!sourceOrderId)return;
  let cancelled=false;
  fetch("/api/admin/orders")
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Forespørselen kunne ikke lastes.");
    return (data.orders||[]).find(order=>order.id===sourceOrderId)||null;
   })
   .then(order=>{
    if(cancelled||!order)return;
    const customer=order.customer||{};
    const address=[customer.address,customer.postalCode,customer.city].filter(Boolean).join(", ");
    setV(current=>({
     ...current,
     title:current.title||"Arbeid iht. forespørsel",
     customer:{
      name:customer.name||order.customerName||"",
      email:customer.email||order.customerEmail||"",
      phone:customer.phone||order.customerPhone||"",
      address
     },
     introText:order.customRequest
      ?"På bakgrunn av forespørselen tilbyr vi følgende arbeid:\n\n"+order.customRequest
      :current.introText
    }));
   })
   .catch(err=>{if(!cancelled)setError(err.message||"Forespørselen kunne ikke lastes.")});
  return()=>{cancelled=true};
 },[quoteId,sourceOrderId]);

 useEffect(()=>{
  if(!quoteId)return;
  let cancelled=false;
  fetch("/api/admin/quotes?id="+encodeURIComponent(quoteId))
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Tilbudet kunne ikke lastes.");
    return data.quote;
   })
   .then(quote=>{
    if(cancelled)return;
    setQuoteNumber(quote.quoteNumber||"");
    setHistory({createdAt:quote.createdAt||null,sentAt:quote.sentAt||null,acceptedAt:quote.acceptedAt||null,declinedAt:quote.declinedAt||null});
    setConvertedOrderId(quote.convertedOrderId||null);
    setV({
     title:quote.title||"",
     status:quote.status||"draft",
     customer:{
      name:quote.customer?.name||"",
      email:quote.customer?.email||"",
      phone:quote.customer?.phone||"",
      address:quote.customer?.address||""
     },
     introText:quote.introText||"",
     lineItems:Array.isArray(quote.lineItems)&&quote.lineItems.length?quote.lineItems:[{id:lineId(),type:"work",description:"",quantity:1,unit:"time",unitPriceOre:"",vatRate:25}],
     paymentPlan:Array.isArray(quote.paymentPlan)&&quote.paymentPlan.length?quote.paymentPlan:defaultPlan,
     notes:quote.notes||"",
     terms:quote.terms||defaultTerms,
     validUntil:quote.validUntil||"",
     plannedStartDate:quote.plannedStartDate||"",
     autoFollowUp:quote.autoFollowUp!==false
    });
   })
   .catch(err=>{if(!cancelled)setError(err.message||"Tilbudet kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[quoteId]);

 function set(key,value){setV(current=>({...current,[key]:value}))}
 function setCustomer(key,value){setV(current=>({...current,customer:{...current.customer,[key]:value}}))}
 function updateLine(id,key,value){setV(current=>({...current,lineItems:current.lineItems.map(line=>line.id===id?{...line,[key]:value}:line)}))}
 function addLine(type){
  setV(current=>({...current,lineItems:[...current.lineItems,{
   id:lineId(),type,description:"",quantity:1,unit:type==="work"?"time":"stk",unitPriceOre:"",vatRate:25
  }]}));
 }
 function removeLine(id){
  setV(current=>({...current,lineItems:current.lineItems.length===1?current.lineItems:current.lineItems.filter(line=>line.id!==id)}));
 }
 function updatePlan(id,key,value){
  setV(current=>({...current,paymentPlan:current.paymentPlan.map(row=>row.id===id?{...row,[key]:value}:row)}));
 }

 async function save(){
  setError("");setSavedMessage("");
  if(!v.customer.name.trim()){setError("Skriv inn kundenavn.");return;}
  if(!v.title.trim()){setError("Skriv inn hva tilbudet gjelder.");return;}
  if(v.lineItems.some(line=>!String(line.description||"").trim())){setError("Alle tilbudslinjer må ha beskrivelse.");return;}
  if(v.lineItems.some(line=>Number(line.quantity)<=0)){setError("Antall må være større enn 0.");return;}
  if(v.lineItems.some(line=>line.unitPriceOre===""||Number(line.unitPriceOre)<0)){setError("Fyll inn pris på alle tilbudslinjer.");return;}
  if(Math.abs(planSum-100)>0.01){setError("Betalingsplanen må til sammen være 100 %.");return;}

  setSaving(true);
  const response=await fetch("/api/admin/quotes",{
   method:quoteId?"PATCH":"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    ...(quoteId?{id:quoteId}:{}),
    ...v,
    ...(sourceOrderId?{sourceOrderId}:{}),
    lineItems:v.lineItems.map(line=>({...line,unitPriceOre:Number(line.unitPriceOre)||0}))
   })
  });
  const data=await response.json().catch(()=>({}));
  setSaving(false);
  if(!response.ok){setError(data.error||"Tilbudet kunne ikke lagres.");return null;}
  if(!quoteId){
   router.push("/admin/tilbud/"+data.quote.id);
   return data.quote;
  }
  setQuoteNumber(data.quote.quoteNumber||quoteNumber);
  setSavedMessage("Tilbudet er lagret.");
  window.setTimeout(()=>setSavedMessage(""),1800);
  return data.quote;
 }

 async function createJob(){
  if(!quoteId||v.status!=="accepted"||convertedOrderId)return;
  if(!window.confirm("Opprette et oppdrag fra dette godkjente tilbudet?"))return;
  setConverting(true);setError("");setSavedMessage("");
  const response=await fetch("/api/admin/quotes/convert",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:quoteId})
  });
  const data=await response.json().catch(()=>({}));
  setConverting(false);
  if(!response.ok){
   setError(data.error||"Oppdraget kunne ikke opprettes.");
   if(data.orderId)setConvertedOrderId(data.orderId);
   return;
  }
  setConvertedOrderId(data.orderId||null);
  setSavedMessage("Oppdrag "+(data.orderNumber||"")+" er opprettet i backoffice.");
 }

 async function sendQuote(){
  if(!quoteId)return;
  if(!String(v.customer.email||"").trim()){setError("Legg inn kundens e-postadresse før tilbudet sendes.");return;}
  if(!window.confirm("Sende tilbudet til "+v.customer.email+"?"))return;
  setSending(true);setError("");setSavedMessage("");
  const saved=await save();
  if(!saved){setSending(false);return;}
  const response=await fetch("/api/admin/quotes/send",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:quoteId})
  });
  const data=await response.json().catch(()=>({}));
  setSending(false);
  if(!response.ok){setError(data.error||"Tilbudet kunne ikke sendes.");return;}
  setV(current=>({...current,status:"sent"}));
  setHistory(current=>({...current,sentAt:data.sentAt||new Date().toISOString()}));
  setSavedMessage("Tilbudet er sendt til "+(data.sentTo||v.customer.email)+".");
 }

 if(loading)return <main className="admin quoteEditorPage"><section className="adminmain quoteEditorMain"><div className="card">Laster tilbud …</div></section></main>;

 return <main className="admin quoteEditorPage">
  <section className="adminmain quoteEditorMain">
   <div className="kicker">Aadland Service / Tilbud</div>
   <div className="quoteEditorHeader">
    <div>
     <Link className="btn alt" href="/admin/tilbud">← Tilbud</Link>
     <h1>{quoteId?(quoteNumber||"Rediger tilbud"):"Nytt tilbud"}</h1>
     <p className="muted">Prisene på linjene føres ekskl. MVA. Systemet regner MVA og totalsum automatisk.</p>
    </div>
    <div className="quoteEditorHeaderActions">
     {quoteId&&<Link className="btn alt" href={"/admin/tilbud/"+quoteId+"/preview"}>Forhåndsvis / PDF</Link>}
     {quoteId&&v.status==="accepted"&&!convertedOrderId&&<button type="button" className="btn quoteCreateJobButton" disabled={converting} onClick={createJob}>{converting?"Oppretter …":"Opprett oppdrag"}</button>}
     {quoteId&&v.status==="accepted"&&convertedOrderId&&<div className="quoteConvertedJob"><b>Oppdrag opprettet ✓</b><Link href={"/admin/oppdrag/"+convertedOrderId+"/planlegg"}>Planlegg oppdrag</Link><Link href="/admin">Åpne backoffice</Link></div>}
     {quoteId&&!["accepted","declined","cancelled"].includes(v.status)&&<button type="button" className="btn quoteSendButton" disabled={saving||sending} onClick={sendQuote}>{sending?"Sender …":v.status==="sent"?"Send på nytt":"Send tilbud"}</button>}
     <button type="button" className="btn" disabled={saving||sending||converting} onClick={save}>{saving?"Lagrer …":"Lagre tilbud"}</button>
    </div>
   </div>

   {error&&<p className="notice">{error}</p>}
   {savedMessage&&<p className="success">{savedMessage}</p>}

   <div className="quoteEditorLayout">
    <div className="quoteEditorContent">
     <section className="card quoteEditorSection">
      <div className="kicker">KUNDE</div>
      <h3>Kundeopplysninger</h3>
      <div className="quoteFormGrid">
       <div className="field"><label>Navn *</label><input value={v.customer.name} onChange={e=>setCustomer("name",e.target.value)} placeholder="Kundens navn"/></div>
       <div className="field"><label>Telefon</label><input value={v.customer.phone} onChange={e=>setCustomer("phone",e.target.value)} placeholder="Telefonnummer"/></div>
       <div className="field"><label>E-post</label><input type="email" value={v.customer.email} onChange={e=>setCustomer("email",e.target.value)} placeholder="E-postadresse"/></div>
       <div className="field"><label>Adresse</label><input value={v.customer.address} onChange={e=>setCustomer("address",e.target.value)} placeholder="Adresse / arbeidssted"/></div>
      </div>
     </section>

     <section className="card quoteEditorSection">
      <div className="kicker">TILBUDET</div>
      <h3>Hva gjelder tilbudet?</h3>
      <div className="field"><label>Tittel *</label><input value={v.title} onChange={e=>set("title",e.target.value)} placeholder="F.eks. Oppbygging av bad og montering av kjøkken"/></div>
      <div className="field"><label>Innledning</label><textarea rows="3" value={v.introText} onChange={e=>set("introText",e.target.value)}/></div>
      <div className="quoteFormGrid">
       <div className="field"><label>Gyldig til</label><input type="date" value={v.validUntil||""} onChange={e=>set("validUntil",e.target.value)}/></div>
       <div className="field"><label>Tidligst oppstart</label><input type="date" value={v.plannedStartDate||""} onChange={e=>set("plannedStartDate",e.target.value)}/><small className="muted">Vises til kunden. Endelig oppstart avtales etter godkjenning, og datoen kan endres senere.</small></div>
       {quoteId&&<div className="field"><label>Status</label><select value={v.status} onChange={e=>set("status",e.target.value)}><option value="draft">Kladd</option><option value="sent">Sendt</option><option value="accepted">Godkjent</option><option value="declined">Avslått</option><option value="expired">Utløpt</option><option value="cancelled">Avbrutt</option></select></div>}
      </div>
      <label className="quoteFollowUpSetting"><input type="checkbox" checked={v.autoFollowUp!==false} onChange={e=>set("autoFollowUp",e.target.checked)}/><span><b>Automatisk oppfølging etter ca. 2 døgn</b><small>Sendes bare dersom tilbudet fortsatt står som sendt og kunden ikke har svart.</small></span></label>
     </section>

     <section className="card quoteEditorSection">
      <div className="quoteSectionHead">
       <div><div className="kicker">PRISLINJER</div><h3>Arbeid og materialer</h3></div>
       <div><button type="button" className="btn alt" onClick={()=>addLine("work")}>+ Arbeid</button><button type="button" className="btn alt" onClick={()=>addLine("material")}>+ Materiale</button></div>
      </div>

      <div className="quoteLines">
       {v.lineItems.map((line,index)=><div className="quoteLineEditor" key={line.id}>
        <div className="quoteLineNumber">{index+1}</div>
        <div className="field quoteLineDescription"><label>Beskrivelse</label><input value={line.description} onChange={e=>updateLine(line.id,"description",e.target.value)} placeholder={line.type==="work"?"F.eks. Tømrerarbeid":"F.eks. Gipsplater og stendere"}/></div>
        <div className="field quoteLineType"><label>Type</label><select value={line.type} onChange={e=>updateLine(line.id,"type",e.target.value)}><option value="work">Arbeid</option><option value="material">Materiale</option><option value="other">Annet</option></select></div>
        <div className="field quoteLineQuantity"><label>Antall</label><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={e=>updateLine(line.id,"quantity",e.target.value)}/></div>
        <div className="field quoteLineUnit"><label>Enhet</label><input value={line.unit} onChange={e=>updateLine(line.id,"unit",e.target.value)} placeholder="time / stk"/></div>
        <div className="field quoteLinePrice"><label>Pris eks. MVA</label><input type="number" min="0" step="0.01" value={line.unitPriceOre===""?"":Number(line.unitPriceOre)/100} onChange={e=>updateLine(line.id,"unitPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="0"/></div>
        <div className="field quoteLineVat"><label>MVA</label><select value={line.vatRate} onChange={e=>updateLine(line.id,"vatRate",Number(e.target.value))}><option value="25">25 %</option><option value="0">0 %</option></select></div>
        <div className="quoteLineTotal"><small>Linjesum eks.</small><b>{nok((Number(line.quantity)||0)*(Number(line.unitPriceOre)||0))}</b></div>
        <button type="button" className="quoteLineRemove" aria-label="Fjern linje" onClick={()=>removeLine(line.id)}>×</button>
       </div>)}
      </div>
     </section>

     <section className="card quoteEditorSection">
      <div className="kicker">BETALINGSPLAN</div>
      <h3>Delbetaling</h3>
      <p className="muted">Standard er 25 % forskudd, 50 % ved halvført arbeid og 25 % ved ferdigstillelse.</p>
      <div className="quotePaymentPlan">
       {v.paymentPlan.map(row=><div className="quotePaymentRow" key={row.id}>
        <div className="field"><label>Navn</label><input value={row.label} onChange={e=>updatePlan(row.id,"label",e.target.value)}/></div>
        <div className="field"><label>Prosent</label><input type="number" min="0" max="100" step="1" value={row.percent} onChange={e=>updatePlan(row.id,"percent",e.target.value)}/></div>
        <div className="field"><label>Når</label><input value={row.trigger} onChange={e=>updatePlan(row.id,"trigger",e.target.value)}/></div>
        <div className="quotePaymentAmount"><small>Beløp</small><b>{nok(calc.total*(Number(row.percent)||0)/100)}</b></div>
       </div>)}
      </div>
      <p className={Math.abs(planSum-100)<0.01?"quotePlanOk":"quotePlanError"}>Sum betalingsplan: {planSum}%</p>
     </section>

     <section className="card quoteEditorSection">
      <div className="kicker">VILKÅR OG NOTATER</div>
      <div className="field"><label>Vilkår som vises til kunden</label><textarea rows="6" value={v.terms} onChange={e=>set("terms",e.target.value)}/></div>
      <div className="field"><label>Tilleggsnotat som vises til kunden</label><textarea rows="4" value={v.notes} onChange={e=>set("notes",e.target.value)} placeholder="Valgfritt"/></div>
     </section>
    </div>

    <aside className="quoteSummaryCard card">
     <div className="kicker">OPPSUMMERING</div>
     <h3>{v.title||"Nytt tilbud"}</h3>
     <div className="quoteSummaryRows">
      <span><small>Sum eks. MVA</small><b>{nok(calc.subtotal)}</b></span>
      <span><small>MVA</small><b>{nok(calc.vat)}</b></span>
      <span className="quoteSummaryTotal"><small>Total inkl. MVA</small><b>{nok(calc.total)}</b></span>
     </div>
     <div className="quoteSummaryPlan">
      {v.paymentPlan.map(row=><span key={row.id}><small>{row.label} · {row.percent}%</small><b>{nok(calc.total*(Number(row.percent)||0)/100)}</b></span>)}
     </div>
     {quoteId&&v.status==="accepted"&&!convertedOrderId&&<button type="button" className="btn quoteCreateJobButton" disabled={converting} onClick={createJob}>{converting?"Oppretter …":"Opprett oppdrag"}</button>}
     {quoteId&&v.status==="accepted"&&convertedOrderId&&<div className="quoteConvertedJob"><b>Oppdrag opprettet ✓</b><Link href="/admin">Åpne backoffice</Link></div>}
     {quoteId&&!["accepted","declined","cancelled"].includes(v.status)&&<button type="button" className="btn quoteSendButton" disabled={saving||sending} onClick={sendQuote}>{sending?"Sender …":v.status==="sent"?"Send på nytt":"Send tilbud"}</button>}
     <button type="button" className="btn" disabled={saving||sending||converting} onClick={save}>{saving?"Lagrer …":"Lagre tilbud"}</button>
     {quoteId&&<Link className="btn alt" href={"/admin/tilbud/"+quoteId+"/preview"}>Forhåndsvis / PDF</Link>}
     {quoteId&&<div className="quoteHistory">
      <div className="kicker">HISTORIKK</div>
      {history.createdAt&&<span><b>Opprettet</b><small>{new Date(history.createdAt).toLocaleString("nb-NO")}</small></span>}
      {history.sentAt&&<span><b>Sendt</b><small>{new Date(history.sentAt).toLocaleString("nb-NO")}</small></span>}
      {history.acceptedAt&&<span><b>Godkjent</b><small>{new Date(history.acceptedAt).toLocaleString("nb-NO")}</small></span>}
      {history.declinedAt&&<span><b>Avslått</b><small>{new Date(history.declinedAt).toLocaleString("nb-NO")}</small></span>}
     </div>}
    </aside>
   </div>
  </section>
 </main>;
}
