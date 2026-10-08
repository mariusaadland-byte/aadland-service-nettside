"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./calculator.module.css";
import QuoteTransferPanel from "./QuoteTransferPanel";
import {unitSaleExVat} from "../../../lib/calculatorQuoteLines";

const STORAGE_KEY="aadland-service-calculator-v1";
const VAT_RATE=0.25;
const DEFAULTS={
 project:"",
 hours:"8",
 hourlyRate:"500",
 fixedLabor:"",
 materialCost:"",
 materialMarkup:"20",
 materialItems:[],
 distanceOneWay:"",
 oneWayTrips:"2",
 kmRate:"5.30",
 tollPreset:"bergen-bjornafjorden-ordinary",
 customToll:"76.80",
 businessExVat:false
};

const TOLL_PRESETS=[
 {id:"bergen-bjornafjorden-ordinary",label:"Bergen ↔ Bjørnafjorden · ordinær AutoPASS",amount:76.80,note:"25,60 Bergen + 51,20 E39 per vei, uten rush"},
 {id:"bergen-bjornafjorden-rush",label:"Bergen ↔ Bjørnafjorden · ordinær AutoPASS i rush",amount:102.40,note:"51,20 Bergen + 51,20 E39 per vei"},
 {id:"bergen-bjornafjorden-ev",label:"Bergen ↔ Bjørnafjorden · elbil AutoPASS",amount:53.44,note:"17,60 Bergen + 35,84 E39 per vei, uten rush"},
 {id:"e39-ordinary",label:"Kun E39 Rådal–Svegatjørn · ordinær AutoPASS",amount:51.20,note:"Takstgruppe 1, ordinært kjøretøy"},
 {id:"e39-ev",label:"Kun E39 Rådal–Svegatjørn · elbil AutoPASS",amount:35.84,note:"Takstgruppe 1, nullutslipp"},
 {id:"bergen-ordinary",label:"Kun Bergen bomring · ordinær AutoPASS",amount:25.60,note:"Uten rush"},
 {id:"bergen-ordinary-rush",label:"Kun Bergen bomring · ordinær AutoPASS i rush",amount:51.20,note:"Rushtid"},
 {id:"bergen-ev",label:"Kun Bergen bomring · elbil AutoPASS",amount:17.60,note:"Uten rush"},
 {id:"custom",label:"Egendefinert bom per vei",amount:null,note:"Skriv inn beløpet selv"}
];

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
 const [copied,setCopied]=useState(false);
 const [addedNotice,setAddedNotice]=useState("");
 const [catalogSuppliers,setCatalogSuppliers]=useState([]);
 const [catalogSupplier,setCatalogSupplier]=useState("byggern");
 const [materialQuery,setMaterialQuery]=useState("");
 const [materialResults,setMaterialResults]=useState([]);
 const [catalogBusy,setCatalogBusy]=useState(false);
 const [catalogError,setCatalogError]=useState("");
 const [importOpen,setImportOpen]=useState(false);
 const [importSupplier,setImportSupplier]=useState("byggern");
 const [newSupplierName,setNewSupplierName]=useState("");
 const [importPriceIncludesVat,setImportPriceIncludesVat]=useState(false);
 const [importFile,setImportFile]=useState(null);
 const [importBusy,setImportBusy]=useState(false);
 const [importMessage,setImportMessage]=useState("");

 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
   if(saved&&typeof saved==="object")setForm({...DEFAULTS,...saved,materialMarkup:String(saved.materialMarkup??"").trim()==="15"?"20":String(saved.materialMarkup??"20")});
  }catch{}
 },[]);

 useEffect(()=>{
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(form));}catch{}
 },[form]);

 useEffect(()=>{loadSuppliers()},[]);

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
   if(!suppliers.some(item=>item.id===importSupplier))setImportSupplier(primary);
  }catch(error){
   setCatalogError(error?.message||"Kunne ikke hente leverandører.");
  }
 }

 function set(name,value){
  setForm(current=>({...current,[name]:value}));
 }
 function reset(){
  setForm(DEFAULTS);
  setCopied(false);
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
      costExVat:number(product.costExVat),qty:"1",saleExVat:""
     }];
   return {...current,materialItems:next};
  });
  setMaterialQuery("");setMaterialResults([]);
  setAddedNotice("Vare lagt til. Endre antall på linjen under, eller søk etter neste vare.");
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

 async function importPriceList(event){
  event?.preventDefault?.();
  setImportMessage("");setCatalogError("");
  if(!importFile){setCatalogError("Velg en prisfil først.");return}
  if(importSupplier==="new"&&!newSupplierName.trim()){setCatalogError("Skriv inn leverandørnavn.");return}
  setImportBusy(true);
  try{
   const body=new FormData();
   body.append("file",importFile);
   body.append("supplierId",importSupplier);
   body.append("newSupplierName",newSupplierName.trim());
   body.append("priceIncludesVat",importPriceIncludesVat?"true":"false");
   const response=await fetch("/api/admin/material-catalog/import",{method:"POST",body});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Kunne ikke importere prislisten.");
   setImportMessage((data.imported||0)+" varer importert fra "+(data.supplier?.name||"leverandøren")+(data.skipped?" · "+data.skipped+" rader hoppet over":"")+".");
   const supplierId=data.supplier?.id||"";
   if(supplierId){
    setCatalogSupplier(supplierId);
    setImportSupplier(supplierId);
   }
   setNewSupplierName("");
   setImportFile(null);
   const input=document.getElementById("material-price-file");
   if(input)input.value="";
   await loadSuppliers(supplierId);
   if(materialQuery.trim().length>=2)setMaterialQuery(q=>q+" ");
  }catch(error){
   setCatalogError(error?.message||"Kunne ikke importere prislisten.");
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
  const trips=Math.max(0,Math.round(number(form.oneWayTrips)));
  const totalKm=oneWayDistance*trips;
  const travel=totalKm*number(form.kmRate);

  const preset=TOLL_PRESETS.find(item=>item.id===form.tollPreset)||TOLL_PRESETS[0];
  const tollPerWay=preset.id==="custom"?number(form.customToll):number(preset.amount);
  const toll=tollPerWay*trips;

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
     <button type="button" className={styles.secondary} onClick={reset}>Nullstill</button>
     <button type="button" className={styles.secondary} onClick={copySummary}>{copied?"Kopiert ✓":"Kopier sammendrag"}</button>
     <button type="button" className={styles.primary} onClick={()=>window.print()}>Skriv ut</button>
    </div>
   </div>

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
     <div className={styles.cardHead}><span className={styles.step}>1</span><div><h2>Arbeid</h2><p>Bruk timeberegning eller skriv inn ferdig fastpris.</p></div></div>
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
     <div className={styles.cardHead}><span className={styles.step}>2</span><div><h2>Materialer</h2><p>Ett søkefelt: velg vare, endre antall og overfør til tilbud.</p></div></div>

     <div className={styles.catalogSearchBlock}>
       <Field label="Søk vare med navn, varenummer eller EAN">
        <input id="calculator-product-search" type="search" value={materialQuery} onChange={e=>{setMaterialQuery(e.target.value);setAddedNotice("")}} placeholder="Søk for eksempel terrassebord, gips eller 49604414 …" autoComplete="off"/>
       </Field>
       <details className={styles.catalogFilter}><summary>Leverandør: {catalogSuppliers.find(item=>item.id===catalogSupplier)?.name||"Alle leverandører"} · Endre</summary>
        <Field label="Søk hos"><select value={catalogSupplier} onChange={e=>setCatalogSupplier(e.target.value)}>
         <option value="">Alle leverandører</option>{catalogSuppliers.map(item=><option key={item.id} value={item.id}>{item.name}{item.isPrimary?" · primær":""}</option>)}
        </select></Field>
       </details>
      </div>
      {catalogError&&<div className={styles.catalogError}>{catalogError}</div>}
      {materialQuery.trim().length>=2&&<div className={styles.searchResults}>
       {catalogBusy&&<div className={styles.catalogEmpty}>Søker …</div>}
       {!catalogBusy&&!catalogError&&materialResults.length===0&&<div className={styles.catalogEmpty}>Ingen treff. Prøv et annet varenummer eller kortere navn.</div>}
       {!catalogBusy&&materialResults.map(product=><button type="button" key={product.supplierId+"::"+product.sku} className={styles.productResult} onClick={()=>addMaterial(product)}>
        <span><b>{product.name}</b><small>{product.supplierName} · varenr. {product.sku}</small></span>
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
          <label className={styles.quoteGoodsDescription}><span>Vare / beskrivelse</span><input value={item.name||""} onChange={e=>updateMaterial(item.key,"name",e.target.value)} placeholder="Hva skal leveres?"/><small>{item.sku?"Varenr. "+item.sku+" · ":""}{item.supplierName||"Manuell vare"}</small></label>
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
      <Field label="Standard materialpåslag" help="Automatisk på varer uten overstyrt salgspris."><div className={styles.suffixInput}><input inputMode="decimal" value={form.materialMarkup} onChange={e=>set("materialMarkup",e.target.value)}/><span>%</span></div></Field>
      <QuoteTransferPanel form={form}/>
      <details className={styles.legacyMaterialCost}><summary>Andre materialkostnader (valgfritt)</summary>
       <Field label="Beløp inkl. mva."><div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.materialCost} onChange={e=>set("materialCost",e.target.value)} placeholder="0"/></div></Field>
       <p>Bruk gjerne «Manuell vare» ovenfor i stedet. Andre materialkostnader tas med i tilbudet dersom du huker av for øvrige kostnader.</p>
      </details>
      <div className={styles.importPanel}>
      <button type="button" className={styles.importToggle} onClick={()=>{setImportOpen(value=>!value);setCatalogError("");setImportMessage("")}}>
       <span><b>Leverandørprislister</b><small>Importer eller oppdater Bygger’n og andre leverandører</small></span>
       <strong>{importOpen?"Lukk":"Åpne"} →</strong>
      </button>
      {importOpen&&<form className={styles.importForm} onSubmit={importPriceList}>
       <div className={styles.importGrid}>
        <Field label="Leverandør">
         <select value={importSupplier} onChange={e=>setImportSupplier(e.target.value)}>
          {catalogSuppliers.map(item=><option key={item.id} value={item.id}>{item.name}{item.isPrimary?" · primær":""}</option>)}
          <option value="new">+ Ny leverandør</option>
         </select>
        </Field>
        {importSupplier==="new"&&<Field label="Ny leverandør">
         <input value={newSupplierName} onChange={e=>setNewSupplierName(e.target.value)} placeholder="F.eks. Montér"/>
        </Field>}
       </div>
       <Field label="Prisfil" help="XLSX, CSV, TSV eller TXT. Nye filer oppdaterer samme varenummer og varer som forsvinner fra filen deaktiveres.">
        <input id="material-price-file" type="file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" onChange={e=>setImportFile(e.target.files?.[0]||null)}/>
       </Field>
       <label className={styles.importCheck}><input type="checkbox" checked={importPriceIncludesVat} onChange={e=>setImportPriceIncludesVat(e.target.checked)}/><span><b>Prisene i filen er inkl. mva</b><small>La denne være av for Bygger’n-filen du har nå – den er eks. mva.</small></span></label>
       <div className={styles.importActions}><button type="submit" className={styles.primary} disabled={importBusy}>{importBusy?"Importerer…":"Importer / oppdater prisliste"}</button>{importMessage&&<span>{importMessage}</span>}</div>
      </form>}
     </div>
    </section>

    <section className={styles.card}>
     <div className={styles.cardHead}><span className={styles.step}>3</span><div><h2>Reise</h2><p>Statens sats er forhåndsutfylt, men kan endres per kalkyle.</p></div></div>
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
     <div className={styles.cardHead}><span className={styles.step}>4</span><div><h2>Bom</h2><p>Velg et hurtigvalg eller bruk eget beløp per vei.</p></div></div>
     <Field label="Bomoppsett">
      <select value={form.tollPreset} onChange={e=>set("tollPreset",e.target.value)}>
       {TOLL_PRESETS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
     </Field>
     {form.tollPreset==="custom"&&<Field label="Bom per vei inkl. mva">
      <div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.customToll} onChange={e=>set("customToll",e.target.value)}/></div>
     </Field>}
     <div className={styles.rateNote}><b>{money(calc.tollPerWay)} per vei</b><span>{calc.preset.note}</span></div>
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
    <b>Satser kontrollert 3. oktober 2026</b>
    <p>Statens kilometergodtgjørelse er 5,30 kr/km fra 1. januar 2026. Bom-hurtigvalgene bruker gjeldende AutoPASS-takster for lett kjøretøy fra Ferde: Bergen og E39 Rådal–Svegatjørn. Bom kan variere med kjøretøy, avtale og rushtid, så feltet kan overstyres.</p>
    <div>
     <a href="https://www.regjeringen.no/no/tema/arbeidsliv/Statlig-arbeidsgiverpolitikk/statens-personalhandbok/sph-meldinger/2025/pm-2025-12-saravtale-om-dekning-av-utgifter-til-reise-og-kost-innenlands/id3143994/" target="_blank" rel="noreferrer">Statens sats ↗</a>
     <a href="https://ferde.no/bomanlegg-og-priser/bypakke-bergen" target="_blank" rel="noreferrer">Bergen bomring ↗</a>
     <a href="https://ferde.no/bomanlegg-og-priser/e39-svegatjorn-radal" target="_blank" rel="noreferrer">E39 Rådal–Svegatjørn ↗</a>
    </div>
   </section>
  </div>
 </main>;
}
