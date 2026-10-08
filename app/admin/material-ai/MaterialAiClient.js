"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./material-ai.module.css";

const STORE="aadland-material-price-catalog-v1";
const DRAFT_STORE="aadland-material-calculator-v2";
const FAVORITES_STORE="aadland-material-favorites-v1";

const SUPPLIERS=[
 {id:"byggern",name:"Bygger’n",mode:"Proffpris / prisliste",note:"Primær leverandør. Prisfil brukes nå; direkte kundepris kan kobles på senere."},
 {id:"ahlsell",name:"Ahlsell",mode:"PunchOut / prisfil",note:"Kan kobles mot bedriftsavtale og kundepris."},
 {id:"optimera",name:"Optimera / MinOptimera",mode:"Avtalepris / prisfil",note:"Adapter klar for leverandørens godkjente integrasjon."},
 {id:"byggmakker",name:"Byggmakker Proff",mode:"Proff / prisfil",note:"Adapter klar for bedriftspris."},
 {id:"megaflis",name:"Megaflis",mode:"Nettpris / import",note:"Prisfil/manuell pris inntil eventuell bedriftsintegrasjon."}
];

const SOURCE_FIELDS=[
 {id:"wallNetM2",label:"Netto veggflate",unit:"m²",kind:"area"},
 {id:"wallGrossM2",label:"Brutto veggflate",unit:"m²",kind:"area"},
 {id:"floorM2",label:"Gulvareal",unit:"m²",kind:"area"},
 {id:"ceilingM2",label:"Takareal",unit:"m²",kind:"area"},
 {id:"skirtingNetM",label:"Netto gulvlist",unit:"lm",kind:"length"},
 {id:"perimeterM",label:"Romomkrets",unit:"lm",kind:"length"},
 {id:"wallLengthM",label:"Samlet vegglengde",unit:"lm",kind:"length"}
];

const RULES=[
 {id:"sheet",label:"Plate etter mål"},
 {id:"coverage",label:"Dekning per enhet/pakke"},
 {id:"per_area",label:"Forbruk per m²"},
 {id:"linear_piece",label:"Lengdevarer i faste lengder"},
 {id:"per_linear",label:"Forbruk per løpemeter"},
 {id:"studs",label:"Stendere etter c/c"},
 {id:"battens_area",label:"Lekter etter c/c på flate"},
 {id:"manual",label:"Manuell mengde"}
];

const number=value=>{
 const n=Number(String(value??"").replace(/\s/g,"").replace(",","."));
 return Number.isFinite(n)?Math.max(0,n):0;
};
const money=value=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
const decimal=(value,digits=3)=>new Intl.NumberFormat("nb-NO",{maximumFractionDigits:digits}).format(Number(value)||0);
const normalizeText=value=>String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9æøå]+/g," ").trim();
const tokens=value=>new Set(normalizeText(value).split(/\s+/).filter(x=>x.length>1));
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36);

const emptyBasis=()=>({wallNetM2:"",wallGrossM2:"",floorM2:"",ceilingM2:"",skirtingNetM:"",perimeterM:"",wallLengthM:"",wallCount:"",roomCount:""});

