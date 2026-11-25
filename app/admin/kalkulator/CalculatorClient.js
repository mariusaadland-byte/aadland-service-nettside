"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./calculator.module.css";
import QuoteTransferPanel from "./QuoteTransferPanel";
import {unitSaleExVat,CALCULATOR_TOLL_PRESETS,calculatorTollEstimate} from "../../../lib/calculatorQuoteLines";
import {supplierPriceNotice} from "../../../lib/materialPriceFreshness";

const STORAGE_KEY="aadland-service-calculator-v1";
const VAT_RATE=0.25;
const MAX_PRICE_FILE_BYTES=4*1024*1024;
function priceFileError(file,supplier){
 if(!file)return "";
 if(file.size===0)return "Prisfilen er tom.";
 if(file.size>MAX_PRICE_FILE_BYTES)return "Filen er for stor ("+(file.size/1000000).toFixed(2).replace(".",",")+" MB). Maks 4 MiB. "+(supplier==="byggmakker"?"Velg den klargjorte Byggmakker-filen med endelsen .csv.gz i stedet for originalfilen.":"Bruk en komprimert CSV-fil (.csv.gz). Ikke del en fullstendig prisliste i flere separate importer.");
 if(supplier==="byggmakker"&&/^\d+-pricefile-\d+\.xlsx$/i.test(file.name))return "Denne originale Byggmakker-filen mangler kolonneoverskrifter. Bruk den klargjorte .csv.gz-filen der kolonne G er valgt som innkjøpspris eks. MVA.";
 return "";
}
const DEFAULTS={
 project:"",
 hours:"8",
 hourlyRate:"500",
 fixedLabor:"",
 materialCost:"",
 materialMarkup:"15",
 materialMarkupSource:"company",
 materialItems:[],
 distanceOneWay:"",
 oneWayTrips:"2",
 kmRate:"5.30",
 tollPreset:"none",
 customToll:"",
 tollSelectionExplicit:false,
 businessExVat:false
};

function number(value){
 const normalized=String(value??"").trim().replace(/\s/g,"").replace(",",".");
 const parsed=Number(normalized);
 return Number.isFinite(parsed)?Math.max(0,parsed):0;
}
function money(value){
 return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format(value||0);
}
function decimal(value,digits=2){
 return new Intl.NumberFormat("nb-NO",{minimumFractionDigits:0,maximumFractionDigits:digits}).format(value||0);
}
function withoutVat(value){
 return value/(1+VAT_RATE);
}
function Field({label,help,children}){
 return <label className={styles.field}><span>{label}</span>{children}{help&&<small>{help}</small>}</label>;
}

