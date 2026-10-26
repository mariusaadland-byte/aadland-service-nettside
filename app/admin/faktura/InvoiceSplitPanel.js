"use client";
import {useState} from "react";
const addDays=(date,days)=>{
 const t=new Date(date+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+days);return t.toISOString().slice(0,10);
};
const terms=[7,14,21,30,45,60];
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
const total=lines=>(lines||[]).reduce((sum,l)=>{
 const base=Math.round(Number(l.quantity)*Number(l.unitPriceOre));
 return sum+base+Math.round(base*Number(l.vatRate)/100);
},0);
export default function InvoiceSplitPanel({invoice,today,disabled=false,onPrepare,onCreated}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const [firstPercent,setFirstPercent]=useState(50);
 const [firstSendOn,setFirstSendOn]=useState(today);
 const [secondSendOn,setSecondSendOn]=useState(addDays(today,14));
 const [firstTermsDays,setFirstTermsDays]=useState(14),[secondTermsDays,setSecondTermsDays]=useState(14);
 const [autoSendSecond,setAutoSendSecond]=useState(false),[confirmedDelivery,setConfirmedDelivery]=useState(false);
 const [error,setError]=useState("");
 if(invoice.status!=="draft"||invoice.split_group_id||invoice.source_quote_id||
  invoice.installment_index>0)return null;
 const amount=total(invoice.line_items),workDate=invoice.customer?.workDate||"";
 async function submit(event){
  event.preventDefault();if(busy||disabled)return;
  setError("");
  if(!confirmedDelivery){setError("Bekreft leveringsdato og at faktureringsdatoene er lovlige for arbeidet.");return;}
  if(!firstSendOn||!secondSendOn||secondSendOn<=firstSendOn){
   setError("Del 2 må ha en senere sendingsdato enn del 1.");return;
  }
  if(firstSendOn<today||Number(firstPercent)<1||Number(firstPercent)>99){
   setError("Velg gyldige datoer og prosentfordeling.");return;
  }
  if(!workDate){setError("Oppgi og lagre faktisk leveringsdato før du deler fakturaen.");return;}
  const message="Opprette TO fakturakladder fra "+invoice.title+" på "+money(amount)+
   "?\n\nDel 1: "+firstPercent+" % · planlagt "+firstSendOn+" · "+firstTermsDays+
   " dager betalingsfrist (sendes manuelt)."+
   "\nDel 2: "+(100-firstPercent)+" % · "+secondSendOn+" · "+secondTermsDays+
   " dager betalingsfrist"+(autoSendSecond?" · SENDES AUTOMATISK":" · sendes manuelt")+
   ".\n\nBegge fakturaene får egne fakturanumre først ved utstedelse. Kundens e-post får ingen melding ved delingen. Oppdelingen kan ikke angres automatisk.";
  if(!window.confirm(message))return;
  setBusy(true);
  try{
   await onPrepare?.();
   const response=await fetch("/api/admin/invoices/split",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({confirmed:true,invoiceId:invoice.id,firstPercent:Number(firstPercent),
     firstSendOn,secondSendOn,firstTermsDays:Number(firstTermsDays),secondTermsDays:Number(secondTermsDays),
     autoSendSecond})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"Delingen kunne ikke lagres.");
   if(!result.split?.firstId||!result.split?.secondId)throw Error("Deling er ikke bekreftet. Oppdater fakturaoversikten.");
   await onCreated?.(result.split);
   setOpen(false);
  }catch(e){setError(e.message||"Kunne ikke dele fakturaen. Oppdater og kontroller status før nytt forsøk.");}
  finally{setBusy(false);}
 }
 return <section style={{border:"1px solid #b58b47",borderRadius:12,padding:14,margin:"16px 0",background:"#fffdfa"}}
  aria-label="Del faktura i to">
  <button type="button" disabled={disabled||busy} aria-expanded={open}
   onClick={()=>setOpen(v=>!v)} style={{fontWeight:800}}>
   {open?"Lukk deling":"Del faktura i 2 – ulike datoer og betalingsfrister"}
  </button>
  {open&&<form onSubmit={submit} style={{display:"grid",gap:12,marginTop:12}}>
   <p style={{fontSize:13,margin:0}}>Dette lager to separate fakturakladder, ikke to betalingskrav på samme fakturanummer.
    Velg 50/50 eller en annen prosentfordeling. Totalen inkl. MVA beholdes.
    Del 1 sendes manuelt, del 2 kan sendes automatisk på valgt dato.</p>
   <label>Del 1 – prosentandel
    <input type="number" min={1} max={99} step={1} required value={firstPercent}
     onChange={e=>setFirstPercent(e.target.value)} disabled={busy||disabled}/>
   </label>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
    <fieldset style={{border:"1px solid #ddd",borderRadius:8,padding:12}}>
     <legend><strong>Faktura 1 ({firstPercent||0} %)</strong></legend>
     <label>Planlagt dato (manuell utsendelse)
      <input type="date" required min={today} value={firstSendOn} disabled={busy||disabled}
       onChange={e=>setFirstSendOn(e.target.value)}/>
     </label>
     <label>Betalingsfrist (dager)
      <select value={firstTermsDays} onChange={e=>setFirstTermsDays(Number(e.target.value))}
       disabled={busy||disabled}>{terms.map(n=><option key={n} value={n}>{n} dager</option>)}</select>
     </label>
     <p style={{fontSize:12}}>Forventet forfall: {firstSendOn?addDays(firstSendOn,firstTermsDays):"–"}.
      Faktisk forfall settes ut fra utstedelsesdatoen.</p>
    </fieldset>
    <fieldset style={{border:"1px solid #ddd",borderRadius:8,padding:12}}>
     <legend><strong>Faktura 2 ({100-(Number(firstPercent)||0)} %)</strong></legend>
     <label>Utsendelsesdato
      <input type="date" required min={addDays(firstSendOn||today,1)} value={secondSendOn}
       onChange={e=>setSecondSendOn(e.target.value)} disabled={busy||disabled}/>
     </label>
     <label>Betalingsfrist (dager)
      <select value={secondTermsDays} onChange={e=>setSecondTermsDays(Number(e.target.value))}
       disabled={busy||disabled}>{terms.map(n=><option key={n} value={n}>{n} dager</option>)}</select>
     </label>
     <p style={{fontSize:12}}>Forventet forfall: {secondSendOn?addDays(secondSendOn,secondTermsDays):"–"}.</p>
     <label style={{fontWeight:700,display:"block"}}>
      <input type="checkbox" checked={autoSendSecond} disabled={busy||disabled}
       onChange={e=>setAutoSendSecond(e.target.checked)}/>
      Send faktura 2 automatisk på utsendelsesdatoen
     </label>
    </fieldset>
   </div>
   <p style={{margin:0,fontSize:13}}>Beløp totalt: <strong>{money(amount)}</strong>.
    Fakturaene kan ikke endres i beløp etter oppdelingen. Kontroller derfor alle linjer og kundeopplysninger først.
    Automatisk e-post sendes ved den daglige kjøringen (ikke ved et bestemt klokkeslett).</p>
   <p style={{fontSize:12,margin:0}}>Leveringsdato i kladden: <strong>{workDate||"Mangler"}</strong>.
    For vanlig arbeid kreves levering før fakturering og normalt fakturering innen en måned. Deling er ikke
    en måte å utsette MVA eller fakturering ut over regelverket.</p>
   <label style={{fontSize:13}}><input type="checkbox" checked={confirmedDelivery}
    disabled={busy||disabled} onChange={e=>setConfirmedDelivery(e.target.checked)}/>
    Jeg bekrefter at faktureringen gjelder faktisk levert arbeid og at datoene er korrekte.
   </label>
   <button type="submit" disabled={busy||disabled||!confirmedDelivery||!workDate}>
    {busy?"Oppretter fakturakladder …":"Bekreft og del fakturaen"}
   </button>
  </form>}
  {error&&<p role="alert" style={{color:"#a52a21",fontSize:13}}>{error}</p>}
 </section>;
}
