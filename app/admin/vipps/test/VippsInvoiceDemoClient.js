"use client";
import {useState} from "react";
import {DEMO_START_ORE,createVippsDemo,advanceVippsDemo,canRunVippsDemo,vippsDemoTotals} from "../../../../lib/vippsInvoiceDemo";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore)/100);
const statusLabels={
 idle:"Ikke startet",pending:"Venter på betaling",partial:"Delbetalt",paid:"Betalt",
 cancelled:"Avbrutt",refunded:"Refundert"
};
const actionButtons=[
 {id:"partial",label:"Simuler delbetaling (40 %)",hint:"Registrerer en del av beløpet"},
 {id:"full",label:"Simuler full betaling",hint:"Registrerer det som gjenstår"},
 {id:"cancel",label:"Simuler avbrutt betaling",hint:"Ingen penger registreres"},
 {id:"refund-part",label:"Simuler delvis refusjon",hint:"Halvparten av netto betalt tilbake"},
 {id:"refund-all",label:"Simuler full refusjon",hint:"Hele betalte beløpet tilbake"}
];
const receiptButtons=[
 {id:"receipt-error",label:"Simuler feil ved kvittering"},
 {id:"receipt-sent",label:"Simuler vellykket kvittering"}
];

export default function VippsInvoiceDemoClient(){
 const [amountText,setAmountText]=useState(String(DEMO_START_ORE/100));
 const [demo,setDemo]=useState(()=>createVippsDemo());
 const [error,setError]=useState("");
 const totals=vippsDemoTotals(demo);
 const started=demo.state!=="idle";
 function simulate(action){
  setError("");
  if(action==="start"){
   const kr=Number(amountText.trim().replace(",","."));
   const ore=Math.round(kr*100);
   if(!Number.isFinite(kr)||!Number.isSafeInteger(ore)){
    setError("Oppgi et gyldig beløp.");return;
   }
   try{setDemo(advanceVippsDemo(createVippsDemo(ore),"start"));}
   catch(e){setError(e.message);}
   return;
  }
  setDemo(current=>advanceVippsDemo(current,action));
 }
 function reset(){
  setDemo(createVippsDemo());setAmountText(String(DEMO_START_ORE/100));setError("");
 }
 return <>
  <section className="card" style={{marginBottom:18,border:"2px solid #c99a49",padding:22}}>
   <div className="kicker">KUN DEMO – 100 % LOKAL</div>
   <h2 style={{marginTop:5}}>Fakturaeksempel</h2>
   <p><strong>Kunde:</strong> Eksempelkunde (fiktiv) · <strong>Faktura:</strong> DEMO-001</p>
   <label style={{display:"grid",gap:6,maxWidth:340}}>
    Fakturabeløp inkludert mva. (kr)
    <input type="text" inputMode="decimal" value={amountText} disabled={started} onChange={e=>setAmountText(e.target.value)} aria-label="Simulert fakturabeløp i kroner"/>
   </label>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:16}}>
    <button type="button" className="btn" disabled={started} onClick={()=>simulate("start")}>Start prøvekjøring</button>
    <button type="button" className="btn alt" onClick={reset}>Nullstill demo</button>
   </div>
   {error&&<p role="alert" className="notice">{error}</p>}
   <p className="muted" style={{fontSize:13,marginBottom:0}}>Du endrer bare en simulert saldo på denne siden. Ingen knapper her kontakter Vipps, oppretter betalingslenker, sender e-post eller skriver til fakturaregisteret.</p>
  </section>

  <section className="card" style={{padding:22,marginBottom:18}}>
   <h2>Betalingsstatus</h2>
   <p role="status" aria-live="polite" style={{fontSize:18,fontWeight:800,margin:"8px 0 16px"}}>{statusLabels[demo.state]}</p>
   <dl style={{display:"grid",gridTemplateColumns:"minmax(140px,1fr) auto",gap:"10px 16px",maxWidth:560}}>
    <dt>Fakturabeløp</dt><dd style={{margin:0,textAlign:"right"}}>{money(totals.amountOre)}</dd>
    <dt>Trukket i simuleringen</dt><dd style={{margin:0,textAlign:"right"}}>{money(totals.capturedOre)}</dd>
    <dt>Refundert i simuleringen</dt><dd style={{margin:0,textAlign:"right"}}>{money(totals.refundedOre)}</dd>
    <dt>Netto registrert</dt><dd style={{margin:0,textAlign:"right"}}>{money(totals.netOre)}</dd>
    <dt style={{fontWeight:800}}>Gjenstår på fakturaen</dt><dd style={{margin:0,textAlign:"right",fontWeight:800}}>{money(totals.outstandingOre)}</dd>
   </dl>
   <div style={{height:12,borderRadius:20,background:"#e3ded3",overflow:"hidden",maxWidth:560,marginTop:14}}>
    <div style={{height:"100%",width:(totals.netOre/totals.amountOre*100).toFixed(2)+"%",background:"#857047",transition:"width 0.15s"}}/>
   </div>
   <p className="muted" style={{fontSize:12}}>Linjen viser hvor stor del av den fiktive fakturaen som fortsatt er betalt etter eventuelle refusjoner.</p>
  </section>

  <section className="card" style={{padding:22,marginBottom:18}}>
   <h2>Simuler en hendelse</h2>
   <p className="muted">Knappene som er mulige i det valgte steget kan brukes. Prøv for eksempel delbetaling → kvitteringsfeil → kvittering bekreftet → refusjon.</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
    {actionButtons.map(action=><button key={action.id} type="button" className="btn alt" disabled={!canRunVippsDemo(demo,action.id)} onClick={()=>simulate(action.id)} title={action.hint}>{action.label}</button>)}
   </div>
   {demo.state==="partial"&&demo.refundedOre>0&&<p className="muted" style={{fontSize:13}}>Ved en delvis refusjon blir restbeløpet større. Nullstill demoen for å prøve en ny betalingsrunde. Ekte Vipps-forsøk har egne referanser.</p>}
  </section>

  <section className="card" style={{padding:22,marginBottom:18}}>
   <div className="kicker">FORHÅNDSVISNING – INGEN E-POST SENDES</div>
   <h2>Simulert kvittering</h2>
   {!totals.capturedOre?<p className="muted">Når du simulerer en betaling, kan du se hvordan kvittering og restbeløp vil fremstå.</p>:<>
    <div style={{border:"1px solid #ddd4c5",borderRadius:8,background:"#fff",color:"#221e17",padding:18,maxWidth:620}}>
     <strong>{totals.outstandingOre>0?"KVITTERING – DELBETALING":"KVITTERING"}</strong>
     <p style={{margin:"10px 0"}}>Faktura DEMO-001 · Eksempelkunde</p>
     <p><b>{totals.outstandingOre>0?"Delbetalt med Vipps":"Betalt med Vipps"}:</b> {money(totals.capturedOre)}</p>
     {totals.refundedOre>0&&<p><b>Senere refundert:</b> {money(totals.refundedOre)}</p>}
     <p><b>Gjenstående på fakturaen:</b> {money(totals.outstandingOre)}</p>
     <p style={{fontSize:13}}>{totals.outstandingOre>0?"Dette er en delbetaling, ikke en fullt betalt faktura.":"Hele fakturaen er registrert som betalt."}</p>
     {totals.refundedOre>0&&<p style={{fontSize:12}}>En faktisk allerede sendt kvittering ville ikke blitt endret i ettertid. Refusjoner må behandles som egne hendelser.</p>}
    </div>
    <p role="status" style={{fontWeight:700}}>Kvitteringsstatus (kun demo): {demo.receiptState==="pending"?"Venter på bekreftelse":demo.receiptState==="failed"?"Feilet – forsøk på nytt":demo.receiptState==="sent"?"Bekreftet sendt i simuleringen":"Ingen kvittering"}</p>
    <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
     {receiptButtons.map(action=><button key={action.id} type="button" className="btn alt" disabled={!canRunVippsDemo(demo,action.id)} onClick={()=>simulate(action.id)}>{action.label}</button>)}
    </div>
    {demo.receiptState==="failed"&&<p className="muted">Betalingen er fremdeles registrert. En kvitteringsfeil betyr ikke at kunden skal betale igjen.</p>}
   </>}
  </section>
  <p className="muted">Denne prøvekjøringen illustrerer visningen og reglene for betalingsstatus. Den er ikke en test mot Vipps sitt betalings-API, webhook eller e-postleverandøren.</p>
 </>;
}