export default function CalculatorClient(){
 const [form,setForm]=useState(DEFAULTS);
 const [hydrated,setHydrated]=useState(false);
 const [companyMarkup,setCompanyMarkup]=useState("15");
 const [markupLoadError,setMarkupLoadError]=useState("");
 const [copied,setCopied]=useState(false);
 const [addedNotice,setAddedNotice]=useState("");
 const [legacyTollCleared,setLegacyTollCleared]=useState(false);
 const [catalogSuppliers,setCatalogSuppliers]=useState([]);
 const [catalogSupplier,setCatalogSupplier]=useState("byggern");
 const [materialQuery,setMaterialQuery]=useState("");
 const [materialResults,setMaterialResults]=useState([]);
 const [catalogBusy,setCatalogBusy]=useState(false);
 const [catalogError,setCatalogError]=useState("");
 const [importOpen,setImportOpen]=useState(false);
 const [importSupplier,setImportSupplier]=useState("");
 const [importSuppliers,setImportSuppliers]=useState([]);
 const [importSuppliersLoading,setImportSuppliersLoading]=useState(false);
 const [importSuppliersLoaded,setImportSuppliersLoaded]=useState(false);
 const [importError,setImportError]=useState("");
 const [newSupplierName,setNewSupplierName]=useState("");
 const [importPriceIncludesVat,setImportPriceIncludesVat]=useState(false);
 const [importFile,setImportFile]=useState(null);
 const [importBusy,setImportBusy]=useState(false);
 const [importMessage,setImportMessage]=useState("");
 const [importPreview,setImportPreview]=useState(null);
 const [importPhrase,setImportPhrase]=useState("");
 const [activationAttempted,setActivationAttempted]=useState(false);

 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
   if(saved&&typeof saved==="object"){
    // The old calculator preselected a route even with no distance.
    // Clear only that untouched default; keep intentional selections and
    // older calculations that have a filled-in distance.
    const staleAutoToll=saved.tollPreset==="bergen-bjornafjorden-ordinary"&&
     !String(saved.distanceOneWay??"").trim()&&
     String(saved.customToll??"76.80").trim()==="76.80"&&
     saved.tollSelectionExplicit!==true;
    setForm({
     ...DEFAULTS,...saved,
     tollPreset:staleAutoToll?"none":saved.tollPreset??DEFAULTS.tollPreset,
     tollSelectionExplicit:saved.tollSelectionExplicit===true,
     // Old saved numbers might be intentional: never change 15 -> 20 (or 20 -> 15).
     // Only new, company-linked calculations follow future company updates.
     materialMarkup:String(saved.materialMarkup??DEFAULTS.materialMarkup),
     materialMarkupSource:saved.materialMarkupSource==="company"?"company":"manual"
    });
    if(staleAutoToll)setLegacyTollCleared(true);
   }
  }catch{}
  setHydrated(true);
 },[]);

 useEffect(()=>{
  if(!hydrated)return;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(form));}catch{}
 },[form,hydrated]);

 useEffect(()=>{
  let active=true;
  fetch("/api/admin/quote-preferences",{cache:"no-store"}).then(async response=>{
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kunne ikke hente bedriftens standardpåslag.");
   const value=Number(data.defaultMaterialMarkup);
   if(!Number.isFinite(value)||value<0||value>1000)throw Error("Ugyldig standardpåslag.");
   return String(value);
  }).then(value=>{
   if(!active)return;
   setCompanyMarkup(value);
   setForm(current=>current.materialMarkupSource==="company"?{...current,materialMarkup:value}:current);
  }).catch(error=>{if(active)setMarkupLoadError(error.message||"Kunne ikke hente bedriftens standardpåslag.");});
  return()=>{active=false};
 },[]);

 useEffect(()=>{loadSuppliers();const requested=new URLSearchParams(window.location.search).get("import");if(requested){setImportSupplier(requested);setImportOpen(true);}},[]);
 useEffect(()=>{if(importOpen)loadImportSuppliers();},[importOpen]);
 async function loadImportSuppliers(){
  setImportSuppliersLoading(true);setImportSuppliersLoaded(false);setImportError("");
  try{
   const response=await fetch("/api/admin/material-catalog/import",{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!Array.isArray(data.suppliers))throw Error(data.error||"Kunne ikke hente leverandører for import.");
   setImportSuppliers(data.suppliers);setImportSuppliersLoaded(true);
   setImportSupplier(current=>current==="new"||data.suppliers.some(item=>item.id===current)?current:"");
  }catch(error){setImportError(error.message||"Kunne ikke hente importleverandører.");}
  finally{setImportSuppliersLoading(false);}
 }
 function chooseImportSupplier(id){
  if(importBusy)return;
  setImportSupplier(id);setImportPreview(null);setImportPhrase("");setImportError("");setImportMessage("");
 }

 useEffect(()=>{
  const query=materialQuery.trim();
  if(query.length<2){setMaterialResults([]);setCatalogError("");setCatalogBusy(false);return}
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setCatalogBusy(true);setCatalogError("");
   try{
    const params=new URLSearchParams({q:query,limit:"20"});
    if(catalogSupplier)params.set("supplier",catalogSupplier);
    const response=await fetch("/api/admin/material-catalog?"+params.toString(),{signal:controller.signal,cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Kunne ikke søke i materialkatalogen.");
    setMaterialResults(Array.isArray(data.products)?data.products:[]);
    if(Array.isArray(data.suppliers)&&data.suppliers.length)setCatalogSuppliers(data.suppliers);
   }catch(error){
    if(error?.name!=="AbortError")setCatalogError(error?.message||"Kunne ikke søke i materialkatalogen.");
   }finally{
    if(!controller.signal.aborted)setCatalogBusy(false);
   }
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[materialQuery,catalogSupplier]);

 async function loadSuppliers(preferred){
  try{
   const response=await fetch("/api/admin/material-catalog",{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Kunne ikke hente leverandører.");
   const suppliers=Array.isArray(data.suppliers)?data.suppliers:[];
   setCatalogSuppliers(suppliers);
   const primary=suppliers.find(item=>item.isPrimary)?.id||suppliers[0]?.id||"byggern";
   const next=preferred||catalogSupplier||primary;
   if(!suppliers.some(item=>item.id===next))setCatalogSupplier(primary);

  }catch(error){
   setCatalogError(error?.message||"Kunne ikke hente leverandører.");
  }
 }

 function set(name,value){
  setForm(current=>({...current,[name]:value,...(name==="materialMarkup"?{materialMarkupSource:"manual"}:{})}));
 }
 function reset(){
  setForm({...DEFAULTS,materialMarkup:companyMarkup});
  setCopied(false);
  setLegacyTollCleared(false);
 }

 function addMaterial(product){
  if(!product?.supplierId||!product?.sku)return;
  const key=product.supplierId+"::"+product.sku;
  setForm(current=>{
   const items=Array.isArray(current.materialItems)?current.materialItems:[];
   const existing=items.find(item=>item.key===key);
   if(items.length>=110&&!existing)return current;
   const next=existing
    ?items.map(item=>item.key===key?{...item,qty:String(number(item.qty)+1)}:item)
    :[...items,{
      key,supplierId:product.supplierId,supplierName:product.supplierName||product.supplierId,
      sku:product.sku,name:product.name||"",unit:product.unit||"STK",
      costExVat:number(product.costExVat),qty:"1",saleExVat:product.saleExVat==null?"":String(product.saleExVat),
      priceReviewRequired:product.priceReviewRequired===true,sourcePriceImportedAt:product.lastImportAt||null
     }];
   return {...current,materialItems:next};
  });
  setMaterialQuery("");setMaterialResults([]);
  setAddedNotice(product.priceReviewRequired?"Vare lagt til. OBS: importprisen er eldre enn 30 dager. Bekreft innkjøpsprisen før tilbud.":"Vare lagt til. Endre antall på linjen under, eller søk etter neste vare.");
  document.getElementById("calculator-product-search")?.focus();
 }
 function addCustomMaterial(){
  setForm(current=>{
   const items=Array.isArray(current.materialItems)?current.materialItems:[];
   if(items.length>=110)return current;
   const key="custom::"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
   return {...current,materialItems:[...items,{key,supplierId:"",supplierName:"Manuell vare",sku:"",name:"",unit:"stk",costExVat:"",qty:"1",saleExVat:""}]};
  });
  setAddedNotice("Fyll inn beskrivelse og pris på den nye linjen.");
 }
 function updateMaterial(key,field,value){
  setForm(current=>({...current,materialItems:(Array.isArray(current.materialItems)?current.materialItems:[]).map(item=>item.key===key?{...item,[field]:value}:item)}));
 }

 function removeMaterial(key){
  setForm(current=>({...current,materialItems:(Array.isArray(current.materialItems)?current.materialItems:[]).filter(item=>item.key!==key)}));
 }

 async function completeImport(data){
   setImportError("");setImportMessage((data.imported||0)+" varer aktivert for "+(data.supplierName||importPreview.supplierName||"leverandøren")+(data.alreadyApplied?" (bekreftet fra importhistorikken).":"."));
   setImportPreview(null);setImportPhrase("");setImportFile(null);setNewSupplierName("");setActivationAttempted(false);
   const input=document.getElementById("material-price-file");if(input)input.value="";
   const supplierId=data.supplierId||importPreview.supplierId||"";
   if(supplierId){setCatalogSupplier(supplierId);setImportSupplier(supplierId);}
   await loadSuppliers(supplierId);
   if(materialQuery.trim().length>=2)setMaterialQuery(q=>q+" ");
 }
 async function checkImportStatus(){
  if(!importPreview||importBusy)return;
  setImportBusy(true);setImportError("");
  try{
   const r=await fetch("/api/admin/material-catalog/import/status?previewId="+encodeURIComponent(importPreview.previewId),{cache:"no-store"});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.ok)throw Error(data.error||"Kunne ikke lese importstatus.");
   if(data.state==="applied"){await completeImport({...data,alreadyApplied:true});return;}
   setImportMessage(data.state==="expired"?"Ingen aktivering er registrert, og forhåndsvisningen er utløpt. Kontroller katalogen før ny import.":"Ingen fullført aktivering er registrert ennå. Et tidligere forsøk kan fortsatt pågå. Kontroller status igjen før nytt forsøk.");
  }catch(error){setImportError(error.message||"Kunne ikke kontrollere importstatus.");}
  finally{setImportBusy(false);}
 }
 async function approveImport(){
  if(!importPreview||importBusy)return;
  const phrase=importPreview.largeRemoval?"GODKJENN STOR REDUKSJON":"GODKJENN PRISIMPORT";
  if(importPhrase!==phrase)return;
  setImportBusy(true);setImportError("");setActivationAttempted(true);setImportMessage("Kontrollerer aktiveringen …");
  try{
   const body=new FormData();
   body.append("action","activate");
   body.append("previewId",importPreview.previewId);
   body.append("phrase",importPhrase);
   const r=await fetch("/api/admin/material-catalog/import",{method:"POST",body});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data.error||"Kunne ikke bekrefte importen. Bruk samme godkjenning ved nytt forsøk.");
   await completeImport(data);
  }catch(error){setImportError(error.message||"Kunne ikke bekrefte import.");setImportMessage("Aktiveringsstatus er ikke bekreftet. Kontroller status før du forsøker igjen.");}
  finally{setImportBusy(false);}
 }
 async function importPriceList(event){
  event?.preventDefault?.();
  if(activationAttempted&&!window.confirm("Forrige aktiveringsstatus er ikke bekreftet. Vil du likevel lage en ny forhåndsvisning av dagens katalog?"))return;
  setActivationAttempted(false);setImportMessage("");setImportError("");setImportPreview(null);setImportPhrase("");
  if(!importSuppliersLoaded||!importSupplier||(importSupplier!=="new"&&!importSuppliers.some(item=>item.id===importSupplier))){setImportError("Velg leverandør først.");return}
  if(!importFile){setImportError("Velg en prisfil først.");return}
  const validationError=priceFileError(importFile,importSupplier);if(validationError){setImportError(validationError);return}
  if(importSupplier==="new"&&!newSupplierName.trim()){setImportError("Skriv inn leverandørnavn.");return}
  setImportBusy(true);
  try{
   const body=new FormData();
   body.append("file",importFile);
   body.append("supplierId",importSupplier);
   body.append("newSupplierName",newSupplierName.trim());
   body.append("priceIncludesVat",importPriceIncludesVat?"true":"false");
   const response=await fetch("/api/admin/material-catalog/import",{method:"POST",body});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||(response.status===413?"Filen er for stor for opplasting. Bruk en komprimert CSV-fil (.csv.gz).":response.status===504?"Importen brukte for lang tid. Ingen forhåndsvisning ble bekreftet. Prøv igjen.":"Kunne ikke importere prislisten (HTTP "+response.status+")."));
   if(!data.preview?.previewId)throw Error("Forhåndsvisning mangler. Ingen import godkjent.");
   setImportPreview(data.preview);
   setImportMessage("Forhåndsvisning klar. Ingen priser er endret.");
  }catch(error){
   setImportError(error?.message||"Kunne ikke importere prislisten.");
  }finally{
   setImportBusy(false);
  }
 }

 const calc=useMemo(()=>{
  const hours=number(form.hours);
  const hourlyRate=number(form.hourlyRate);
  const fixedLabor=number(form.fixedLabor);
  const labor=fixedLabor>0?fixedLabor:hours*hourlyRate;

  const manualMaterialCost=number(form.materialCost);
  const materialItems=Array.isArray(form.materialItems)?form.materialItems:[];
  const markup=number(form.materialMarkup);
  const catalogMaterialCostExVat=materialItems.reduce((sum,item)=>sum+number(item.qty)*number(item.costExVat),0);
  const catalogMaterialCostIncVat=catalogMaterialCostExVat*(1+VAT_RATE);
  const catalogMaterialSalesExVat=materialItems.reduce((sum,item)=>sum+number(item.qty)*unitSaleExVat(item,markup),0);
  const materialCost=manualMaterialCost+catalogMaterialCostIncVat;
  const materials=(catalogMaterialSalesExVat+manualMaterialCost/(1+VAT_RATE)*(1+markup/100))*(1+VAT_RATE);

  const oneWayDistance=number(form.distanceOneWay);
  const {preset,trips,tollPerWay,toll}=calculatorTollEstimate(form);
  const totalKm=oneWayDistance*trips;
  const travel=totalKm*number(form.kmRate);

  const total=labor+materials+travel+toll;
  const exVat=withoutVat(total);
  const vat=total-exVat;

  return {hours,hourlyRate,fixedLabor,labor,manualMaterialCost,catalogMaterialCostExVat,catalogMaterialCostIncVat,catalogMaterialSalesExVat,materialCost,markup,materials,oneWayDistance,trips,totalKm,travel,tollPerWay,toll,total,exVat,vat,preset};
 },[form]);

 const primaryTotal=form.businessExVat?calc.exVat:calc.total;
 const primaryLabel=form.businessExVat?"Sum eks. mva":"Sum inkl. mva";

 async function copySummary(){
  const lines=[
   form.project?form.project:"Prisberegning",
   "Arbeid: "+money(calc.labor),
   "Materialer innkjøp: "+money(calc.materialCost)+" inkl. mva",
   "Materialer inkl. "+decimal(calc.markup)+" % påslag: "+money(calc.materials),
   "Reise: "+decimal(calc.totalKm)+" km × "+money(number(form.kmRate))+" = "+money(calc.travel),
   "Bom: "+calc.trips+" vei(er) × "+money(calc.tollPerWay)+" = "+money(calc.toll),
   "Sum eks. mva: "+money(calc.exVat),
   "Mva 25 %: "+money(calc.vat),
   "Sum inkl. mva: "+money(calc.total)
  ];
  try{
   await navigator.clipboard.writeText(lines.join("\n"));
   setCopied(true);
   setTimeout(()=>setCopied(false),1800);
  }catch{
   setCopied(false);
  }
 }

 return <main className={styles.page}>
  <div className={styles.shell}>
   <div className={styles.topbar}>
    <div>
     <Link href="/admin" className={styles.back}>← Tilbake til backoffice</Link>
     <span className={styles.eyebrow}>AADLAND SERVICE · INTERNVERKTØY</span>
     <h1>Pris- og fastpriskalkulator</h1>
     <p>Søk varer, legg dem inn som tilbudslinjer og overfør til en valgt kunde. Arbeid, kjøring og bom kan tas med ved behov.</p>
    </div>
    <div className={styles.topActions}>
     <Link href="/admin/prisliste" className={styles.secondary}>Egen prisliste / legg til vare</Link>
     <button type="button" className={styles.secondary} onClick={reset}>Nullstill</button>
     <button type="button" className={styles.secondary} onClick={copySummary}>{copied?"Kopiert ✓":"Kopier sammendrag"}</button>
     <button type="button" className={styles.primary} onClick={()=>window.print()}>Skriv ut</button>
    </div>
   </div>

    <section className={`${styles.card} ${styles.featuredMaterialsCard}`} id="material-search">
     <div className={styles.cardHead}><span className={styles.step}>1</span><div><h2>Materialer</h2><p>Ett søkefelt: velg vare, endre antall og overfør til tilbud.</p></div></div>

     <div className={styles.catalogSearchBlock}>
       <Field label="Søk vare med navn, varenummer eller EAN">
        <input id="calculator-product-search" type="search" value={materialQuery} onChange={e=>{setMaterialQuery(e.target.value);setAddedNotice("")}} placeholder="Søk for eksempel terrassebord, gips eller 49604414 …" autoComplete="off"/>
       </Field>
       <details className={styles.catalogFilter}><summary>Leverandør: {catalogSuppliers.find(item=>item.id===catalogSupplier)?.name||"Alle leverandører"} · Endre</summary>
        <Field label="Søk hos"><select value={catalogSupplier} onChange={e=>setCatalogSupplier(e.target.value)}>
         <option value="">Alle leverandører</option>{catalogSuppliers.filter(item=>item.id!=="egne-varer").map(item=><option key={item.id} value={item.id}>{item.name}{item.isPrimary?" · primær":""}</option>)}
        </select></Field>
       </details>
      </div>
      {catalogSupplier&&catalogSuppliers.find(row=>row.id===catalogSupplier)&&<p className={styles.catalogFreshness} role="status">{supplierPriceNotice(catalogSuppliers.find(row=>row.id===catalogSupplier))}</p>}
       {catalogError&&<div className={styles.catalogError}>{catalogError}</div>}
      {materialQuery.trim().length>=2&&<div className={styles.searchResults}>
       {catalogBusy&&<div className={styles.catalogEmpty}>Søker …</div>}
       {!catalogBusy&&!catalogError&&materialResults.length===0&&<div className={styles.catalogEmpty}>Ingen treff. Prøv et annet varenummer eller kortere navn.</div>}
       {!catalogBusy&&materialResults.map(product=><button type="button" key={product.supplierId+"::"+product.sku} className={styles.productResult} onClick={()=>addMaterial(product)}>
        <span><b>{product.name}</b><small>{product.supplierName} · varenr. {product.sku}{product.priceReviewRequired?" · Eldre importpris – kontroller":""}</small></span>
        <span><strong>{money(product.costExVat)}</strong><small>innkjøp eks. mva / {product.unit||"stk"}</small></span><em>+ Legg til</em>
       </button>)}
      </div>}
      {addedNotice&&<p className={styles.addedNotice} role="status">{addedNotice}</p>}
      <div className={styles.quoteGoodsHead}>
       <div><strong>Varelinjer til tilbudet</strong><small>{(form.materialItems||[]).length} linje(r) · søk eller skriv inn selv</small></div>
       <button type="button" onClick={addCustomMaterial}>＋ Manuell vare</button>
      </div>
      {(form.materialItems||[]).length===0?<div className={styles.catalogEmpty}>Søk etter en vare og trykk «+ Legg til». Da kommer den hit med redigerbart antall og pris.</div>:(
       <div className={styles.quoteGoodsLines}>
        {(form.materialItems||[]).map((item,index)=>{
         const sale=unitSaleExVat(item,form.materialMarkup),qty=number(item.qty);
         return <div key={item.key} className={styles.quoteGoodsLine}>
          <span className={styles.quoteGoodsNumber}>{index+1}</span>
          <label className={styles.quoteGoodsDescription}><span>Vare / beskrivelse</span><input value={item.name||""} onChange={e=>updateMaterial(item.key,"name",e.target.value)} placeholder="Hva skal leveres?"/><small>{item.sku?"Varenr. "+item.sku+" · ":""}{item.supplierName||"Manuell vare"}{item.priceReviewRequired?" · Eldre importpris – kontroller":""}</small></label>
          <label><span>Antall</span><input type="number" min="0" step="any" inputMode="decimal" value={item.qty} onChange={e=>updateMaterial(item.key,"qty",e.target.value)}/></label>
          <label><span>Enhet</span><input value={item.unit||""} onChange={e=>updateMaterial(item.key,"unit",e.target.value)} placeholder="stk / lm"/></label>
          <label><span>Innkjøp eks. mva.</span><input type="number" min="0" step="any" inputMode="decimal" value={item.costExVat??""} onChange={e=>updateMaterial(item.key,"costExVat",e.target.value)}/></label>
          <label><span>Salgspris eks. mva.</span><input type="number" min="0" step="any" inputMode="decimal" value={item.saleExVat??""} placeholder={"Auto "+decimal(number(item.costExVat)*(1+number(form.materialMarkup)/100))} onChange={e=>updateMaterial(item.key,"saleExVat",e.target.value)}/><small>{item.saleExVat===""||item.saleExVat==null?"Automatisk med påslag":"Overstyrt"}</small></label>
          <div className={styles.quoteGoodsTotal}><small>Sum eks. mva.</small><strong>{money(qty*sale)}</strong></div>
          <button type="button" className={styles.quoteGoodsRemove} onClick={()=>removeMaterial(item.key)} aria-label={"Fjern "+(item.name||"varelinje")}>×</button>
         </div>})}
       </div>
      )}
      <div className={styles.materialTotals}><span>Innkjøp eks. mva. <b>{money(calc.catalogMaterialCostExVat)}</b></span><span>Tilbudspris eks. mva. <b>{money(calc.catalogMaterialSalesExVat)}</b></span><span>Tilbudspris inkl. mva. <b>{money(calc.catalogMaterialSalesExVat*1.25)}</b></span></div>
      <Field label="Materialpåslag for denne kalkylen" help="Automatisk på varer uten overstyrt salgspris. Påslaget endrer aldri lagrede tilbud."><div className={styles.suffixInput}><input inputMode="decimal" value={form.materialMarkup} onChange={e=>set("materialMarkup",e.target.value)}/><span>%</span></div></Field>
      <p className={styles.rateNote}>
       <span>Bedriftens standardpåslag: {companyMarkup} %. {form.materialMarkupSource==="manual"?"Denne kalkylen har et lokalt valgt påslag.":"Denne kalkylen følger bedriftens sats."}</span>
       <button type="button" className={styles.secondary} onClick={()=>setForm(current=>({...current,materialMarkup:companyMarkup,materialMarkupSource:"company"}))}>
        Bruk bedriftens standard
       </button>
      </p>
      {markupLoadError&&<p className={styles.catalogError} role="status">{markupLoadError} Standard 15 % vises som reserve til innstillingen kan hentes.</p>}
      <QuoteTransferPanel form={form}/>
      <details className={styles.legacyMaterialCost}><summary>Andre materialkostnader (valgfritt)</summary>
       <Field label="Beløp inkl. mva."><div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.materialCost} onChange={e=>set("materialCost",e.target.value)} placeholder="0"/></div></Field>
       <p>Bruk gjerne «Manuell vare» ovenfor i stedet. Andre materialkostnader tas med i tilbudet dersom du huker av for øvrige kostnader.</p>
      </details>
      <div className={styles.importPanel}>
      <button type="button" className={styles.importToggle} onClick={()=>{setImportOpen(value=>!value);setImportError("");setImportMessage("")}}>
       <span><b>Leverandørprislister</b><small>Importer eller oppdater Bygger’n og andre leverandører</small></span>
       <strong>{importOpen?"Lukk":"Åpne"} →</strong>
      </button>
      {importOpen&&<form className={styles.importForm} onSubmit={importPriceList}>
       <div className={styles.importGrid}>
        <div className={styles.importSupplierField}>
         <strong>Velg leverandør for prisimport</strong>
         {importSuppliersLoading&&<p role="status">Henter leverandører …</p>}
         <div className={styles.importSupplierChoices} role="group" aria-label="Leverandør for prisimport">
          {importSuppliers.map(item=><button type="button" key={item.id} disabled={importBusy||!importSuppliersLoaded} aria-pressed={importSupplier===item.id} onClick={()=>chooseImportSupplier(item.id)}><b>{item.name}</b><small>{item.lastImportAt?"Oppdater prisliste":"Klar for første import"}</small></button>)}
          <button type="button" disabled={importBusy||!importSuppliersLoaded} aria-pressed={importSupplier==="new"} onClick={()=>chooseImportSupplier("new")}><b>+ Ny leverandør</b></button>
         </div>
         {!importSuppliersLoaded&&!importSuppliersLoading&&<button type="button" onClick={loadImportSuppliers}>Hent leverandører på nytt</button>}
         {importSupplier&&<p role="status">Valgt: {importSupplier==="new"?"Ny leverandør":importSuppliers.find(item=>item.id===importSupplier)?.name||"Henter …"}</p>}
        </div>
        {importSupplier==="new"&&<Field label="Ny leverandør">
         <input value={newSupplierName} disabled={importBusy} onChange={e=>{setNewSupplierName(e.target.value);setImportPreview(null);setImportPhrase("");}} placeholder="F.eks. Montér"/>
        </Field>}
       </div>
       {importError&&<p className={styles.catalogError} role="alert">{importError}</p>}
       {importSupplier==="byggmakker"&&<p className={styles.importFileHint}>Byggmakker: Bruk den klargjorte .csv.gz-filen med innkjøpspris fra kolonne G, eks. MVA. Originalfiler uten overskrifter må klargjøres først.</p>}
       <Field label="Prisfil" help="XLSX, CSV, CSV.GZ, TSV eller TXT. Maks 4 MiB. Nye filer oppdaterer samme varenummer og varer som forsvinner fra filen deaktiveres.">
        <input id="material-price-file" type="file" accept=".xlsx,.csv,.csv.gz,.gz,.tsv,.txt,application/gzip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" disabled={importBusy} onChange={e=>{const file=e.target.files?.[0]||null;setImportFile(file);setImportPreview(null);setImportPhrase("");setImportError(priceFileError(file,importSupplier));}}/>
       </Field>
       <label className={styles.importCheck}><input type="checkbox" checked={importPriceIncludesVat} disabled={importBusy} onChange={e=>{setImportPriceIncludesVat(e.target.checked);setImportPreview(null);setImportPhrase("");}}/><span><b>Prisene i filen er inkl. mva</b><small>La denne være av for Bygger’n og den klargjorte Byggmakker-filen – begge er eks. mva.</small></span></label>
       <div className={styles.importActions}><button type="submit" className={styles.primary} disabled={importBusy||!importSuppliersLoaded||!importSupplier||!importFile||Boolean(priceFileError(importFile,importSupplier))}>{importBusy?"Behandler…":"Forhåndsvis prisliste"}</button>{importMessage&&<span>{importMessage}</span>}</div>
       {importPreview&&<div className={styles.importPreview}>
        <h3>Kontroller prisimport – {importPreview.supplierName}</h3>
        <p>{activationAttempted?"Aktivering er forsøkt. Kontroller status før nytt forsøk.":"Ingen priser er endret. Forhåndsvisningen er gyldig i 30 minutter."}</p>
        <div className={styles.importGrid}>
         {[[ "Eksisterende aktive varer",importPreview.previous],["Varer i ny fil",importPreview.incoming],["Nye / reaktiverte",importPreview.newOrReactivated],["Endrede varer",importPreview.changed],["Prisøkninger",importPreview.priceUp],["Prisreduksjoner",importPreview.priceDown],["Varer som deaktiveres",importPreview.removed],["Ugyldige rader hoppet over",importPreview.skipped]].map(([label,value])=><div key={label}><small>{label}</small><br/><b>{value}</b></div>)}
        </div>
        {importPreview.largeRemoval&&<p role="alert" className="notice">Minst 20 % av dagens aktive varer vil bli deaktivert. Kontroller at dette er en fullstendig prisliste.</p>}
        <Field label={"Skriv "+(importPreview.largeRemoval?"GODKJENN STOR REDUKSJON":"GODKJENN PRISIMPORT")}>
         <input value={importPhrase} disabled={importBusy} onChange={e=>setImportPhrase(e.target.value)}/>
        </Field>
        <div className={styles.importActions}><button type="button" className={styles.primary} disabled={importBusy||importPhrase!==(importPreview.largeRemoval?"GODKJENN STOR REDUKSJON":"GODKJENN PRISIMPORT")} onClick={approveImport}>Godkjenn og aktiver</button>{activationAttempted&&<button type="button" disabled={importBusy} onClick={checkImportStatus}>Kontroller aktiveringsstatus</button>}<button type="button" disabled={importBusy} onClick={()=>{setImportPreview(null);setImportPhrase("");setImportMessage(activationAttempted?"Forhåndsvisning lukket. Kontroller katalogen før ny import; forrige aktivering kan være gjennomført.":"Import avbrutt. Ingen priser endret.");}}>Avbryt</button></div>
       </div>}
      </form>}
     </div>
    </section>


   <section className={styles.summaryGrid}>
    <div className={styles.totalCard}>
     <span>{primaryLabel}</span>
     <strong>{money(primaryTotal)}</strong>
     {form.businessExVat?<small>{money(calc.total)} inkl. mva</small>:<small>{money(calc.exVat)} eks. mva</small>}
    </div>
    <div className={styles.statCard}><span>Arbeid</span><b>{money(calc.labor)}</b><small>{calc.fixedLabor>0?"Fastpris":decimal(calc.hours)+" t × "+money(calc.hourlyRate)}</small></div>
    <div className={styles.statCard}><span>Materialer</span><b>{money(calc.materials)}</b><small>{decimal(calc.markup)} % påslag</small></div>
    <div className={styles.statCard}><span>Reise + bom</span><b>{money(calc.travel+calc.toll)}</b><small>{decimal(calc.totalKm)} km · {calc.trips} vei(er)</small></div>
   </section>

   <div className={styles.grid}>
    <section className={styles.card}>
     <div className={styles.cardHead}><span className={styles.step}>2</span><div><h2>Arbeid</h2><p>Bruk timeberegning eller skriv inn ferdig fastpris.</p></div></div>
     <Field label="Kunde / prosjekt" help="Valgfritt – brukes bare som merkelapp i kalkylen.">
      <input value={form.project} onChange={e=>set("project",e.target.value)} placeholder="F.eks. Terrasse Toppe"/>
     </Field>
     <div className={styles.two}>
      <Field label="Timer">
       <input inputMode="decimal" value={form.hours} onChange={e=>set("hours",e.target.value)} />
      </Field>
      <Field label="Timepris inkl. mva">
       <div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.hourlyRate} onChange={e=>set("hourlyRate",e.target.value)} /></div>
      </Field>
     </div>
     <Field label="Fastpris arbeid inkl. mva" help="Hvis du fyller inn fastpris, overstyrer den timer × timepris.">
      <div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.fixedLabor} onChange={e=>set("fixedLabor",e.target.value)} placeholder="Valgfritt"/></div>
     </Field>
    </section>

    <section className={styles.card}>
     <div className={styles.cardHead}><span className={styles.step}>3</span><div><h2>Reise</h2><p>5,30 kr/km er statens kilometergodtgjørelse, ikke en pålagt kundepris. Satsen kan endres per kalkyle.</p></div></div>
     <div className={styles.two}>
      <Field label="Km én vei">
       <div className={styles.suffixInput}><input inputMode="decimal" value={form.distanceOneWay} onChange={e=>set("distanceOneWay",e.target.value)} placeholder="0"/><span>km</span></div>
      </Field>
      <Field label="Antall enkeltveier" help="2 = én tur/retur. 4 = to tur/retur.">
       <input inputMode="numeric" value={form.oneWayTrips} onChange={e=>set("oneWayTrips",e.target.value)}/>
      </Field>
     </div>
     <Field label="Km-sats" help="Statens kilometergodtgjørelse fra 1. januar 2026: 5,30 kr/km.">
      <div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.kmRate} onChange={e=>set("kmRate",e.target.value)}/></div>
     </Field>
     <div className={styles.calculationLine}><span>{decimal(calc.totalKm)} km totalt</span><b>{money(calc.travel)}</b></div>
    </section>

    <section className={styles.card}>
     <div className={styles.cardHead}><span className={styles.step}>4</span><div><h2>Bom</h2><p>Ingen bom legges til før du velger en takst eller et eget beløp. Velg etter faktisk rute og biltype.</p></div></div>
     <Field label="Bomoppsett">
      <select value={form.tollPreset} onChange={e=>{
        setForm(current=>({...current,tollPreset:e.target.value,tollSelectionExplicit:true}));
        setLegacyTollCleared(false);
       }}>
       {CALCULATOR_TOLL_PRESETS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
     </Field>
     {legacyTollCleared&&<p role="status" className={styles.vatNote}>Tidligere ble bom lagt til automatisk før du valgte rute. Det gamle standardvalget er nå fjernet fra denne ufullstendige kalkylen. Velg bomoppsett igjen hvis du faktisk skal fakturere bom.</p>}
     {form.tollPreset==="custom"&&<Field label="Bom per vei inkl. mva">
      <div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.customToll} onChange={e=>set("customToll",e.target.value)}/></div>
     </Field>}
     <div className={styles.rateNote}><b>{money(calc.tollPerWay)} per valgt enkeltvei</b><span>{calc.preset.note}</span></div>
     {calc.toll>0&&<p className={styles.vatNote} role="status">Bommen er et estimat. Kontroller reelle betalingsretninger, timesregel, rushtid, rabatter og antall passeringer før tilbudet sendes.{!calc.oneWayDistance?" Ingen kjøreavstand er fylt ut, men valgt bom belastes likevel i kalkylen og følger med når ekstrakostnader overføres til tilbud.":""}</p>}
     <div className={styles.calculationLine}><span>{calc.trips} vei(er)</span><b>{money(calc.toll)}</b></div>
    </section>
   </div>

   <section className={styles.breakdown}>
    <div className={styles.breakdownHead}>
     <div><span className={styles.eyebrow}>SAMMENDRAG</span><h2>Prisgrunnlag</h2></div>
     <label className={styles.toggle}>
      <input type="checkbox" checked={form.businessExVat} onChange={e=>set("businessExVat",e.target.checked)}/>
      <span><b>Bedriftskunde</b><small>Vis hovedsum eks. mva</small></span>
     </label>
    </div>

    <div className={styles.rows}>
     <div><span>Arbeid</span><b>{money(calc.labor)}</b></div>
     <div><span>Materialer inkl. {decimal(calc.markup)} % påslag</span><b>{money(calc.materials)}</b></div>
     <div><span>Reise · {decimal(calc.totalKm)} km</span><b>{money(calc.travel)}</b></div>
     <div><span>Bom · {calc.trips} vei(er)</span><b>{money(calc.toll)}</b></div>
     <div className={styles.subtotal}><span>Sum eks. mva</span><b>{money(calc.exVat)}</b></div>
     <div><span>Mva 25 %</span><b>{money(calc.vat)}</b></div>
     <div className={styles.grandTotal}><span>Sum inkl. mva</span><strong>{money(calc.total)}</strong></div>
    </div>
    <p className={styles.vatNote}>Bedriftshaken endrer bare hvordan hovedsummen vises. Den fjerner ikke mva fra kalkylen eller fakturagrunnlaget.</p>
   </section>

   <section className={styles.sources}>
    <b>Satser kontrollert 21. november 2026</b>
    <p>Statens kilometergodtgjørelse er 5,30 kr/km fra 1. januar 2026, men avtalt kundepris kan være en annen. Bom-hurtigvalgene viser forenklede takstgruppe-1-estimater med AutoPASS fra Ferde for Bergen og E39. Bergen innkrever i én retning, E39 i begge. Timesregel, faktisk passering, biltype (inkludert diesel), rush og rabatter kan endre beløpet. Ingen bom legges til automatisk i en ny kalkyle. Verifiser faktiske kostnader før tilbud sendes.</p>
    <div>
     <a href="https://www.regjeringen.no/no/tema/arbeidsliv/Statlig-arbeidsgiverpolitikk/statens-personalhandbok/sph-meldinger/2025/pm-2025-12-saravtale-om-dekning-av-utgifter-til-reise-og-kost-innenlands/id3143994/" target="_blank" rel="noreferrer">Statens sats ↗</a>
     <a href="https://ferde.no/bomanlegg-og-priser/bypakke-bergen" target="_blank" rel="noreferrer">Bergen bomring ↗</a>
     <a href="https://ferde.no/bomanlegg-og-priser/e39-svegatjorn-radal" target="_blank" rel="noreferrer">E39 Rådal–Svegatjørn ↗</a>
    </div>
   </section>
  </div>
 </main>;
}
