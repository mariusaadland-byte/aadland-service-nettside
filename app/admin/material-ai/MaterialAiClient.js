"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./material-ai.module.css";

const STORE="aadland-material-price-catalog-v1";
const SUPPLIERS=[
 {id:"ahlsell",name:"Ahlsell",mode:"PunchOut / prisfil",note:"Kan kobles mot bedriftsavtale og kundepris."},
 {id:"optimera",name:"Optimera / MinOptimera",mode:"Avtalepris / prisfil",note:"Adapter klar for leverandørens godkjente integrasjonsmetode."},
 {id:"byggmakker",name:"Byggmakker Proff",mode:"Proff / prisfil",note:"Adapter klar for bedriftspris når tilgangsmetode er avklart."},
 {id:"megaflis",name:"Megaflis",mode:"Nettpris / import",note:"Bruk prisimport inntil egen bedriftsintegrasjon finnes."}
];

const number=value=>{
 const n=Number(String(value??"").replace(/\s/g,"").replace(",","."));
 return Number.isFinite(n)?Math.max(0,n):0;
};
const money=value=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
const decimal=(value,digits=3)=>new Intl.NumberFormat("nb-NO",{maximumFractionDigits:digits}).format(Number(value)||0);
const normalizeText=value=>String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9æøå]+/g," ").trim();
const tokens=value=>new Set(normalizeText(value).split(/\s+/).filter(x=>x.length>1));

function parseCsv(text){
 const rows=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
 if(rows.length<2)return [];
 const first=rows[0],sep=first.includes(";")?";":first.includes("\t")?"\t":",";
 const split=line=>line.split(sep).map(v=>v.trim().replace(/^"|"$/g,"").replace(/""/g,'"'));
 const headers=split(first).map(normalizeText);
 const find=(...names)=>headers.findIndex(h=>names.some(n=>h===normalizeText(n)||h.includes(normalizeText(n))));
 const ix={
  supplier:find("supplier","leverandør","leverandor"),
  sku:find("sku","varenr","varenummer","artnr","artikkelnummer"),
  name:find("name","navn","produkt","beskrivelse","vare"),
  unit:find("unit","enhet"),
  ex:find("price ex vat","pris eks mva","pris eks","nettopris","kostpris"),
  inc:find("price inc vat","pris inkl mva","pris inkl","bruttopris"),
  packageSize:find("package size","pakningsstørrelse","pakningsstorrelse","antall i pakke"),
  basis:find("price basis","prisgrunnlag","prisbasis")
 };
 return rows.slice(1).map((row,index)=>{
  const cols=split(row),inc=ix.inc>=0?number(cols[ix.inc]):0,ex=ix.ex>=0?number(cols[ix.ex]):0;
  const name=ix.name>=0?cols[ix.name]:"";
  if(!name)return null;
  return {
   id:"catalog-"+index+"-"+Date.now(),
   supplier:ix.supplier>=0?cols[ix.supplier]:"",
   sku:ix.sku>=0?cols[ix.sku]:"",
   name,
   unit:ix.unit>=0?cols[ix.unit]:"",
   costExVat:ex||inc/1.25,
   packageSize:ix.packageSize>=0?number(cols[ix.packageSize]):0,
   priceBasis:ix.basis>=0&&normalizeText(cols[ix.basis]).includes("pak")?"package":"unit"
  };
 }).filter(Boolean);
}
function matchCatalog(line,catalog,supplier){
 const query=tokens([line.material,line.specification,line.supplierSearch].join(" "));
 let best=null;
 for(const row of catalog){
  if(supplier&&normalizeText(row.supplier)!==normalizeText(supplier))continue;
  const hay=tokens([row.name,row.sku].join(" "));let score=0;
  for(const token of query)if(hay.has(token))score++;
  if(!best||score>best.score)best={row,score};
 }
 return best?.score>0?best.row:null;
}

