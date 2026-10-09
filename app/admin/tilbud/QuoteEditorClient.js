"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {osloDateKey,shiftDateKey} from "../../../lib/osloTime";

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
 const [catalogSearch,setCatalogSearch]=useState({});

 const calc=useMemo(()=>calculate(v.lineItems),[v.lineItems]);
 const costOverview=useMemo(()=>{
  const costLines=v.lineItems.filter(line=>line.purchaseUnitPriceOre!==""&&line.purchaseUnitPriceOre!==null&&line.purchaseUnitPriceOre!==undefined&&Number.isFinite(Number(line.purchaseUnitPriceOre))&&Number(line.purchaseUnitPriceOre)>=0);
  const purchaseCost=costLines.reduce((sum,line)=>sum+Math.round((Number(line.quantity)||0)*(Number(line.purchaseUnitPriceOre)||0)),0);
  const profit=calc.subtotal-purchaseCost;
  const margin=calc.subtotal>0?profit/calc.subtotal*100:0;
  const missingMaterialCosts=v.lineItems.filter(line=>line.type==="material"&&(line.purchaseUnitPriceOre===""||line.purchaseUnitPriceOre===null||line.purchaseUnitPriceOre===undefined)).length;
  return {purchaseCost,profit,margin,missingMaterialCosts};
 },[v.lineItems,calc]);
 const planSum=useMemo(()=>v.paymentPlan.reduce((sum,row)=>sum+(Number(row.percent)||0),0),[v.paymentPlan]);
 const isDirty=useMemo(()=>Boolean(savedSnapshot)&&JSON.stringify(v)!==savedSnapshot,[v,savedSnapshot]);
 const locked=quoteId&&v.status!=="draft";

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
   const importedLines=(Array.isArray(draft?.lineItems)?draft.lineItems:[]).slice(0,80).map(line=>({
    id:lineId(),
    type:["work","material","other"].includes(line?.type)?line.type:"other",
    description:String(line?.description||"").trim().slice(0,500),
    quantity:Math.max(0.01,Number(line?.quantity)||1),
    unit:String(line?.unit||"stk").trim().slice(0,20),
    unitPriceOre:Number.isFinite(Number(line?.unitPriceOre))&&Number(line.unitPriceOre)>=0?Math.round(Number(line.unitPriceOre)):"",
    vatRate:Number(line?.vatRate)===0?0:25
   })).filter(line=>line.description);
   setV(current=>({
    ...current,
    title:String(draft?.title||current.title||"").slice(0,180),
    customer:{
     ...current.customer,
     name:String(draft?.customer?.name||current.customer.name||"").slice(0,120),
     address:String(draft?.customer?.address||current.customer.address||"").slice(0,300)
    },
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
     introText:quote.introText||"",
     lineItems:Array.isArray(quote.lineItems)&&quote.lineItems.length?quote.lineItems:[{id:lineId(),type:"work",description:"",quantity:1,unit:"time",unitPriceOre:"",vatRate:25}],
     paymentPlan:Array.isArray(quote.paymentPlan)&&quote.paymentPlan.length?quote.paymentPlan:defaultPlan,
     notes:quote.notes||"",
     terms:quote.terms||defaultTerms,
     validUntil:quote.validUntil||"",
     plannedStartDate:quote.plannedStartDate||"",
     autoFollowUp:quote.autoFollowUp!==false
    };
    setV(loadedState);
    setSavedSnapshot(JSON.stringify(loadedState));
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
 async function searchMaterialCatalog(line){
  const id=line.id;
  const query=String(line.description||"").trim();
  if(!query){setCatalogSearch(current=>({...current,[id]:{error:"Skriv en beskrivelse først.",products:[]}}));return;}
  setCatalogSearch(current=>({...current,[id]:{loading:true,products:[],error:""}}));
  try{
   const response=await fetch("/api/admin/material-catalog?q="+encodeURIComponent(query)+"&limit=12");
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Materialkatalogen kunne ikke søkes.");
   setCatalogSearch(current=>({...current,[id]:{loading:false,products:Array.isArray(data.products)?data.products:[],error:""}}));
  }catch(err){
   setCatalogSearch(current=>({...current,[id]:{loading:false,products:[],error:err.message||"Søket feilet."}}));
  }
 }
 function selectCatalogProduct(line,product){
  const oldCatalogCost=Number(line.purchaseCatalogCostOre);
  const newCost=Math.round(Number(product.costExVat||0)*100);
  const hasOld=Number.isFinite(oldCatalogCost)&&oldCatalogCost>=0;
  const changed=hasOld&&oldCatalogCost!==newCost;
  updateLine(line.id,"description",product.name||line.description);
  updateLine(line.id,"unit",product.unit||line.unit||"stk");
  updateLine(line.id,"purchaseUnitPriceOre",newCost);
  updateLine(line.id,"purchaseSupplierId",String(product.supplierId||"").slice(0,100));
  updateLine(line.id,"purchaseSupplierName",String(product.supplierName||"").slice(0,180));
  updateLine(line.id,"purchaseSku",String(product.sku||"").slice(0,120));
  updateLine(line.id,"purchaseProductName",String(product.name||"").slice(0,500));
  updateLine(line.id,"purchaseCatalogCostOre",newCost);
  updateLine(line.id,"purchasePriceCheckedAt",new Date().toISOString());
  setCatalogSearch(current=>({...current,[line.id]:{loading:false,products:[],error:"",message:changed?"Katalogprisen er endret fra sist registrerte katalogpris. Kontroller at innkjøpsprisen stemmer.":"Katalogvare valgt. Salgsprisen er ikke endret."}}));
 }
 async function searchMaterialCatalog(line){
  const id=line.id, query=String(line.description||"").trim();
  if(!query){setCatalogSearch(current=>({...current,[id]:{error:"Skriv en beskrivelse først.",products:[]}}));return;}
  setCatalogSearch(current=>({...current,[id]:{loading:true,products:[],error:""}}));
  try{
   const response=await fetch("/api/admin/material-catalog?q="+encodeURIComponent(query)+"&limit=12");
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Materialkatalogen kunne ikke søkes.");
   setCatalogSearch(current=>({...current,[id]:{loading:false,products:Array.isArray(data.products)?data.products:[],error:""}}));
  }catch(err){setCatalogSearch(current=>({...current,[id]:{loading:false,products:[],error:err.message||"Søket feilet."}}));}
 }
 function selectCatalogProduct(line,product){
  const oldCost=Number(line.purchaseCatalogCostOre), newCost=Math.round(Number(product.costExVat||0)*100);
  const hasOld=line.purchaseCatalogCostOre!==null&&line.purchaseCatalogCostOre!==undefined&&line.purchaseCatalogCostOre!==""&&Number.isFinite(oldCost)&&oldCost>=0, changed=hasOld&&oldCost!==newCost;
  updateLine(line.id,"description",product.name||line.description);
  updateLine(line.id,"unit",product.unit||line.unit||"stk");
  updateLine(line.id,"purchaseUnitPriceOre",newCost);
  updateLine(line.id,"purchaseSupplierId",String(product.supplierId||"").slice(0,100));
  updateLine(line.id,"purchaseSupplierName",String(product.supplierName||"").slice(0,180));
  updateLine(line.id,"purchaseSku",String(product.sku||"").slice(0,120));
  updateLine(line.id,"purchaseProductName",String(product.name||"").slice(0,500));
  updateLine(line.id,"purchaseCatalogCostOre",newCost);
  updateLine(line.id,"purchasePriceCheckedAt",new Date().toISOString());
  setCatalogSearch(current=>({...current,[line.id]:{loading:false,products:[],error:"",message:changed?"Katalogprisen er endret fra sist registrerte katalogpris. Kontroller innkjøpsprisen.":"Katalogvare valgt. Salgsprisen er ikke endret."}}));
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
  if(!response.ok){setError(data.error||"Tilbudet kunne ikke lagres.");return null;}
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
  setSavedMessage("Tilbudet er sendt til "+(data.sentTo||recipient)+".");
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
     {quoteId&&<button type="button" className="btn alt" disabled={saving||sending} onClick={openPaperCopy}>Papirutgave / skriv ut</button>}
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
        <div className="field quoteLinePrice"><label>Salgspris eks. MVA</label><input type="number" min="0" step="0.01" value={line.unitPriceOre===""?"":Number(line.unitPriceOre)/100} onChange={e=>updateLine(line.id,"unitPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="0"/></div>
        <div className="field quoteLinePrice quoteLinePurchasePrice"><label>Innkjøpspris eks. MVA <small>(kun internt)</small></label><input type="number" min="0" step="0.01" value={line.purchaseUnitPriceOre===""||line.purchaseUnitPriceOre===undefined||line.purchaseUnitPriceOre===null?"":Number(line.purchaseUnitPriceOre)/100} onChange={e=>updateLine(line.id,"purchaseUnitPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))} placeholder="Ikke registrert"/></div>
        <div className="quoteCatalogLookup">
         <button type="button" className="btn alt quoteCatalogSearchButton" disabled={Boolean(catalogSearch[line.id]?.loading)} onClick={()=>searchMaterialCatalog(line)}>{catalogSearch[line.id]?.loading?"Søker …":"Søk i materialkatalog"}</button>
         {catalogSearch[line.id]?.message&&<p className="quoteCatalogMessage">{catalogSearch[line.id].message}</p>}
         {catalogSearch[line.id]?.error&&<p className="quoteCatalogError">{catalogSearch[line.id].error}</p>}
         {catalogSearch[line.id]?.products?.length>0&&<div className="quoteCatalogResults">
          {catalogSearch[line.id].products.map((product,index)=>{
           const sameProduct=(line.purchaseSku&&product.sku&&line.purchaseSku===product.sku)||(line.purchaseSupplierId&&product.supplierId&&line.purchaseSupplierId===product.supplierId&&line.purchaseProductName===product.name);
           const previous=Number(line.purchaseCatalogCostOre), fresh=Math.round(Number(product.costExVat||0)*100);
           const changed=sameProduct&&line.purchaseCatalogCostOre!==null&&line.purchaseCatalogCostOre!==undefined&&line.purchaseCatalogCostOre!==""&&Number.isFinite(previous)&&previous!==fresh;
           return <div className="quoteCatalogResult" key={String(product.supplierId||"supplier")+"-"+String(product.sku||product.name||index)}>
            <div><b>{product.name}</b><small>{product.supplierName||"Leverandør"}{product.sku?" · "+product.sku:""}{product.unit?" · "+product.unit:""}</small></div>
            <div className="quoteCatalogResultPrice"><b>{nok(fresh)}</b>{changed&&<small className="quoteCatalogPriceWarning">Ny pris – sist {nok(previous)}</small>}</div>
            <button type="button" className="btn alt" onClick={()=>selectCatalogProduct(line,product)}>{changed?"Oppdater pris":"Velg"}</button>
           </div>;
          })}
         </div>}
         {catalogSearch[line.id]&&!catalogSearch[line.id]?.loading&&!catalogSearch[line.id]?.error&&!catalogSearch[line.id]?.products?.length&&!catalogSearch[line.id]?.message&&<small>Ingen treff. Prøv et kortere søk eller produktnavn.</small>}
        </div>
        <div className="quoteCatalogLookup">
         <button type="button" className="btn alt quoteCatalogSearchButton" disabled={Boolean(catalogSearch[line.id]?.loading)} onClick={()=>searchMaterialCatalog(line)}>{catalogSearch[line.id]?.loading?"Søker …":"Søk i materialkatalog"}</button>
         {catalogSearch[line.id]?.message&&<p className="quoteCatalogMessage">{catalogSearch[line.id].message}</p>}
         {catalogSearch[line.id]?.error&&<p className="quoteCatalogError">{catalogSearch[line.id].error}</p>}
         {catalogSearch[line.id]?.products?.length>0&&<div className="quoteCatalogResults">
          {catalogSearch[line.id].products.map((product,index)=>{
           const sameProduct=(line.purchaseSku&&product.sku&&line.purchaseSku===product.sku)||(line.purchaseSupplierId&&product.supplierId&&line.purchaseSupplierId===product.supplierId&&line.purchaseProductName===product.name);
           const previous=Number(line.purchaseCatalogCostOre);
           const fresh=Math.round(Number(product.costExVat||0)*100);
           const changed=sameProduct&&Number.isFinite(previous)&&previous!==fresh;
           return <div className="quoteCatalogResult" key={String(product.supplierId||"supplier")+"-"+String(product.sku||product.name||index)}>
            <div><b>{product.name}</b><small>{product.supplierName||"Leverandør"}{product.sku?" · "+product.sku:""}{product.unit?" · "+product.unit:""}</small></div>
            <div className="quoteCatalogResultPrice"><b>{nok(fresh)}</b>{changed&&<small className="quoteCatalogPriceWarning">Ny katalogpris – sist {nok(previous)}</small>}</div>
            <button type="button" className="btn alt" onClick={()=>selectCatalogProduct(line,product)}>{changed?"Oppdater pris":"Velg"}</button>
           </div>;
          })}
         </div>}
         {catalogSearch[line.id]&&!catalogSearch[line.id]?.loading&&!catalogSearch[line.id]?.error&&!catalogSearch[line.id]?.products?.length&&!catalogSearch[line.id]?.message&&<small>Ingen treff. Prøv et kortere søk eller produktnavn.</small>}
        </div>
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
    </fieldset>

    <aside className="quoteSummaryCard card">
     <div className="kicker">OPPSUMMERING</div>
     <h3>{v.title||"Nytt tilbud"}</h3>
     <div className="quoteSummaryRows">
      <span><small>Sum eks. MVA</small><b>{nok(calc.subtotal)}</b></span>
      <span><small>MVA</small><b>{nok(calc.vat)}</b></span>
      <span className="quoteSummaryTotal"><small>Total inkl. MVA</small><b>{nok(calc.total)}</b></span>
     </div>
     <div className="quoteProfitOverview">
      <div className="kicker">INTERN FORTJENESTE</div>
      <span><small>Registrert innkjøpskostnad</small><b>{nok(costOverview.purchaseCost)}</b></span>
      <span><small>Beregnet fortjeneste før øvrige kostnader</small><b>{nok(costOverview.profit)}</b></span>
      <span><small>Fortjeneste av salgspris</small><b>{calc.subtotal>0?costOverview.margin.toLocaleString("nb-NO",{maximumFractionDigits:1,minimumFractionDigits:1})+" %":"—"}</b></span>
      {costOverview.missingMaterialCosts>0&&<p className="muted">Registrer innkjøpspris på {costOverview.missingMaterialCosts} materiallinje(r) for mer komplett oversikt. Linjer uten innkjøpspris regnes foreløpig som 0 kr i oversikten.</p>}
      <small className="muted">Dette vises bare i backoffice og tas ikke med i kundens tilbud eller PDF.</small>
     </div>
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
     {quoteId&&<button type="button" className="btn alt" disabled={saving||sending} onClick={openPaperCopy}>Papirutgave / skriv ut</button>}
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