function materialRow(preset={}){
 return {
  id:uid(),material:"",specification:"",rule:"sheet",source:"wallNetM2",scope:"all",unit:"stk",
  layers:"1",sheetW:"1200",sheetH:"2400",coverage:"",factor:"",pieceLength:"",cc:"600",
  manualQty:"",waste:"10",packageSize:"1",packageUnit:"stk",...preset
 };
}
const TEMPLATES=[
 {label:"Gips/plate vegg",row:{material:"Plate",specification:"Oppgi type/dimensjon",rule:"sheet",source:"wallNetM2",unit:"stk",sheetW:"1200",sheetH:"2400",layers:"1",waste:"10",packageSize:"1",packageUnit:"stk"}},
 {label:"Gips/plate tak",row:{material:"Plate",specification:"Oppgi type/dimensjon",rule:"sheet",source:"ceilingM2",unit:"stk",sheetW:"1200",sheetH:"2400",layers:"1",waste:"10",packageSize:"1",packageUnit:"stk"}},
 {label:"Stendere c/c",row:{material:"Konstruksjonsvirke",specification:"Oppgi dimensjon",rule:"studs",source:"wallLengthM",unit:"stk",cc:"600",waste:"5",packageSize:"1",packageUnit:"stk"}},
 {label:"Lekter c/c",row:{material:"Lekter",specification:"Oppgi dimensjon og lengde",rule:"battens_area",source:"wallNetM2",unit:"stk",cc:"600",pieceLength:"4.8",waste:"10",packageSize:"1",packageUnit:"stk"}},
 {label:"Skruer per m²",row:{material:"Skruer",specification:"Oppgi type/lengde",rule:"per_area",source:"wallNetM2",unit:"stk",factor:"15",waste:"10",packageSize:"1000",packageUnit:"pk"}},
 {label:"Gulvlist",row:{material:"Gulvlist",specification:"Oppgi profil/lengde",rule:"linear_piece",source:"skirtingNetM",unit:"stk",pieceLength:"4.4",waste:"10",packageSize:"1",packageUnit:"stk"}}
];

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
  const cols=split(row),inc=ix.inc>=0?number(cols[ix.inc]):0,ex=ix.ex>=0?number(cols[ix.ex]):0,name=ix.name>=0?cols[ix.name]:"";
  if(!name)return null;
  return {id:"catalog-"+index+"-"+Date.now(),supplier:ix.supplier>=0?cols[ix.supplier]:"",sku:ix.sku>=0?cols[ix.sku]:"",name,unit:ix.unit>=0?cols[ix.unit]:"",costExVat:ex||inc/1.25,packageSize:ix.packageSize>=0?number(cols[ix.packageSize]):0,priceBasis:ix.basis>=0&&normalizeText(cols[ix.basis]).includes("pak")?"package":"unit"};
 }).filter(Boolean);
}
function matchCatalog(line,catalog,supplier){
 const query=tokens([line.material,line.specification].join(" "));
 let best=null;
 for(const row of catalog){
  if(supplier&&normalizeText(row.supplier)!==normalizeText(supplier))continue;
  const hay=tokens([row.name,row.sku].join(" "));let score=0;
  for(const token of query)if(hay.has(token))score++;
  if(!best||score>best.score)best={row,score};
 }
 return best?.score>0?best.row:null;
}
function sourceInfo(id){return SOURCE_FIELDS.find(item=>item.id===id)||SOURCE_FIELDS[0]}
function sourceOptions(rule){
 if(["sheet","coverage","per_area","battens_area"].includes(rule))return SOURCE_FIELDS.filter(item=>item.kind==="area");
 if(["linear_piece","per_linear","studs"].includes(rule))return SOURCE_FIELDS.filter(item=>item.kind==="length");
 return SOURCE_FIELDS;
}
function favoriteRow(line){
 return {
  material:line.material,specification:line.specification,rule:line.rule,source:line.source,scope:"all",unit:line.unit,
  layers:line.layers,sheetW:line.sheetW,sheetH:line.sheetH,coverage:line.coverage,factor:line.factor,pieceLength:line.pieceLength,
  cc:line.cc,manualQty:line.manualQty,waste:line.waste,packageSize:line.packageSize,packageUnit:line.packageUnit
 };
}

function calculateLine(row,basis,rooms){
 const scoped=row.scope&&row.scope!=="all"?rooms.find(room=>room.id===row.scope)?.basis:null,effective=scoped||basis,source=number(effective[row.source]),sourceMeta=sourceInfo(row.source),layers=Math.max(1,number(row.layers)||1);
 let required=0,unit=row.unit||"stk",calculation="",missing="";
 if(row.rule==="sheet"){
  const w=number(row.sheetW)/1000,h=number(row.sheetH)/1000,area=w*h;
  if(!source)missing=sourceMeta.label+" mangler";
  else if(!area)missing="Platemål mangler";
  else{required=source*layers/area;unit="stk";calculation=decimal(source)+" "+sourceMeta.unit+" × "+decimal(layers,1)+" lag ÷ "+decimal(area)+" m²/plate"}
 }else if(row.rule==="coverage"){
  const coverage=number(row.coverage);
  if(!source)missing=sourceMeta.label+" mangler";
  else if(!coverage)missing="Dekning per enhet/pakke mangler";
  else{required=source*layers/coverage;calculation=decimal(source)+" "+sourceMeta.unit+" × "+decimal(layers,1)+" ÷ "+decimal(coverage)+" "+sourceMeta.unit+"/enhet"}
 }else if(row.rule==="per_area"){
  const factor=number(row.factor);
  if(!source)missing=sourceMeta.label+" mangler";
  else if(!factor)missing="Forbruk per m² mangler";
  else{required=source*factor*layers;calculation=decimal(source)+" m² × "+decimal(factor)+" "+unit+"/m² × "+decimal(layers,1)}
 }else if(row.rule==="linear_piece"){
  const piece=number(row.pieceLength);
  if(!source)missing=sourceMeta.label+" mangler";
  else if(!piece)missing="Lengde per stk mangler";
  else{required=source*layers/piece;unit="stk";calculation=decimal(source)+" lm × "+decimal(layers,1)+" ÷ "+decimal(piece)+" m/stk"}
 }else if(row.rule==="per_linear"){
  const factor=number(row.factor);
  if(!source)missing=sourceMeta.label+" mangler";
  else if(!factor)missing="Forbruk per løpemeter mangler";
  else{required=source*factor*layers;calculation=decimal(source)+" lm × "+decimal(factor)+" "+unit+"/lm × "+decimal(layers,1)}
 }else if(row.rule==="studs"){
  const cc=number(row.cc),wallCount=Math.max(1,Math.round(number(effective.wallCount)||1));
  if(!source)missing="Samlet vegglengde mangler";
  else if(!cc)missing="c/c-avstand mangler";
  else{required=Math.ceil(source*1000/cc)+wallCount;unit="stk";calculation="ceil("+decimal(source)+" m ÷ "+cc+" mm c/c) + "+wallCount+" endestendere"}
 }else if(row.rule==="battens_area"){
  const cc=number(row.cc)/1000,piece=number(row.pieceLength);
  if(!source)missing=sourceMeta.label+" mangler";
  else if(!cc)missing="c/c-avstand mangler";
  else if(!piece)missing="Lengde per lekt mangler";
  else{const lm=source/cc;required=lm/piece;unit="stk";calculation=decimal(source)+" m² ÷ "+decimal(cc)+" m c/c = "+decimal(lm)+" lm ÷ "+decimal(piece)+" m/stk"}
 }else{
  required=number(row.manualQty);calculation="Manuelt oppgitt mengde";if(!required)missing="Mengde mangler";
 }
 const waste=number(row.waste),raw=required*(1+waste/100),pack=number(row.packageSize),packages=pack>0?Math.ceil(raw/pack):0,purchase=pack>0?packages*pack:raw;
 return {...row,requiredQuantity:Number(required.toFixed(3)),purchaseQuantity:Number(purchase.toFixed(3)),packages,unit,calculation,missing,ready:!missing&&Boolean(row.material.trim())};
}