export default function MaterialAiClient(){
 const [project,setProject]=useState("");
 const [facts,setFacts]=useState("");
 const [materials,setMaterials]=useState("");
 const [markup,setMarkup]=useState("10");
 const [result,setResult]=useState(null);
 const [prices,setPrices]=useState({});
 const [catalog,setCatalog]=useState([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [model,setModel]=useState("");

 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORE)||"[]");if(Array.isArray(saved))setCatalog(saved);
   const drawing=JSON.parse(sessionStorage.getItem("aadlandMaterialAiFromDrawing")||"null");
   if(drawing){
    sessionStorage.removeItem("aadlandMaterialAiFromDrawing");
    setProject(drawing.project||"");
    setFacts(drawing.facts||"");
   }
  }catch{}
 },[]);

 const totals=useMemo(()=>{
  if(!result?.lines?.length)return {cost:0,sales:0};
  return result.lines.reduce((sum,line)=>{
   const p=prices[line.id]||{},cost=number(p.costExVat),basis=p.priceBasis||((line.packages||0)>0?"package":"unit"),qty=basis==="package"?number(line.packages):number(line.purchaseQuantity),salesUnit=cost*(1+number(markup)/100);
   sum.cost+=qty*cost;sum.sales+=qty*salesUnit;return sum;
  },{cost:0,sales:0});
 },[result,prices,markup]);

 async function calculate(){
  setLoading(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/admin/material-ai/calculate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({project,facts,materials})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.setupRequired?"AI-nøkkel mangler i serveroppsettet.":data.error||"Kunne ikke beregne materialene.");
   setResult(data.result);setModel(data.model||"");
   const next={};
   for(const line of data.result?.lines||[]){
    const match=matchCatalog(line,catalog,"");
    next[line.id]=match?{supplier:match.supplier||"",sku:match.sku||"",productName:match.name||"",costExVat:String(match.costExVat||""),priceBasis:match.priceBasis||((line.packages||0)>0?"package":"unit"),matched:true}:{supplier:"",sku:"",productName:"",costExVat:"",priceBasis:(line.packages||0)>0?"package":"unit",matched:false};
   }
   setPrices(next);
  }catch(err){setError(err.message||"Kunne ikke beregne materialene.")}
  finally{setLoading(false)}
 }
 function updatePrice(id,key,value){setPrices(current=>({...current,[id]:{...(current[id]||{}),[key]:value}}))}
 function autoMatch(line){
  const current=prices[line.id]||{},match=matchCatalog(line,catalog,current.supplier||"");
  if(!match){setMessage("Fant ingen god prisfil-match for "+line.material);setTimeout(()=>setMessage(""),1800);return}
  setPrices(value=>({...value,[line.id]:{...value[line.id],supplier:match.supplier||value[line.id]?.supplier||"",sku:match.sku||"",productName:match.name||"",costExVat:String(match.costExVat||""),priceBasis:match.priceBasis||value[line.id]?.priceBasis||"unit",matched:true}}));
 }
 function importPriceFile(event){
  const file=event.target.files?.[0];event.target.value="";if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{const next=parseCsv(reader.result);if(!next.length){setError("Prisfilen kunne ikke leses. Bruk CSV med minst produktnavn og pris.");return}setCatalog(next);localStorage.setItem(STORE,JSON.stringify(next));setMessage(next.length+" prislinjer importert.");setTimeout(()=>setMessage(""),1800)};
  reader.readAsText(file);
 }
 function clearCatalog(){setCatalog([]);localStorage.removeItem(STORE)}
 function createQuote(){
  if(!result?.lines?.length)return;
  const missing=result.lines.filter(line=>number(prices[line.id]?.costExVat)<=0);
  if(missing.length){setError("Fyll inn eller match innkjøpspris på alle materiallinjene før tilbudskladden opprettes.");return}
  const lineItems=result.lines.map(line=>{
   const p=prices[line.id]||{},basis=p.priceBasis||((line.packages||0)>0?"package":"unit"),quantity=basis==="package"?number(line.packages):number(line.purchaseQuantity),unit=basis==="package"?"pk":line.unit,cost=number(p.costExVat),sales=cost*(1+number(markup)/100);
   const supplier=[p.supplier,p.sku].filter(Boolean).join(" · ");
   return {type:"material",description:[line.material,line.specification,supplier].filter(Boolean).join(" – "),quantity:Number(quantity.toFixed(3)),unit,unitPriceOre:Math.round(sales*100),vatRate:25};
  });
  const notes=[
   "Materialgrunnlag beregnet med Material-AI.",
   result.summary||"",
   result.missingFacts?.length?"Mangler/skal kontrolleres: "+result.missingFacts.join(" · "):"",
   "Materialpåslag: "+decimal(number(markup),2)+" %."
  ].filter(Boolean).join("\n\n");
  sessionStorage.setItem("aadlandQuoteDraftFromDrawing",JSON.stringify({title:"Tilbud – "+(project||"materialarbeid"),customer:{name:"",address:""},notes,lineItems}));
  window.location.href="/admin/tilbud/ny";
 }

 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.top}>
    <div><Link href="/admin" className={styles.back}>← Tilbake til backoffice</Link><span>AADLAND SERVICE · INTERNVERKTØY</span><h1>Material-AI</h1><p>Legg inn fakta og materialene du vil bruke. AI-en regner mengder og innkjøpsbehov; prisene hentes fra din prisbase eller senere direkte leverandørkobling.</p></div>
    <div className={styles.topActions}><label>Standard påslag <span><input inputMode="decimal" value={markup} onChange={e=>setMarkup(e.target.value)}/><b>%</b></span></label><button type="button" onClick={calculate} disabled={loading}>{loading?"Regner…":"Regn materialer med AI"}</button></div>
   </header>

   {(error||message)&&<div className={error?styles.error:styles.message}>{error||message}</div>}

   <section className={styles.inputGrid}>
    <div className={styles.card}>
     <span className={styles.kicker}>1 · GRUNNLAG</span><h2>Fakta om jobben</h2>
     <label>Prosjekt / kunde<input value={project} onChange={e=>setProject(e.target.value)} placeholder="F.eks. Bad Toppe"/></label>
     <label>Alle mål og fakta<textarea value={facts} onChange={e=>setFacts(e.target.value)} placeholder={"Eksempel:\nRom 3,20 × 2,40 m, takhøyde 2,40 m.\nVeggene skal plates i to lag.\nStendere c/c 600 mm.\nÉn dør 90 × 210 cm.\nTrekk fra døråpningen."}/></label>
    </div>
    <div className={styles.card}>
     <span className={styles.kicker}>2 · MATERIALVALG</span><h2>Hva skal brukes?</h2>
     <label>Materialer<textarea value={materials} onChange={e=>setMaterials(e.target.value)} placeholder={"Eksempel:\n48×98 konstruksjonsvirke\n13 mm gips, 1200×2400\n50 mm mineralull\nGipsskruer 35 mm\nSparkel og papirremse"}/></label>
     <p>Du velger materialene. AI-en skal først og fremst regne mengdene, ikke bytte til tilfeldige produkter.</p>
    </div>
   </section>

   <section className={styles.supplierCard}>
    <div className={styles.sectionHead}><div><span className={styles.kicker}>3 · LEVERANDØRPRISER</span><h2>Dine innkjøpspriser</h2><p>Prisimport er tilgjengelig nå. Direkte koblinger bygges mot leverandørens godkjente API/PunchOut/EDI når tilgangene er på plass.</p></div><label className={styles.importBtn}>Importer prisfil<input type="file" accept=".csv,text/csv,.txt" onChange={importPriceFile}/></label></div>
    <div className={styles.supplierGrid}>{SUPPLIERS.map(s=><div key={s.id}><strong>{s.name}</strong><span>{s.mode}</span><small>{s.note}</small><b>Ikke direkte koblet</b></div>)}</div>
    <div className={styles.catalogStatus}><span>{catalog.length?catalog.length+" varer i lokal prisbase":"Ingen prisfil importert"}</span>{catalog.length>0&&<button type="button" onClick={clearCatalog}>Tøm prisbase</button>}</div>
    <p className={styles.fileHelp}>CSV kan bruke kolonner som leverandør, varenr/SKU, produkt/navn, enhet, pris eks. mva eller pris inkl. mva, pakningsstørrelse og prisbasis. Pris inkl. mva konverteres til eks. mva før påslag.</p>
   </section>

   {result&&<section className={styles.result}>
    <div className={styles.sectionHead}><div><span className={styles.kicker}>4 · BEREGNING</span><h2>Materialbehov</h2><p>{result.summary}</p>{model&&<small>AI-modell: {model}</small>}</div><button type="button" onClick={calculate} disabled={loading}>Beregn på nytt</button></div>
    {(result.missingFacts?.length>0||result.warnings?.length>0)&&<div className={styles.warnings}>{result.missingFacts?.map((x,i)=><p key={"m"+i}><b>Mangler:</b> {x}</p>)}{result.warnings?.map((x,i)=><p key={"w"+i}><b>Kontroller:</b> {x}</p>)}</div>}
    <div className={styles.lines}>{result.lines.map(line=>{
     const p=prices[line.id]||{},cost=number(p.costExVat),basis=p.priceBasis||((line.packages||0)>0?"package":"unit"),qty=basis==="package"?number(line.packages):number(line.purchaseQuantity),sales=cost*(1+number(markup)/100),total=qty*sales;
     return <article key={line.id} className={styles.line}>
      <div className={styles.lineTop}><div><span className={styles.confidence} data-level={line.confidence}>{line.confidence==="high"?"Høy sikkerhet":line.confidence==="medium"?"Middels sikkerhet":"Lav sikkerhet"}</span><h3>{line.material}</h3><p>{line.specification}</p></div><div className={styles.qty}><small>Innkjøpsbehov</small><strong>{line.packages>0?line.packages+" pk · ":""}{decimal(line.purchaseQuantity)} {line.unit}</strong></div></div>
      <div className={styles.calcGrid}><span><small>Teoretisk</small><b>{decimal(line.requiredQuantity)} {line.unit}</b></span><span><small>Svinn</small><b>{decimal(line.wastePercent,2)} %</b></span><span><small>Pakning</small><b>{line.packageSize>0?decimal(line.packageSize)+" "+line.packageUnit:"Ikke oppgitt"}</b></span><span><small>Beregning</small><b>{line.calculation||line.basis}</b></span></div>
      <div className={styles.priceGrid}>
       <label>Leverandør<select value={p.supplier||""} onChange={e=>updatePrice(line.id,"supplier",e.target.value)}><option value="">Velg / alle</option>{SUPPLIERS.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></label>
       <label>Varenr.<input value={p.sku||""} onChange={e=>updatePrice(line.id,"sku",e.target.value)} placeholder="Valgfritt"/></label>
       <label>Innkjøpspris eks. mva<input inputMode="decimal" value={p.costExVat||""} onChange={e=>updatePrice(line.id,"costExVat",e.target.value)} placeholder="0,00"/></label>
       <label>Pris gjelder<select value={basis} onChange={e=>updatePrice(line.id,"priceBasis",e.target.value)}><option value="unit">Per {line.unit}</option><option value="package">Per pakke</option></select></label>
       <button type="button" className={styles.matchBtn} onClick={()=>autoMatch(line)} disabled={!catalog.length}>Match prisfil</button>
      </div>
      {p.productName&&<p className={styles.matchInfo}>Matchet: <b>{p.productName}</b>{p.sku?" · "+p.sku:""}</p>}
      <div className={styles.priceSummary}><span>Kost: <b>{money(qty*cost)}</b></span><span>+ {decimal(number(markup),2)} %: <b>{money(sales)} / {basis==="package"?"pk":line.unit}</b></span><strong>Tilbudslinje {money(total)} eks. mva</strong></div>
      <details><summary>Se grunnlag</summary><p><b>Grunnlag:</b> {line.basis}</p><p><b>Søk hos leverandør:</b> {line.supplierSearch}</p></details>
     </article>;
    })}</div>
    <div className={styles.totalBar}><div><span>Innkjøpskost eks. mva</span><b>{money(totals.cost)}</b></div><div><span>Materialer til kunde eks. mva</span><strong>{money(totals.sales)}</strong></div><button type="button" onClick={createQuote}>Opprett tilbudskladd →</button></div>
   </section>}
  </div>
 </main>;
}
