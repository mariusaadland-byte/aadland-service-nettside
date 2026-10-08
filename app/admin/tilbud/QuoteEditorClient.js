"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {osloDateKey,shiftDateKey} from "../../../lib/osloTime";
import {CATALOG_QUOTE_TRANSFER_KEY} from "../../../lib/calculatorQuoteLines";
import QuoteCatalogSearch from "./QuoteCatalogSearch";
import {calculateContribution,withPrivateCosts} from "../../../lib/quotePrivateCosts";

const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:2}).format((Number(ore)||0)/100);
const lineId=()=>("line-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7));
const defaultValidUntil=()=>shiftDateKey(osloDateKey(new Date()),30);
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
  drawingIds:[],
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
 const [savedSnapshot,setSavedSnapshot]=useState("");
 const [sendHistory,setSendHistory]=useState([]);
 const [revisionHistory,setRevisionHistory]=useState([]);
 const [revisedFromId,setRevisedFromId]=useState(null);
 const [revising,setRevising]=useState(false);
 const [paperIssuedAt,setPaperIssuedAt]=useState(null);
 const [acceptanceMethod,setAcceptanceMethod]=useState(null);
 const [paperSignedDate,setPaperSignedDate]=useState("");
 const [showPaperAccept,setShowPaperAccept]=useState(false);
 const [paperAcceptDate,setPaperAcceptDate]=useState(osloDateKey(new Date()));
 const [paperBusy,setPaperBusy]=useState(false);
 const [showAlternateEmail,setShowAlternateEmail]=useState(false);
 const [alternateEmail,setAlternateEmail]=useState("");
 const [availableDrawings,setAvailableDrawings]=useState([]);
 const [showAllDrawings,setShowAllDrawings]=useState(false);
 const calc=useMemo(()=>calculate(v.lineItems),[v.lineItems]);
 const contribution=useMemo(()=>calculateContribution(v.lineItems),[v.lineItems]);
 const planSum=useMemo(()=>v.paymentPlan.reduce((sum,row)=>sum+(Number(row.percent)||0),0),[v.paymentPlan]);
 const isDirty=useMemo(()=>Boolean(savedSnapshot)&&JSON.stringify(v)!==savedSnapshot,[v,savedSnapshot]);
 const locked=quoteId&&v.status!=="draft";

 useEffect(()=>{
  let active=true;
  fetch("/api/admin/project-drawings",{cache:"no-store"}).then(async response=>{
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error("Kunne ikke hente tegninger");
   return data.drawings||[];
  }).then(drawings=>{if(active)setAvailableDrawings(drawings)}).catch(()=>{});
  return()=>{active=false};
 },[]);

 useEffect(()=>{
  if(!quoteId&&!savedSnapshot)setSavedSnapshot(JSON.stringify(v));
 },[quoteId,savedSnapshot]);

 useEffect(()=>{
  const handleBeforeUnload=event=>{
   if(!isDirty)return;
   event.preventDefault();
   event.returnValue="";
  };
  window.addEventListener("beforeunload",handleBeforeUnload);
  return()=>window.removeEventListener("beforeunload",handleBeforeUnload);
 },[isDirty]);

 useEffect(()=>{
  if(quoteId)return;
  try{
   const raw=sessionStorage.getItem("aadlandQuoteDraftFromDrawing");
   if(!raw)return;
   sessionStorage.removeItem("aadlandQuoteDraftFromDrawing");
   const draft=JSON.parse(raw);
   const importedLines=(Array.isArray(draft?.lineItems)?draft.lineItems:[]).slice(0,120).map(line=>({
    id:lineId(),
    type:["work","material","other"].includes(line?.type)?line.type:"other",
    description:String(line?.description||"").trim().slice(0,500),
    quantity:Math.max(0.01,Number(line?.quantity)||1),
    unit:String(line?.unit||"stk").trim().slice(0,20),
    unitPriceOre:Number.isFinite(Number(line?.unitPriceOre))&&Number(line.unitPriceOre)>=0?Math.round(Number(line.unitPriceOre)):"",
    vatRate:Number(line?.vatRate)===0?0:25,
    internalUnitCostOre:line?.internalUnitCostOre==null||line.internalUnitCostOre===""?"":Math.max(0,Math.round(Number(line.internalUnitCostOre)||0))
   })).filter(line=>line.description);
   setV(current=>({
    ...current,
    title:String(draft?.title||current.title||"").slice(0,180),
    customer:{
     ...current.customer,
     name:String(draft?.customer?.name||current.customer.name||"").slice(0,120),
     email:String(draft?.customer?.email||current.customer.email||"").slice(0,240),
     phone:String(draft?.customer?.phone||current.customer.phone||"").slice(0,80),
     address:String(draft?.customer?.address||current.customer.address||"").slice(0,300)
    },
    drawingIds:Array.isArray(draft?.drawingIds)?draft.drawingIds.slice(0,8):current.drawingIds,
    lineItems:importedLines.length?importedLines:current.lineItems,
    notes:String(draft?.notes||current.notes||"").slice(0,8000)
   }));
   if(importedLines.length){const priced=importedLines.filter(line=>line.unitPriceOre!=="").length;setSavedMessage(importedLines.length+" linjer er hentet inn"+(priced?" · "+priced+" med ferdig pris.":"."));}
  }catch{}
 },[quoteId]);

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
    setSendHistory(Array.isArray(quote.sendHistory)?quote.sendHistory:[]);
    setRevisionHistory(Array.isArray(quote.revisionHistory)?quote.revisionHistory:[]);
    setRevisedFromId(quote.revisedFromId||null);
    setPaperIssuedAt(quote.paperIssuedAt||null);
    setAcceptanceMethod(quote.acceptanceMethod||null);
    setPaperSignedDate(quote.paperSignedDate||"");
    setConvertedOrderId(quote.convertedOrderId||null);
    const loadedState={
     title:quote.title||"",
     status:quote.status||"draft",
     customer:{
      name:quote.customer?.name||"",
      email:quote.customer?.email||"",
      phone:quote.customer?.phone||"",
      address:quote.customer?.address||""
     },
     drawingIds:Array.isArray(quote.drawingIds)?quote.drawingIds:[],
     introText:quote.introText||"",
     lineItems:Array.isArray(quote.lineItems)&&quote.lineItems.length?withPrivateCosts(quote.lineItems,quote.internalCosts):[{id:lineId(),type:"work",description:"",quantity:1,unit:"time",unitPriceOre:"",vatRate:25}],
     paymentPlan:Array.isArray(quote.paymentPlan)&&quote.paymentPlan.length?quote.paymentPlan:defaultPlan,
     notes:quote.notes||"",
     terms:quote.terms||defaultTerms,
     validUntil:quote.validUntil||"",
     plannedStartDate:quote.plannedStartDate||"",
     autoFollowUp:quote.autoFollowUp!==false
    };
    // Add selected supplier goods to an EXISTING draft only after we have loaded
    // its persisted lines. Never replace the customer's existing offer content.
    let mergedState=loadedState,importedCount=0,transferProblem="";
    try{
     const raw=sessionStorage.getItem(CATALOG_QUOTE_TRANSFER_KEY);
     if(raw){
      const transfer=JSON.parse(raw);
      if(transfer?.quoteId===quoteId){
       sessionStorage.removeItem(CATALOG_QUOTE_TRANSFER_KEY);
       const expired=!Number.isFinite(transfer.createdAt)||Date.now()-transfer.createdAt>10*60*1000;
       const expectedEmail=String(transfer.customer?.email||"").trim().toLowerCase();
       const actualEmail=String(quote.customer?.email||"").trim().toLowerCase();
       const sameCustomer=expectedEmail&&actualEmail
        ?expectedEmail===actualEmail
        :String(transfer.customer?.name||"").trim().toLowerCase()===String(quote.customer?.name||"").trim().toLowerCase();
       if(expired)transferProblem="Overføringen fra priskalkulatoren er utløpt. Prøv på nytt.";
       else if(quote.status!=="draft")transferProblem="Bare tilbudskladder kan få nye varer. Opprett en revisjon av sendte tilbud.";
       else if(!sameCustomer)transferProblem="Kunden i kalkulatoren er ikke den samme som på tilbudet. Varene er ikke lagt til.";
       else{
        const incoming=(Array.isArray(transfer.lineItems)?transfer.lineItems:[]).slice(0,110).map(row=>({
         id:lineId(),type:["work","material","other"].includes(row.type)?row.type:"material",
         description:String(row.description||"").trim().slice(0,500),
         quantity:Number(row.quantity)||1,
         unit:String(row.unit||"stk").slice(0,40),
         unitPriceOre:Math.max(0,Math.round(Number(row.unitPriceOre)||0)),vatRate:Number(row.vatRate)===0?0:25,
         internalUnitCostOre:row.internalUnitCostOre==null||row.internalUnitCostOre===""?"":Math.max(0,Math.round(Number(row.internalUnitCostOre)||0))
        })).filter(row=>row.description&&row.quantity>0);
        if(!incoming.length)transferProblem="Ingen gyldige varelinjer ble funnet i overføringen.";
        else if(loadedState.lineItems.length+incoming.length>120)transferProblem="Dette tilbudet har ikke plass til så mange nye varelinjer (maks 120).";
        else{mergedState={...loadedState,lineItems:[...loadedState.lineItems,...incoming]};importedCount=incoming.length;}
       }
      }
     }
    }catch{transferProblem="Varene fra kalkulatoren kunne ikke leses. Prøv på nytt."}
    setV(mergedState);
    setSavedSnapshot(JSON.stringify(loadedState));
    if(quote.privateCostsUnavailable)setError("Interne kostnader kunne ikke hentes. Kontroller disse før du lagrer.");
    if(importedCount)setSavedMessage(importedCount+" varelinje(r) lagt til i tilbudskladden. Kontroller prisene og trykk «Lagre tilbud».");
    if(transferProblem)setError(transferProblem);
   })
   .catch(err=>{if(!cancelled)setError(err.message||"Tilbudet kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[quoteId]);

 function set(key,value){setV(current=>({...current,[key]:value}))}
 function setCustomer(key,value){setV(current=>({...current,customer:{...current.customer,[key]:value}}))}
 function chooseDrawing(row,checked){if(checked&&row.customer&&v.customer.name&&String(row.customer).trim().toLowerCase()!==String(v.customer.name).trim().toLowerCase()){if(!window.confirm("Denne tegningen er registrert på «"+row.customer+"», men tilbudet gjelder «"+v.customer.name+"». Er du sikker på at riktig tegning skal sendes?"))return;}setV(current=>({...current,drawingIds:checked?[...current.drawingIds,row.id].slice(0,8):current.drawingIds.filter(id=>id!==row.id)}))}
 function updateLine(id,key,value){setV(current=>({...current,lineItems:current.lineItems.map(line=>line.id===id?{...line,[key]:value}:line)}))}
 function addCatalogProduct(product,markup){
  if(locked||v.lineItems.length>=120){setError("Tilbudet er låst, eller har nådd maksimum 120 linjer.");return false;}
  const description=[String(product.name||"").trim(),product.sku?"Varenr. "+String(product.sku).trim():""].filter(Boolean).join(" · ");
  if(!description)return false;
  const quantity=1,unit=String(product.unit||"stk").trim().slice(0,40)||"stk";
  const unitPriceOre=Math.max(0,Math.round((Number(product.costExVat)||0)*(1+Math.max(0,markup)/100)*100));
  setV(current=>{
   const old=current.lineItems;
   const blank=old.length===1&&!String(old[0].description||"").trim()&&old[0].unitPriceOre==="";
   const items=blank?[]:old;
   const exists=items.find(line=>line.type==="material"&&line.description===description&&line.unit===unit&&Number(line.unitPriceOre)===unitPriceOre);
   if(exists)return {...current,lineItems:items.map(line=>line.id===exists.id?{...line,quantity:(Number(line.quantity)||0)+1}:line)};
   return {...current,lineItems:[...items,{id:lineId(),type:"material",description,quantity,unit,unitPriceOre,vatRate:25,internalUnitCostOre:Math.max(0,Math.round((Number(product.costExVat)||0)*100))}]};
  });
  setError("");
  return true;
 }
 function addLine(type){
  setV(current=>({...current,lineItems:[...current.lineItems,{
   id:lineId(),type,description:"",quantity:1,unit:type==="work"?"time":"stk",unitPriceOre:"",vatRate:25,internalUnitCostOre:""
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
  if(locked){setError(v.status==="sent"?"Sendte tilbud er låst. Opprett en revisjon for å gjøre endringer.":"Denne tilbudsversjonen er låst.");return null;}
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
  if(!response.ok){
   if(!quoteId&&data.quoteId){
    router.replace("/admin/tilbud/"+data.quoteId);
    return null;
   }
   setError(data.error||"Tilbudet kunne ikke lagres.");return null;
  }
  if(!quoteId){
   router.push("/admin/tilbud/"+data.quote.id);
   return data.quote;
  }
  setQuoteNumber(data.quote.quoteNumber||quoteNumber);
  setSavedSnapshot(JSON.stringify(v));
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

 async function sendQuote(recipientOverride=""){
  if(!quoteId)return false;
  const recipient=String(recipientOverride||v.customer.email||"").trim().toLowerCase();
  if(!recipient){setError("Legg inn kundens e-postadresse før tilbudet sendes.");return false;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){setError("E-postadressen er ugyldig.");return false;}
  if(!window.confirm("Sende tilbudet til "+recipient+"?"))return false;
  setSending(true);setError("");setSavedMessage("");
  if(v.status==="draft"){
   const saved=await save();
   if(!saved){setSending(false);return false;}
  }else if(v.status!=="sent"){
   setSending(false);setError("Denne tilbudsversjonen kan ikke sendes.");return false;
  }
  const response=await fetch("/api/admin/quotes/send",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:quoteId,...(recipientOverride?{recipientEmail:recipient}:{})})
  });
  const data=await response.json().catch(()=>({}));
  setSending(false);
  if(!response.ok){setError(data.error||"Tilbudet kunne ikke sendes.");return false;}
  const nextState={...v,status:"sent"};
  setV(nextState);
  setSavedSnapshot(JSON.stringify(nextState));
  setHistory(current=>({...current,sentAt:data.sentAt||new Date().toISOString()}));
  setRevisionHistory(current=>current.map(item=>{
   if(item.id===quoteId)return {...item,status:"sent",sentAt:data.sentAt||new Date().toISOString()};
   if(revisedFromId&&item.id===revisedFromId)return {...item,status:"superseded",supersededAt:data.sentAt||new Date().toISOString()};
   return item;
  }));
  setSendHistory(current=>[{
   recipient:data.sentTo||recipient,
   deliveryType:data.deliveryType||((recipientOverride&&recipient!==String(v.customer.email||"").trim().toLowerCase())?"alternate":"primary"),
   sentAt:data.sentAt||new Date().toISOString()
  },...current].slice(0,20));
  setSavedMessage("Tilbudet er sendt til "+(data.sentTo||recipient)+(data.pdfAttached?" med PDF-kopi vedlagt.":". Kontrollér at PDF-kopien fulgte med.")+(v.drawingIds.length?(data.drawingsPublished?" Tegningskopien er også tilgjengelig på kundens Min side.":" Tegningen er ikke delt på Min side (testadresse eller feil ved publisering)."):""));
  return true;
 }

 function openAlternateEmail(){
  setAlternateEmail("");
  setError("");
  setShowAlternateEmail(true);
 }

 async function confirmAlternateEmailSend(){
  const email=String(alternateEmail||"").trim().toLowerCase();
  if(!email){setError("Skriv inn en e-postadresse.");return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setError("E-postadressen er ugyldig.");return;}
  const ok=await sendQuote(email);
  if(ok){setShowAlternateEmail(false);setAlternateEmail("");}
 }

 async function openPaperCopy(){
  if(!quoteId)return;
  setError("");setSavedMessage("");
  if(v.status==="draft"){
   const saved=await save();
   if(!saved)return;
  }
  router.push("/admin/tilbud/"+quoteId+"/preview");
 }

 async function registerPaperIssue(){
  if(!quoteId||!["draft","sent"].includes(v.status))return;
  if(!window.confirm(v.status==="draft"
   ?"Registrere at dette tilbudet er utlevert til kunden på papir? Da låses denne versjonen."
   :"Registrere at kunden også har fått denne tilbudsversjonen på papir?"))return;
  setPaperBusy(true);setError("");setSavedMessage("");
  if(v.status==="draft"){
   const saved=await save();
   if(!saved){setPaperBusy(false);return;}
  }
  const response=await fetch("/api/admin/quotes/paper-issue",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:quoteId})
  });
  const data=await response.json().catch(()=>({}));
  setPaperBusy(false);
  if(!response.ok){setError(data.error||"Papirutleveringen kunne ikke registreres.");return;}
  const nextState={...v,status:"sent"};
  setV(nextState);
  setSavedSnapshot(JSON.stringify(nextState));
  setPaperIssuedAt(data.paperIssuedAt||new Date().toISOString());
  setHistory(current=>({...current,sentAt:current.sentAt||data.sentAt||new Date().toISOString()}));
  setRevisionHistory(current=>current.map(item=>{
   if(item.id===quoteId)return {...item,status:"sent",sentAt:item.sentAt||data.sentAt||new Date().toISOString()};
   if(revisedFromId&&item.id===revisedFromId)return {...item,status:"superseded",supersededAt:data.sentAt||new Date().toISOString()};
   return item;
  }));
  setSavedMessage("Registrert som utlevert på papir.");
 }

 function openPaperAcceptance(){
  setPaperAcceptDate(osloDateKey(new Date()));
  setError("");
  setShowPaperAccept(true);
 }

 async function confirmPaperAcceptance(){
  if(!quoteId||v.status!=="sent")return;
  setPaperBusy(true);setError("");setSavedMessage("");
  const response=await fetch("/api/admin/quotes/paper-accept",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:quoteId,signedDate:paperAcceptDate})
  });
  const data=await response.json().catch(()=>({}));
  setPaperBusy(false);
  if(!response.ok){setError(data.error||"Papirgodkjenningen kunne ikke registreres.");return;}
  const nextState={...v,status:"accepted"};
  setV(nextState);
  setSavedSnapshot(JSON.stringify(nextState));
  setAcceptanceMethod("paper");
  setPaperSignedDate(data.paperSignedDate||paperAcceptDate);
  setHistory(current=>({...current,acceptedAt:data.acceptedAt||new Date().toISOString()}));
  setRevisionHistory(current=>current.map(item=>item.id===quoteId?{...item,status:"accepted",acceptedAt:data.acceptedAt||new Date().toISOString()}:item));
  setShowPaperAccept(false);
  setSavedMessage("Godkjenningen på papir er registrert.");
 }

 async function createRevision(){
  if(!quoteId||!["sent","expired"].includes(v.status))return;
  if(!window.confirm("Opprette en ny revisjon? Den sendte versjonen beholdes urørt til den nye revisjonen faktisk sendes."))return;
  setRevising(true);setError("");setSavedMessage("");
  const response=await fetch("/api/admin/quotes/revise",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:quoteId})
  });
  const data=await response.json().catch(()=>({}));
  setRevising(false);
  if(!response.ok){
   if(data.quoteId){router.push("/admin/tilbud/"+data.quoteId);return;}
   setError(data.error||"Ny revisjon kunne ikke opprettes.");return;
  }
  router.push("/admin/tilbud/"+data.quoteId);
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
     {quoteId&&<div className={isDirty?"quoteSaveState quoteSaveStateDirty":"quoteSaveState"}>{locked?"🔒 Låst versjon":isDirty?"● Ulagrede endringer":"✓ Alt er lagret"}</div>}
    </div>
    <div className="quoteEditorHeaderActions">
     {quoteId&&<button type="button" className="btn alt" disabled={saving||sending} onClick={openPaperCopy}>Forhåndsvis / last ned PDF</button>}
     {quoteId&&["draft","sent"].includes(v.status)&&<button type="button" className="btn alt" disabled={saving||sending} onClick={openAlternateEmail}>Send til annen e-post</button>}
     {quoteId&&v.status==="draft"&&!paperIssuedAt&&<button type="button" className="btn alt" disabled={paperBusy||saving} onClick={registerPaperIssue}>{paperBusy?"Registrerer …":"Registrer utlevert på papir"}</button>}
     {quoteId&&v.status==="sent"&&!paperIssuedAt&&<button type="button" className="btn alt" disabled={paperBusy} onClick={registerPaperIssue}>Registrer utlevert på papir</button>}
     {quoteId&&v.status==="sent"&&<button type="button" className="btn alt" disabled={paperBusy} onClick={openPaperAcceptance}>Registrer papirgodkjenning</button>}
     {quoteId&&["sent","expired"].includes(v.status)&&<button type="button" className="btn quoteRevisionButton" disabled={revising} onClick={createRevision}>{revising?"Oppretter …":"Opprett revisjon"}</button>}
     {quoteId&&v.status==="accepted"&&!convertedOrderId&&<button type="button" className="btn quoteCreateJobButton" disabled={converting} onClick={createJob}>{converting?"Oppretter …":"Opprett oppdrag"}</button>}
     {quoteId&&v.status==="accepted"&&convertedOrderId&&<div className="quoteConvertedJob"><b>Oppdrag opprettet ✓</b><Link href={"/admin/oppdrag/"+convertedOrderId+"/planlegg"}>Planlegg oppdrag</Link><Link href="/admin">Åpne backoffice</Link></div>}
     {quoteId&&["draft","sent"].includes(v.status)&&<button type="button" className="btn quoteSendButton" disabled={saving||sending} onClick={()=>sendQuote()}>{sending?"Sender …":v.status==="sent"?"Send på nytt":"Send tilbud"}</button>}
     {!locked&&<button type="button" className="btn" disabled={saving||sending||converting} onClick={save}>{saving?"Lagrer …":"Lagre tilbud"}</button>}
    </div>
   </div>

   {v.status==="sent"&&<div className="quoteRevisionNotice"><b>Sendt versjon er låst</b><span>Opprett en revisjon dersom pris, innhold eller vilkår skal endres. Denne versjonen beholdes som dokumentasjon.</span><button type="button" className="btn" disabled={revising} onClick={createRevision}>{revising?"Oppretter …":"Opprett revisjon"}</button></div>}
   {v.status==="superseded"&&<div className="quoteRevisionNotice quoteRevisionSuperseded"><b>Denne versjonen er erstattet</b><span>Versjonen beholdes urørt i historikken. Åpne den nyeste revisjonen nedenfor.</span></div>}
   {v.status==="expired"&&<div className="quoteRevisionNotice"><b>Tilbudet er utløpt</b><span>Lag en ny revisjon for å oppdatere pris, gyldighet eller innhold.</span><button type="button" className="btn" disabled={revising} onClick={createRevision}>{revising?"Oppretter …":"Opprett revisjon"}</button></div>}
   {error&&<p className="notice">{error}</p>}
   {savedMessage&&<p className="success">{savedMessage}</p>}

   <div className="quoteEditorLayout">
    <fieldset className="quoteEditorContent quoteEditorFieldset" disabled={Boolean(locked)}>
     <section id="quote-material-search" className="card quoteEditorSection">
      <div className="quoteSectionHead">
       <div><div className="kicker">PRISLINJER</div><h3>Arbeid og materialer</h3></div>
       <div><button type="button" className="btn alt" onClick={()=>addLine("work")}>+ Arbeid</button><button type="button" className="btn alt" onClick={()=>addLine("material")}>+ Materiale</button></div>
      </div>

      {!locked&&<QuoteCatalogSearch onChoose={addCatalogProduct}/>}

      <div className="quoteLines">
       {v.lineItems.map((line,index)=><div className="quoteLineEditor" key={line.id}>
        <div className="quoteLineNumber">{index+1}</div>
        <div className="field quoteLineDescription"><label>Beskrivelse</label><input value={line.description} onChange={e=>updateLine(line.id,"description",e.target.value)} placeholder={line.type==="work"?"F.eks. Tømrerarbeid":"F.eks. Gipsplater og stendere"}/></div>
        <div className="field quoteLineType"><label>Type</label><select value={line.type} onChange={e=>updateLine(line.id,"type",e.target.value)}><option value="work">Arbeid</option><option value="material">Materiale</option><option value="other">Annet</option></select></div>
        <div className="field quoteLineQuantity"><label>Antall</label><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={e=>updateLine(line.id,"quantity",e.target.value)}/></div>
        <div className="field quoteLineUnit"><label>Enhet</label><input value={line.unit} onChange={e=>updateLine(line.id,"unit",e.target.value)} placeholder="time / stk"/></div>
        <div className="field quoteLinePrice"><label>Pris eks. MVA</label><input type="number" min="0" step="0.01" value={line.unitPriceOre===""?"":Number(line.unitPriceOre)/100} onChange={e=>updateLine(line.id,"unitPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="0"/></div>
        <div className="field quoteLineInternalCost"><label>Intern kostnad eks. MVA / enhet</label><input type="number" min="0" step="0.01" inputMode="decimal" value={line.internalUnitCostOre===""||line.internalUnitCostOre==null?"":Number(line.internalUnitCostOre)/100} onChange={e=>updateLine(line.id,"internalUnitCostOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="Ikke registrert" title="Kun intern kalkyle. Vises aldri for kunden."/><small className="muted">Kun internt</small></div>
        <div className="field quoteLineVat"><label>MVA</label><select value={line.vatRate} onChange={e=>updateLine(line.id,"vatRate",Number(e.target.value))}><option value="25">25 %</option><option value="0">0 %</option></select></div>
        <div className="quoteLineTotal"><small>Linjesum eks.</small><b>{nok((Number(line.quantity)||0)*(Number(line.unitPriceOre)||0))}</b></div>
        <button type="button" className="quoteLineRemove" aria-label="Fjern linje" onClick={()=>removeLine(line.id)}>×</button>
       </div>)}
      </div>
     </section>


     <section className="card quoteEditorSection">
      <div className="kicker">KUNDE</div>
      <h3>Kundeopplysninger</h3>
      <div className="quoteFormGrid">
       <div className="field"><label>Navn *</label><input value={v.customer.name} onChange={e=>setCustomer("name",e.target.value)} placeholder="Kundens navn" autoComplete="name"/></div>
       <div className="field"><label>Telefon</label><input type="tel" inputMode="tel" value={v.customer.phone} onChange={e=>setCustomer("phone",e.target.value)} placeholder="Telefonnummer" autoComplete="tel"/></div>
       <div className="field"><label>E-post</label><input type="email" inputMode="email" value={v.customer.email} onChange={e=>setCustomer("email",e.target.value)} placeholder="E-postadresse" autoComplete="email" autoCapitalize="none" spellCheck="false"/></div>
       <div className="field"><label>Adresse</label><input value={v.customer.address} onChange={e=>setCustomer("address",e.target.value)} placeholder="Adresse / arbeidssted" autoComplete="street-address"/></div>
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
       {quoteId&&<div className="field"><label>Status</label><select value={v.status} disabled><option value="draft">Kladd</option><option value="sent">Sendt</option><option value="accepted">Godkjent</option><option value="declined">Avslått</option><option value="expired">Utløpt</option><option value="cancelled">Avbrutt</option><option value="superseded">Erstattet</option></select></div>}
      </div>
      <label className="quoteFollowUpSetting"><input type="checkbox" checked={v.autoFollowUp!==false} onChange={e=>set("autoFollowUp",e.target.checked)}/><span><b>Automatisk oppfølging etter ca. 2 døgn</b><small>Sendes bare dersom tilbudet fortsatt står som sendt og kunden ikke har svart.</small></span></label>
     </section>

     <section className="card quoteEditorSection">
      <div className="kicker">TEGNINGER SOM FØLGER TILBUDET</div>
      <h3>Plantegning og veggtegninger i PDF</h3>
      <p className="muted">Velg lagrede tegninger som skal følge med i PDF-kopien. Hver valgt tegning får en plantegning og en frontvisning av hver vegg. Du kan hente og redigere tegninger i <a href="/admin/tegninger">tegningsarkivet</a>, eller lage en ny tegning i <a href="/admin/tegning">tegneverktøyet</a>. Tegningen blir først synlig på kundens Min side når tilbudet sendes til kundens e-post.</p>
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:10}}><input type="checkbox" checked={showAllDrawings} onChange={e=>setShowAllDrawings(e.target.checked)}/> Vis tegninger for alle kunder</label>
      <div style={{display:"grid",gap:8}}>
       {availableDrawings.filter(row=>showAllDrawings||v.drawingIds.includes(row.id)||!v.customer.name||String(row.customer||"").trim().toLocaleLowerCase("nb-NO")===String(v.customer.name).trim().toLocaleLowerCase("nb-NO")).map(row=><label key={row.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px",border:"1px solid #e2dacd",borderRadius:8,background:"#fff",color:"#25221e",cursor:"pointer"}}>
        <input type="checkbox" style={{marginTop:4}} checked={v.drawingIds.includes(row.id)} onChange={e=>chooseDrawing(row,e.target.checked)}/>
        <span><b>{row.name}</b><small style={{display:"block",marginTop:3,color:"#666"}}>{[row.customer,row.address].filter(Boolean).join(" · ")} · {(row.drawingData?.walls||[]).length} vegger</small></span>
       </label>)}
      </div>
      {!availableDrawings.length&&<p className="muted">Ingen tegninger er lagret på serveren ennå. Opprett kunde i tegneprogrammet og lagre tegningen.</p>}
      <p className="muted" style={{marginTop:12}}><b>{v.drawingIds.length} tegning(er)</b> vil bli med som PDF-vedlegg.</p>
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
    </fieldset>

    <aside className="quoteSummaryCard card">
     <div className="kicker">OPPSUMMERING</div>
     <h3>{v.title||"Nytt tilbud"}</h3>
     <div className="quoteSummaryRows">
      <span><small>Sum eks. MVA</small><b>{nok(calc.subtotal)}</b></span>
      <span><small>MVA</small><b>{nok(calc.vat)}</b></span>
      <span className="quoteSummaryTotal"><small>Total inkl. MVA</small><b>{nok(calc.total)}</b></span>
     </div>
     <section className="quoteProfitPanel" aria-label="Intern kostnad og dekningsbidrag">
      <div className="kicker">INTERN KALKYLE · KUN ADMIN</div>
      <h4>Estimert dekningsbidrag</h4>
      {contribution.known>0?<div className="quoteProfitNumbers">
       <span><small>Salgsverdi for kalkulerte linjer eks. MVA</small><b>{nok(contribution.coveredSaleOre)}</b></span>
       <span><small>Innkjøp og estimerte kostnader eks. MVA</small><b>{nok(contribution.costOre)}</b></span>
       <span className="quoteProfitResult"><small>Dekningsbidrag (før andre kostnader/skatt)</small><b>{nok(contribution.contributionOre)}</b></span>
       <span><small>Dekningsgrad for kalkulerte linjer</small><b>{new Intl.NumberFormat("nb-NO",{maximumFractionDigits:1}).format(contribution.contributionPercent)} %</b></span>
      </div>:<p className="quoteProfitHelp">Legg inn intern kostnad per enhet på prislinjene for å se hva oppdraget er beregnet å gi.</p>}
      {contribution.missing>0&&<p className="quoteProfitWarning">{contribution.missing} linje(r) mangler kostnadsgrunnlag. Tallene er derfor bare et delestimat, ikke samlet fortjeneste for tilbudet.</p>}
      {contribution.complete&&contribution.known>0&&<p className="quoteProfitHelp">Alle linjer har kostnad. Dette er dekningsbidrag før faste driftsutgifter, eventuelle tillegg og skatt – ikke nettofortjeneste.</p>}
      <small>Innkjøpspriser og denne oversikten lagres separat fra kundetilbudet og vises ikke i PDF, e-post eller på Min side.</small>
     </section>
     <p className="muted">{v.drawingIds.length? v.drawingIds.length+" plantegning(er) med veggvisninger vedlagt PDF":"Ingen tegninger valgt"}</p>
     <div className="quoteSummaryPlan">
      {v.paymentPlan.map(row=><span key={row.id}><small>{row.label} · {row.percent}%</small><b>{nok(calc.total*(Number(row.percent)||0)/100)}</b></span>)}
     </div>
     {quoteId&&v.status==="draft"&&!paperIssuedAt&&<button type="button" className="btn alt" disabled={paperBusy||saving} onClick={registerPaperIssue}>{paperBusy?"Registrerer …":"Registrer utlevert på papir"}</button>}
     {quoteId&&v.status==="sent"&&!paperIssuedAt&&<button type="button" className="btn alt" disabled={paperBusy} onClick={registerPaperIssue}>Registrer utlevert på papir</button>}
     {quoteId&&v.status==="sent"&&<button type="button" className="btn alt" disabled={paperBusy} onClick={openPaperAcceptance}>Registrer papirgodkjenning</button>}
     {quoteId&&["sent","expired"].includes(v.status)&&<button type="button" className="btn quoteRevisionButton" disabled={revising} onClick={createRevision}>{revising?"Oppretter …":"Opprett revisjon"}</button>}
     {quoteId&&v.status==="accepted"&&!convertedOrderId&&<button type="button" className="btn quoteCreateJobButton" disabled={converting} onClick={createJob}>{converting?"Oppretter …":"Opprett oppdrag"}</button>}
     {quoteId&&v.status==="accepted"&&convertedOrderId&&<div className="quoteConvertedJob"><b>Oppdrag opprettet ✓</b><Link href="/admin">Åpne backoffice</Link></div>}
     {quoteId&&["draft","sent"].includes(v.status)&&<button type="button" className="btn quoteSendButton" disabled={saving||sending} onClick={()=>sendQuote()}>{sending?"Sender …":v.status==="sent"?"Send på nytt":"Send tilbud"}</button>}
     {!locked&&<button type="button" className="btn" disabled={saving||sending||converting} onClick={save}>{saving?"Lagrer …":"Lagre tilbud"}</button>}
     {quoteId&&["draft","sent"].includes(v.status)&&<button type="button" className="btn alt" disabled={saving||sending} onClick={openAlternateEmail}>Send til annen e-post</button>}
     {quoteId&&<button type="button" className="btn alt" disabled={saving||sending} onClick={openPaperCopy}>Forhåndsvis / last ned PDF</button>}
     {quoteId&&<div className="quoteHistory">
      <div className="kicker">HISTORIKK</div>
      {revisionHistory.length>1&&<div className="quoteRevisionHistory">
       {revisionHistory.map(item=><Link key={item.id} className={item.id===quoteId?"quoteRevisionItem active":"quoteRevisionItem"} href={"/admin/tilbud/"+item.id}>
        <span><b>Revisjon {item.revisionNumber}</b><small>{item.quoteNumber}</small></span>
        <small>{item.status==="superseded"?"Erstattet":item.status==="sent"?"Sendt":item.status==="accepted"?"Godkjent":item.status==="draft"?"Kladd":item.status}</small>
       </Link>)}
      </div>}
      {history.createdAt&&<span><b>Opprettet</b><small>{new Date(history.createdAt).toLocaleString("nb-NO")}</small></span>}
      {history.sentAt&&<span><b>Sendt / utlevert</b><small>{new Date(history.sentAt).toLocaleString("nb-NO")}</small></span>}
      {paperIssuedAt&&<span><b>Utlevert på papir</b><small>{new Date(paperIssuedAt).toLocaleString("nb-NO")}</small></span>}
      {history.acceptedAt&&<span><b>{acceptanceMethod==="paper"?"Godkjent på papir":"Godkjent"}</b><small>{acceptanceMethod==="paper"&&paperSignedDate?new Date(paperSignedDate+"T12:00:00").toLocaleDateString("nb-NO")+" · registrert ":""}{new Date(history.acceptedAt).toLocaleString("nb-NO")}</small></span>}
      {history.declinedAt&&<span><b>Avslått</b><small>{new Date(history.declinedAt).toLocaleString("nb-NO")}</small></span>}
      {sendHistory.map((entry,index)=><span className="quoteEmailHistoryRow" key={(entry.sentAt||"send")+"-"+index}><b>{entry.deliveryType==="alternate"?"Sendt til annen e-post":"Sendt til kunde"}</b><small>{entry.recipient}{entry.sentAt?" · "+new Date(entry.sentAt).toLocaleString("nb-NO"):""}</small></span>)}
     </div>}
    </aside>
   </div>
  </section>

  {showPaperAccept&&<div className="quoteModalBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!paperBusy)setShowPaperAccept(false)}}>
   <div className="quoteModal" role="dialog" aria-modal="true" aria-labelledby="quotePaperAcceptTitle">
    <div>
     <div className="kicker">PAPIRGODKJENNING</div>
     <h2 id="quotePaperAcceptTitle">Registrer signert tilbud</h2>
     <p className="muted">Velg datoen kunden faktisk signerte papirutgaven.</p>
    </div>
    <div className="field">
     <label>Signeringsdato</label>
     <input type="date" max={osloDateKey(new Date())} value={paperAcceptDate} onChange={e=>setPaperAcceptDate(e.target.value)}/>
    </div>
    <div className="quoteModalActions">
     <button type="button" className="btn alt" disabled={paperBusy} onClick={()=>setShowPaperAccept(false)}>Avbryt</button>
     <button type="button" className="btn quoteSendButton" disabled={paperBusy} onClick={confirmPaperAcceptance}>{paperBusy?"Registrerer …":"Registrer godkjenning"}</button>
    </div>
   </div>
  </div>}

  {showAlternateEmail&&<div className="quoteModalBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!sending)setShowAlternateEmail(false)}}>
   <div className="quoteModal" role="dialog" aria-modal="true" aria-labelledby="quoteAlternateEmailTitle">
    <div>
     <div className="kicker">SEND KOPI</div>
     <h2 id="quoteAlternateEmailTitle">Send tilbudet til en annen e-post</h2>
     <p className="muted">Kundens lagrede e-postadresse blir ikke endret.</p>
    </div>
    <div className="field">
     <label>E-postadresse</label>
     <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" value={alternateEmail} onChange={e=>setAlternateEmail(e.target.value)} placeholder="navn@epost.no" autoFocus/>
    </div>
    <div className="quoteModalActions">
     <button type="button" className="btn alt" disabled={sending} onClick={()=>setShowAlternateEmail(false)}>Avbryt</button>
     <button type="button" className="btn quoteSendButton" disabled={sending} onClick={confirmAlternateEmailSend}>{sending?"Sender …":"Lagre og send"}</button>
    </div>
   </div>
  </div>}
 </main>;
}