export default function MaterialAiClient(){
 const [project,setProject]=useState("");
 const [facts,setFacts]=useState("");
 const [basis,setBasis]=useState(emptyBasis);
 const [rooms,setRooms]=useState([]);
 const [rows,setRows]=useState([]);
 const [markup,setMarkup]=useState("20");
 const [prices,setPrices]=useState({});
 const [catalog,setCatalog]=useState([]);
 const [favorites,setFavorites]=useState([]);
 const [supplierStatuses,setSupplierStatuses]=useState([]);
 const [sharedSuppliers,setSharedSuppliers]=useState([]);
 const [sharedQueries,setSharedQueries]=useState({});
 const [sharedMatches,setSharedMatches]=useState({});
 const [sharedBusy,setSharedBusy]=useState("");
 const [sharedErrors,setSharedErrors]=useState({});
 const [directBusy,setDirectBusy]=useState("");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");

 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORE)||"[]");if(Array.isArray(saved))setCatalog(saved);const savedFavorites=JSON.parse(localStorage.getItem(FAVORITES_STORE)||"[]");if(Array.isArray(savedFavorites))setFavorites(savedFavorites);
   const draft=JSON.parse(localStorage.getItem(DRAFT_STORE)||"null");
   if(draft){setProject(draft.project||"");setFacts(draft.facts||"");setBasis({...emptyBasis(),...(draft.basis||{})});setRooms(Array.isArray(draft.rooms)?draft.rooms:[]);setRows(Array.isArray(draft.rows)?draft.rows:[]);setMarkup(String(draft.markup??"").trim()==="10"?"20":String(draft.markup??"20"));setPrices(draft.prices||{})}
   const drawing=JSON.parse(sessionStorage.getItem("aadlandMaterialCalcFromDrawing")||sessionStorage.getItem("aadlandMaterialAiFromDrawing")||"null");
   if(drawing){
    sessionStorage.removeItem("aadlandMaterialCalcFromDrawing");sessionStorage.removeItem("aadlandMaterialAiFromDrawing");
    setProject(drawing.project||"");setFacts(drawing.facts||"");
    if(drawing.basis)setBasis(current=>({...current,...drawing.basis}));if(Array.isArray(drawing.rooms))setRooms(drawing.rooms);
   }
  }catch{}
 },[]);

 useEffect(()=>{
  let cancelled=false;
  fetch("/api/admin/material-suppliers").then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error();return data.suppliers||[]}).then(items=>{if(!cancelled)setSupplierStatuses(items)}).catch(()=>{});
  return()=>{cancelled=true};
 },[]);

 useEffect(()=>{
  let active=true;
  fetch("/api/admin/material-catalog",{cache:"no-store"}).then(async r=>{
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke hente felles prisbase");
   return data.suppliers||[];
  }).then(suppliers=>{if(active)setSharedSuppliers(suppliers)}).catch(()=>{});
  return()=>{active=false};
 },[]);

 useEffect(()=>{
  const timer=setTimeout(()=>{try{localStorage.setItem(DRAFT_STORE,JSON.stringify({project,facts,basis,rooms,rows,markup,prices}))}catch{}},220);
  return()=>clearTimeout(timer);
 },[project,facts,basis,rooms,rows,markup,prices]);

 const calculated=useMemo(()=>rows.map(row=>calculateLine(row,basis,rooms)),[rows,basis,rooms]);
 const totals=useMemo(()=>calculated.reduce((sum,line)=>{
  const p=prices[line.id]||{},cost=number(p.costExVat),priceBasis=p.priceBasis||((line.packages||0)>0?"package":"unit"),qty=priceBasis==="package"?number(line.packages):number(line.purchaseQuantity),salesUnit=cost*(1+number(markup)/100);
  sum.cost+=qty*cost;sum.sales+=qty*salesUnit;return sum;
 },{cost:0,sales:0}),[calculated,prices,markup]);

 function updateBasis(key,value){setBasis(current=>({...current,[key]:value}))}
 function updateRow(id,key,value){setRows(current=>current.map(row=>{
  if(row.id!==id)return row;
  if(key==="rule"){
   const options=sourceOptions(value),source=options.some(item=>item.id===row.source)?row.source:(options[0]?.id||row.source);
   return {...row,rule:value,source};
  }
  return {...row,[key]:value};
 }))}
 function removeRow(id){setRows(current=>current.filter(row=>row.id!==id));setPrices(current=>{const next={...current};delete next[id];return next})}
 function addRow(preset={},presetPrice=null){const row=materialRow(preset);setRows(current=>[...current,row]);setPrices(current=>({...current,[row.id]:presetPrice?{...presetPrice}:{supplier:"Bygger’n",sku:"",productName:"",costExVat:"",priceBasis:number(row.packageSize)>1?"package":"unit",matched:false}}))}
 function saveFavorite(line){
  if(!line.material.trim()){setMessage("Skriv materialnavn før du lagrer favoritten.");setTimeout(()=>setMessage(""),1600);return}
  const key=normalizeText(line.material+" "+line.specification),entry={id:uid(),key,name:[line.material,line.specification].filter(Boolean).join(" – "),row:favoriteRow(line),price:{...(prices[line.id]||{supplier:"Bygger’n"})}};
  setFavorites(current=>{const next=[entry,...current.filter(item=>item.key!==key)].slice(0,40);localStorage.setItem(FAVORITES_STORE,JSON.stringify(next));return next});
  setMessage("Materialfavoritt lagret");setTimeout(()=>setMessage(""),1500);
 }
 function removeFavorite(id){setFavorites(current=>{const next=current.filter(item=>item.id!==id);localStorage.setItem(FAVORITES_STORE,JSON.stringify(next));return next})}
 function updatePrice(id,key,value){setPrices(current=>({...current,[id]:{...(current[id]||{}),[key]:value}}))}
 function matchAllPrices(priceCatalog=catalog){
  if(!priceCatalog.length||!rows.length)return 0;
  let matched=0;const updates={};
  for(const row of rows){
   const preferred=prices[row.id]?.supplier||"Bygger’n",match=matchCatalog(row,priceCatalog,preferred)||matchCatalog(row,priceCatalog,"Bygger’n")||matchCatalog(row,priceCatalog,"");
   if(match){matched++;updates[row.id]={supplier:match.supplier||preferred,sku:match.sku||"",productName:match.name||"",costExVat:String(match.costExVat||""),priceBasis:match.priceBasis||prices[row.id]?.priceBasis||"unit",matched:true}}
  }
  if(matched)setPrices(current=>{const next={...current};for(const [id,value] of Object.entries(updates))next[id]={...(next[id]||{}),...value};return next});
  return matched;
 }
 const visibleSuppliers=[...SUPPLIERS,...sharedSuppliers.filter(shared=>!SUPPLIERS.some(item=>normalizeText(item.name)===normalizeText(shared.name))).map(item=>({id:item.id,name:item.name}))];
 async function lookupSharedPrice(line){
  const chosen=prices[line.id]?.supplier||"Bygger’n";
  const query=String(sharedQueries[line.id]??(line.material||line.specification||"")).trim();
  if(query.length<2){setSharedErrors(value=>({...value,[line.id]:"Skriv minst to tegn for å søke."}));return}
  setSharedBusy(line.id);setSharedErrors(value=>({...value,[line.id]:""}));
  try{
   const params=new URLSearchParams({q:query,limit:"20"});
   const matched=sharedSuppliers.find(item=>normalizeText(item.name)===normalizeText(chosen)||item.id===chosen);
   if(matched)params.set("supplier",matched.id);
   const response=await fetch("/api/admin/material-catalog?"+params.toString(),{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Kunne ikke søke i felles prisbase.");
   setSharedMatches(current=>({...current,[line.id]:data.products||[]}));
   if(Array.isArray(data.suppliers))setSharedSuppliers(data.suppliers);
   if(!(data.products||[]).length)setSharedErrors(current=>({...current,[line.id]:"Ingen treff. Prøv varenummer, kortere produktnavn eller en annen leverandør."}));
  }catch(e){
   setSharedErrors(current=>({...current,[line.id]:e.message||"Søket feilet."}));
   setSharedMatches(current=>({...current,[line.id]:[]}));
  }finally{setSharedBusy("")}
 }
 function chooseSharedPrice(line,product){
  const packUnits=new Set(["PAK","PK","PKT","ESK","KRT","BOX","POS","SEK"]);
  const basis=packUnits.has(String(product.unit||"").toUpperCase())?"package":"unit";
  setPrices(current=>({...current,[line.id]:{
   ...current[line.id],supplier:product.supplierName||"Bygger’n",sku:product.sku||"",
   productName:product.name||"",costExVat:String(product.costExVat??""),priceBasis:basis,
   catalogUnit:product.unit||"STK",matched:true,direct:false,shared:true
  }}));
  setSharedMatches(current=>({...current,[line.id]:[]}));
  setSharedErrors(current=>({...current,[line.id]:""}));
  setMessage("Varenr. "+product.sku+" hentet fra "+product.supplierName+". Kontroller enheten "+(product.unit||"STK")+".");
  setTimeout(()=>setMessage(""),3600);
 }
 function autoMatch(line){
  const current=prices[line.id]||{},preferred=current.supplier||"Bygger’n",match=matchCatalog(line,catalog,preferred)||matchCatalog(line,catalog,"Bygger’n")||matchCatalog(line,catalog,"");
  if(!match){setMessage("Fant ingen god prisfil-match for "+line.material);setTimeout(()=>setMessage(""),1800);return}
  setPrices(value=>({...value,[line.id]:{...value[line.id],supplier:match.supplier||preferred,sku:match.sku||"",productName:match.name||"",costExVat:String(match.costExVat||""),priceBasis:match.priceBasis||value[line.id]?.priceBasis||"unit",matched:true}}));
 }
 async function directLookup(line){
  const current=prices[line.id]||{},supplier=current.supplier;if(!supplier){setMessage("Velg leverandør først.");setTimeout(()=>setMessage(""),1600);return}
  setDirectBusy(line.id);setError("");
  try{
   const r=await fetch("/api/admin/material-suppliers?supplier="+encodeURIComponent(supplier)+"&q="+encodeURIComponent([line.material,line.specification].filter(Boolean).join(" "))),data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Kunne ikke hente leverandørpris.");
   if(!data.connected)throw new Error("Denne leverandøren er ikke direkte koblet ennå.");
   const match=data.products?.[0];if(!match)throw new Error("Fant ingen kundepris på dette søket.");
   setPrices(value=>({...value,[line.id]:{...value[line.id],supplier:match.supplier||supplier,sku:match.sku||"",productName:match.name||"",costExVat:String(match.costExVat||""),priceBasis:match.priceBasis||value[line.id]?.priceBasis||"unit",matched:true,direct:true}}));
  }catch(err){setError(err.message||"Kunne ikke hente leverandørpris.")}
  finally{setDirectBusy("")}
 }
 function importPriceFile(event){
  const file=event.target.files?.[0];event.target.value="";if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{const next=parseCsv(reader.result);if(!next.length){setError("Prisfilen kunne ikke leses. Bruk CSV med minst produktnavn og pris.");return}setCatalog(next);localStorage.setItem(STORE,JSON.stringify(next));const matched=matchAllPrices(next);setMessage(next.length+" prislinjer importert"+(matched?" · "+matched+" materialer matchet automatisk":""));setTimeout(()=>setMessage(""),2200)};
  reader.readAsText(file);
 }
 function clearCatalog(){setCatalog([]);localStorage.removeItem(STORE)}
 function createQuote(){
  setError("");
  const invalid=calculated.filter(line=>!line.ready);
  if(invalid.length){setError("Rett manglende grunnlag på alle materiallinjene før tilbudet opprettes.");return}
  const missingPrice=calculated.filter(line=>number(prices[line.id]?.costExVat)<=0);
  if(missingPrice.length){setError("Fyll inn eller match innkjøpspris på alle materiallinjene før tilbudet opprettes.");return}
  const lineItems=calculated.map(line=>{
   const p=prices[line.id]||{},priceBasis=p.priceBasis||((line.packages||0)>0?"package":"unit"),quantity=priceBasis==="package"?number(line.packages):number(line.purchaseQuantity),unit=priceBasis==="package"?"pk":line.unit,cost=number(p.costExVat),sales=cost*(1+number(markup)/100),supplier=[p.supplier,p.sku].filter(Boolean).join(" · ");
   return {type:"material",description:[line.material,line.specification,supplier].filter(Boolean).join(" – "),quantity:Number(quantity.toFixed(3)),unit,unitPriceOre:Math.round(sales*100),vatRate:25};
  });
  const notes=[
   "Materialgrunnlag beregnet med Aadland materialkalkulator (faste regler, uten AI/API).",
   facts||"",
   "Materialpåslag: "+decimal(number(markup),2)+" %."
  ].filter(Boolean).join("\n\n");
  sessionStorage.setItem("aadlandQuoteDraftFromDrawing",JSON.stringify({title:"Tilbud – "+(project||"materialarbeid"),customer:{name:"",address:""},notes,lineItems}));
  window.location.href="/admin/tilbud/ny";
 }
 function resetDraft(){
  localStorage.removeItem(DRAFT_STORE);setProject("");setFacts("");setBasis(emptyBasis());setRooms([]);setRows([]);setPrices({});setError("");setMessage("Materialgrunnlag tømt");setTimeout(()=>setMessage(""),1500)
 }

 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.top}>
   <div><Link href="/admin" className={styles.back}>← Tilbake til backoffice</Link><span>AADLAND SERVICE · INTERNVERKTØY</span><h1>Materialkalkulator</h1><p>Ingen AI-kostnad. Du legger inn mål og materialvalg; faste formler regner ut behov, svinn, pakker, Bygger’n-pris og valgt materialpåslag.</p></div>
   <div className={styles.topActions}><label>Standard påslag <span><input inputMode="decimal" value={markup} onChange={e=>setMarkup(e.target.value)}/><b>%</b></span></label><button type="button" onClick={()=>document.getElementById("materials")?.scrollIntoView({behavior:"smooth"})}>Legg til materialer</button></div>
  </header>

  {(error||message)&&<div className={error?styles.error:styles.message}>{error||message}</div>}
  <div className={styles.setupReady}><strong>Gratis mengdemotor aktiv</strong><span>Faste beregningsregler · ingen API eller kreditter</span></div>

  <section className={styles.inputGrid}>
   <div className={styles.card}>
    <span className={styles.kicker}>1 · PROSJEKT</span><h2>Grunnlag</h2>
    <label>Prosjekt / kunde<input value={project} onChange={e=>setProject(e.target.value)} placeholder="F.eks. Bad Toppe"/></label>
    <label>Notater og øvrige fakta<textarea value={facts} onChange={e=>setFacts(e.target.value)} placeholder="F.eks. to lag gips, våtrom, kunde ønsker 48×98, spesielle hjørner osv."/></label>
   </div>
   <div className={styles.card}>
    <span className={styles.kicker}>2 · MÅL</span><h2>Mengdegrunnlag</h2>
    <div className={styles.basisGrid}>
     {SOURCE_FIELDS.map(field=><label key={field.id}>{field.label}<span><input inputMode="decimal" value={basis[field.id]??""} onChange={e=>updateBasis(field.id,e.target.value)} placeholder="0"/><b>{field.unit}</b></span></label>)}
     <label>Antall vegger<span><input inputMode="numeric" value={basis.wallCount??""} onChange={e=>updateBasis("wallCount",e.target.value)} placeholder="0"/><b>stk</b></span></label>
     <label>Antall rom<span><input inputMode="numeric" value={basis.roomCount??""} onChange={e=>updateBasis("roomCount",e.target.value)} placeholder="0"/><b>stk</b></span></label>
    </div>
    <p>Mål fra tegneprogrammet fylles automatisk. Du kan korrigere dem her før materialberegningen.</p>
   </div>
  </section>

  <section className={styles.supplierCard}>
   <div className={styles.sectionHead}><div><span className={styles.kicker}>3 · LEVERANDØRPRISER</span><h2>Dine innkjøpspriser</h2><p>Bygger’n er primær. Søk direkte i den felles prisbasen på materiallinjene nedenfor, eller importer en egen CSV lokalt. Valgt påslag er {decimal(number(markup),2)} %.</p></div><label className={styles.importBtn}>Importer prisfil<input type="file" accept=".csv,text/csv,.txt" onChange={importPriceFile}/></label></div>
   <div className={styles.supplierGrid}>{SUPPLIERS.map(s=>{const status=supplierStatuses.find(item=>item.id===s.id);return <div key={s.id}><strong>{s.name}</strong><span>{status?.mode||s.mode}</span><small>{s.note}</small><b className={status?.connected?styles.connected:undefined}>{status?.connected?"Direkte koblet ✓":"Prisfil / manuell pris"}</b></div>})}</div>
   <div className={styles.catalogStatus}><span>{sharedSuppliers.some(s=>s.isPrimary&&s.lastImportAt)?"Felles katalog: Bygger’n er importert":"Felles katalog: venter på import"} · {catalog.length?catalog.length+" varer i lokal CSV":"Ingen lokal CSV lastet"}</span><div>{catalog.length>0&&rows.length>0&&<button type="button" onClick={()=>{const count=matchAllPrices();setMessage(count?count+" materialer matchet mot prisbasen":"Fant ingen sikre treff");setTimeout(()=>setMessage(""),1800)}}>Match alle materialer</button>}{catalog.length>0&&<button type="button" onClick={clearCatalog}>Tøm prisbase</button>}</div></div>
   <p className={styles.fileHelp}>CSV kan ha kolonner som leverandør, varenr, produkt/navn, enhet, pris eks. mva eller pris inkl. mva, pakningsstørrelse og prisbasis.</p>
  </section>

  <section className={styles.result} id="materials">
   <div className={styles.sectionHead}><div><span className={styles.kicker}>4 · MATERIALER</span><h2>Materialbehov</h2><p>Velg en mal eller legg til en tom linje. Alle regnestykker vises, slik at du kan kontrollere hva kalkulatoren har gjort.</p></div><button type="button" onClick={()=>addRow()}>+ Tom materiallinje</button></div>
   <div className={styles.templateBar}>{TEMPLATES.map(template=><button type="button" key={template.label} onClick={()=>addRow(template.row)}>+ {template.label}</button>)}</div>
   {favorites.length>0&&<div className={styles.favoriteShelf}><div><strong>Mine materialer</strong><small>Lagrede regler, varenummer og pris</small></div><div>{favorites.map(favorite=><span key={favorite.id}><button type="button" onClick={()=>addRow(favorite.row,favorite.price)}>+ {favorite.name}</button><button type="button" aria-label={"Slett "+favorite.name} onClick={()=>removeFavorite(favorite.id)}>×</button></span>)}</div></div>}
   {!rows.length&&<div className={styles.emptyState}>Ingen materialer lagt inn. Velg en hurtigmal over.</div>}
   <div className={styles.lines}>{calculated.map(line=>{
    const p=prices[line.id]||{supplier:"Bygger’n"},cost=number(p.costExVat),priceBasis=p.priceBasis||((line.packages||0)>0?"package":"unit"),qty=priceBasis==="package"?number(line.packages):number(line.purchaseQuantity),sales=cost*(1+number(markup)/100),total=qty*sales,meta=sourceInfo(line.source);
    return <article key={line.id} className={styles.line} data-invalid={line.missing?"true":"false"}>
     <div className={styles.lineTop}><div><span className={styles.confidence} data-level={line.missing?"low":"high"}>{line.missing?"Mangler grunnlag":"Beregnet"}</span><h3>{line.material||"Nytt materiale"}</h3><p>{line.specification||"Fyll inn produkt/type"}</p></div><div className={styles.qty}><small>Innkjøpsbehov</small><strong>{line.ready?(line.packages>0?line.packages+" pk · ":"")+decimal(line.purchaseQuantity)+" "+line.unit:"—"}</strong></div></div>

     <div className={styles.materialIdentity}>
      <label>Materiale<input value={line.material} onChange={e=>updateRow(line.id,"material",e.target.value)} placeholder="F.eks. 13 mm gips"/></label>
      <label>Spesifikasjon<input value={line.specification} onChange={e=>updateRow(line.id,"specification",e.target.value)} placeholder="Dimensjon / produkt"/></label>
      <label>Beregningsregel<select value={line.rule} onChange={e=>updateRow(line.id,"rule",e.target.value)}>{RULES.map(rule=><option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
      {rooms.length>0&&<label>Område<select value={line.scope||"all"} onChange={e=>updateRow(line.id,"scope",e.target.value)}><option value="all">Hele prosjektet</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>}
      {line.rule!=="manual"&&<label>Grunnlag<select value={line.source} onChange={e=>updateRow(line.id,"source",e.target.value)}>{sourceOptions(line.rule).map(source=><option key={source.id} value={source.id}>{source.label}</option>)}</select></label>}
     </div>

     <div className={styles.ruleFields}>
      {line.rule==="sheet"&&<><label>Platebredde<span><input inputMode="decimal" value={line.sheetW} onChange={e=>updateRow(line.id,"sheetW",e.target.value)}/><b>mm</b></span></label><label>Platehøyde<span><input inputMode="decimal" value={line.sheetH} onChange={e=>updateRow(line.id,"sheetH",e.target.value)}/><b>mm</b></span></label><label>Antall lag<span><input inputMode="decimal" value={line.layers} onChange={e=>updateRow(line.id,"layers",e.target.value)}/><b>lag</b></span></label></>}
      {line.rule==="coverage"&&<><label>Dekning per enhet<span><input inputMode="decimal" value={line.coverage} onChange={e=>updateRow(line.id,"coverage",e.target.value)} placeholder="0"/><b>{meta.unit}</b></span></label><label>Antall lag<span><input inputMode="decimal" value={line.layers} onChange={e=>updateRow(line.id,"layers",e.target.value)}/><b>lag</b></span></label></>}
      {(line.rule==="per_area"||line.rule==="per_linear")&&<><label>Forbruk<span><input inputMode="decimal" value={line.factor} onChange={e=>updateRow(line.id,"factor",e.target.value)} placeholder="0"/><b>{line.unit}/{line.rule==="per_area"?"m²":"lm"}</b></span></label><label>Antall lag/ganger<span><input inputMode="decimal" value={line.layers} onChange={e=>updateRow(line.id,"layers",e.target.value)}/><b>×</b></span></label></>}
      {line.rule==="linear_piece"&&<><label>Lengde per stk<span><input inputMode="decimal" value={line.pieceLength} onChange={e=>updateRow(line.id,"pieceLength",e.target.value)} placeholder="4.4"/><b>m</b></span></label><label>Antall lag/ganger<span><input inputMode="decimal" value={line.layers} onChange={e=>updateRow(line.id,"layers",e.target.value)}/><b>×</b></span></label></>}
      {line.rule==="studs"&&<label>c/c-avstand<span><input inputMode="numeric" value={line.cc} onChange={e=>updateRow(line.id,"cc",e.target.value)}/><b>mm</b></span></label>}
      {line.rule==="battens_area"&&<><label>c/c-avstand<span><input inputMode="numeric" value={line.cc} onChange={e=>updateRow(line.id,"cc",e.target.value)}/><b>mm</b></span></label><label>Lengde per lekt<span><input inputMode="decimal" value={line.pieceLength} onChange={e=>updateRow(line.id,"pieceLength",e.target.value)} placeholder="4.8"/><b>m</b></span></label></>}
      {line.rule==="manual"&&<label>Teoretisk mengde<span><input inputMode="decimal" value={line.manualQty} onChange={e=>updateRow(line.id,"manualQty",e.target.value)} placeholder="0"/><b>{line.unit}</b></span></label>}
      <label>Enhet<span><input value={line.unit} onChange={e=>updateRow(line.id,"unit",e.target.value)} placeholder="stk"/><b>enhet</b></span></label>
      <label>Svinn<span><input inputMode="decimal" value={line.waste} onChange={e=>updateRow(line.id,"waste",e.target.value)}/><b>%</b></span></label>
      <label>Pakningsstørrelse<span><input inputMode="decimal" value={line.packageSize} onChange={e=>updateRow(line.id,"packageSize",e.target.value)} placeholder="1"/><b>{line.unit}</b></span></label>
     </div>

     <div className={styles.formulaBox}><small>REGNESTYKKE</small><b>{line.missing?line.missing:line.calculation}</b>{!line.missing&&<span>Teoretisk {decimal(line.requiredQuantity)} {line.unit} → + {decimal(number(line.waste),2)} % svinn → {line.packages>0?line.packages+" pakke(r), ":""}{decimal(line.purchaseQuantity)} {line.unit}</span>}</div>

     <div className={styles.priceGrid}>
      <label>Leverandør<select value={p.supplier||"Bygger’n"} onChange={e=>updatePrice(line.id,"supplier",e.target.value)}>{visibleSuppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></label>
      <label>Varenr.<input value={p.sku||""} onChange={e=>updatePrice(line.id,"sku",e.target.value)} placeholder="Valgfritt"/></label>
      <label>Innkjøpspris eks. mva<input inputMode="decimal" value={p.costExVat||""} onChange={e=>updatePrice(line.id,"costExVat",e.target.value)} placeholder="0,00"/></label>
      <label>Pris gjelder<select value={priceBasis} onChange={e=>updatePrice(line.id,"priceBasis",e.target.value)}><option value="unit">Per {line.unit}</option><option value="package">Per pakke</option></select></label>
      <div className={styles.priceActions}><button type="button" className={styles.matchBtn} onClick={()=>autoMatch(line)} disabled={!catalog.length}>Match lokal CSV</button><button type="button" className={styles.directBtn} onClick={()=>directLookup(line)} disabled={!p.supplier||directBusy===line.id||!supplierStatuses.find(s=>s.name===p.supplier)?.connected}>{directBusy===line.id?"Henter…":"Hent min pris"}</button></div>
     </div>
     {p.productName&&<p className={styles.matchInfo}>{p.direct?"Direkte pris":"Matchet"}: <b>{p.productName}</b>{p.sku?" · "+p.sku:""}</p>}
     <div className={styles.sharedCatalogBox}>
       <label htmlFor={"shared-catalog-"+line.id}>Søk i felles leverandørprisbase (gratis)</label>
       <div className={styles.sharedCatalogSearch}>
        <input id={"shared-catalog-"+line.id} value={sharedQueries[line.id]??(line.material||line.specification||"")} onChange={e=>setSharedQueries(current=>({...current,[line.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();lookupSharedPrice(line)}}} placeholder="Produktnavn, varenummer eller EAN" />
        <button type="button" disabled={sharedBusy===line.id} onClick={()=>lookupSharedPrice(line)}>{sharedBusy===line.id?"Søker …":"Finn varer"}</button>
       </div>
       {sharedErrors[line.id]&&<p className={styles.sharedCatalogError} role="status">{sharedErrors[line.id]}</p>}
       {(sharedMatches[line.id]||[]).length>0&&<div className={styles.sharedCatalogMatches}>{sharedMatches[line.id].map(product=><button type="button" key={product.supplierId+"-"+product.sku} onClick={()=>chooseSharedPrice(line,product)}><span><strong>{product.name}</strong><small>{product.supplierName} · varenr. {product.sku}</small></span><span><b>{money(product.costExVat)}</b><small>eks. mva / {product.unit||"stk"}</small></span></button>)}</div>}
       {p.shared&&<p className={styles.sharedCatalogSelected}>Hentet fra felles prisbase · {p.sku||"uten varenr."} · pris per {p.catalogUnit||"STK"}. Kontroller «Pris gjelder» før tilbud.</p>}
      </div>
      <div className={styles.priceSummary}><span>Kost: <b>{money(qty*cost)}</b></span><span>+ {decimal(number(markup),2)} %: <b>{money(sales)} / {priceBasis==="package"?"pk":line.unit}</b></span><strong>Tilbudslinje {money(total)} eks. mva</strong><button type="button" onClick={()=>saveFavorite(line)}>Lagre materiale</button><button type="button" onClick={()=>removeRow(line.id)}>Slett linje</button></div>
    </article>
   })}</div>

   {rows.length>0&&<div className={styles.totalBar}><div><span>Innkjøpskost eks. mva</span><b>{money(totals.cost)}</b></div><div><span>Materialer til kunde eks. mva</span><strong>{money(totals.sales)}</strong></div><button type="button" className={styles.secondaryAction} onClick={resetDraft}>Nytt grunnlag</button><button type="button" onClick={createQuote}>Opprett tilbudskladd →</button></div>}
  </section>
 </div></main>;
}
