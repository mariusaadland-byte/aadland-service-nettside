"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./calculator.module.css";

const STORAGE_KEY="aadland-service-calculator-v1";
const VAT_RATE=0.25;
const DEFAULTS={
 project:"",
 hours:"8",
 hourlyRate:"500",
 fixedLabor:"",
 materialCost:"",
 materialMarkup:"15",
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

 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
   if(saved&&typeof saved==="object")setForm({...DEFAULTS,...saved});
  }catch{}
 },[]);

 useEffect(()=>{
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(form));}catch{}
 },[form]);

 function set(name,value){
  setForm(current=>({...current,[name]:value}));
 }
 function reset(){
  setForm(DEFAULTS);
  setCopied(false);
 }

 const calc=useMemo(()=>{
  const hours=number(form.hours);
  const hourlyRate=number(form.hourlyRate);
  const fixedLabor=number(form.fixedLabor);
  const labor=fixedLabor>0?fixedLabor:hours*hourlyRate;

  const materialCost=number(form.materialCost);
  const markup=number(form.materialMarkup);
  const materials=materialCost*(1+markup/100);

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

  return {hours,hourlyRate,fixedLabor,labor,materialCost,markup,materials,oneWayDistance,trips,totalKm,travel,tollPerWay,toll,total,exVat,vat,preset};
 },[form]);

 const primaryTotal=form.businessExVat?calc.exVat:calc.total;
 const primaryLabel=form.businessExVat?"Sum eks. mva":"Sum inkl. mva";

 async function copySummary(){
  const lines=[
   form.project?form.project:"Prisberegning",
   "Arbeid: "+money(calc.labor),
   "Materialer inkl. påslag: "+money(calc.materials),
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
     <p>Regn arbeid, materialer, kjøring og bom i én kalkyle. Alle prisfelt er satt opp som beløp til kunde inkl. mva.</p>
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
     <div className={styles.cardHead}><span className={styles.step}>2</span><div><h2>Materialer</h2><p>Materialer holdes som egen linje i sammendraget.</p></div></div>
     <Field label="Materialkost inkl. mva">
      <div className={styles.moneyInput}><span>kr</span><input inputMode="decimal" value={form.materialCost} onChange={e=>set("materialCost",e.target.value)} placeholder="0"/></div>
     </Field>
     <Field label="Materialpåslag" help={"Kalkulert salgspris: "+money(calc.materials)}>
      <div className={styles.suffixInput}><input inputMode="decimal" value={form.materialMarkup} onChange={e=>set("materialMarkup",e.target.value)}/><span>%</span></div>
     </Field>
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
