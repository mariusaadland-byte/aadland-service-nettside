"use client";
import {useState} from "react";
import {KITCHEN_SHAPES} from "../../../lib/kitchenWallPresets";
const presets=[
 {id:"straight",icon:"━",title:"Én vegg",help:"Rett kjøkken"},
 {id:"l",icon:"┓",title:"L-vegg",help:"Bakvegg + høyre side"},
 {id:"u",icon:"∩",title:"U-vegg",help:"Bakvegg + to sider"}
];
export default function KitchenWallBuilder({value,onChange,onCancel,onCreate,styles}){
 const [error,setError]=useState("");
 const [includeCabinets,setIncludeCabinets]=useState(true);
 const change=(key,next)=>{setError("");onChange(current=>({...current,[key]:next}))};
 const submit=event=>{
  event.preventDefault();setError("");
  try{onCreate({...value,cabinetRuns:includeCabinets?cabinetRuns.map(run=>({wallLabel:run.wallLabel,start:run.start,widths:run.fit.widths})):[]})}catch(err){setError(err?.message||"Kunne ikke opprette veggene.")}
 };
 const shape=KITCHEN_SHAPES.includes(value.shape)?value.shape:"straight";
 const back=Math.max(0,Number(value.backLength)||0),left=Math.max(0,Number(value.leftDepth)||0),right=Math.max(0,Number(value.rightDepth)||0),lSide=value.lSide==="left"?"left":"right";
 const activeLeft=shape==="u"||shape==="l"&&lSide==="left"?left:0,activeRight=shape==="u"||shape==="l"&&lSide==="right"?right:0,previewScale=Math.min(178/Math.max(1,back),82/Math.max(1,activeLeft,activeRight)),previewBack=Math.max(1,back)*previewScale,previewX1=160-previewBack/2,previewX2=160+previewBack/2,previewY=40,previewLeftY=previewY+activeLeft*previewScale,previewRightY=previewY+activeRight*previewScale;
 const METOD_WIDTHS=[200,300,400,600,800,1000,1200],CORNER_RESERVE=875;
 const findCabinetFit=length=>{const target=Math.max(0,Math.floor(Number(length)||0)),dp=Array(target+1).fill(null);dp[0]=[];for(let sum=0;sum<=target;sum++){if(!dp[sum])continue;for(const width of METOD_WIDTHS){const next=sum+width;if(next<=target&&(!dp[next]||dp[next].length>dp[sum].length+1))dp[next]=[...dp[sum],width]}}let used=target;while(used>0&&!dp[used])used--;const widths=(dp[used]||[]).slice().sort((a,b)=>b-a);return{widths,remainder:target-used,used:widths.reduce((total,width)=>total+width,0),target}};
 const hasLeft=shape==="u"||shape==="l"&&lSide==="left",hasRight=shape==="u"||shape==="l"&&lSide==="right";
 const cabinetRuns=[{wallLabel:"Bakvegg",start:hasLeft?CORNER_RESERVE:0,fit:findCabinetFit(back-(hasLeft?CORNER_RESERVE:0)-(hasRight?CORNER_RESERVE:0))},...(hasLeft?[{wallLabel:"Venstre sidevegg",start:CORNER_RESERVE,fit:findCabinetFit(left-CORNER_RESERVE)}]:[]),...(hasRight?[{wallLabel:"Høyre sidevegg",start:CORNER_RESERVE,fit:findCabinetFit(right-CORNER_RESERVE)}]:[])];
 const cabinetFit=shape==="straight"&&back>=200?findCabinetFit(back):null;
 return <div className={styles.roomModalBackdrop} role="presentation" onPointerDown={event=>{if(event.target===event.currentTarget)onCancel()}}>
  <section className={styles.roomModal+" "+styles.kitchenWallModal} role="dialog" aria-modal="true" aria-label="Lag kjøkken med åpne vegger">
   <div className={styles.roomModalHead}><div><span>KJØKKENTEGNING</span><h2>Vegger uten helt rom</h2></div><button type="button" onClick={onCancel} aria-label="Lukk">×</button></div>
   <p className={styles.kitchenWallIntro}>Velg bare de veggene kjøkkenet skal stå mot. Du trenger ikke tegne fire vegger eller en romsone.</p>
   <form onSubmit={submit}>
    <div className={styles.kitchenWallPresets}>
     {presets.map(p=><button type="button" key={p.id} aria-pressed={shape===p.id} className={shape===p.id?styles.kitchenWallSelected:""} onClick={()=>change("shape",p.id)}><span aria-hidden="true">{p.icon}</span><strong>{p.title}</strong><small>{p.help}</small></button>)}
    </div>
    <svg className={styles.kitchenWallPreview} viewBox="0 0 320 160" role="img" aria-label={"Forhåndsvisning av "+(shape==="straight"?"rett vegg":shape==="l"?"L-vegg":"U-vegg")}>
     <rect width="320" height="160" rx="10" fill="#f7f5ef"/>
     {(shape==="u"||shape==="l"&&lSide==="left")&&<line x1={previewX1} y1={previewLeftY} x2={previewX1} y2={previewY} stroke="#252a28" strokeWidth="10" strokeLinecap="square"/>}
     <line x1={previewX1} y1={previewY} x2={previewX2} y2={previewY} stroke="#252a28" strokeWidth="10" strokeLinecap="square"/>
     {(shape==="u"||shape==="l"&&lSide==="right")&&<line x1={previewX2} y1={previewY} x2={previewX2} y2={previewRightY} stroke="#252a28" strokeWidth="10" strokeLinecap="square"/>}
     <text x="160" y="27" textAnchor="middle" fill="#755e37" fontSize="11" fontWeight="700">{back>0?back+" mm":"Bakvegg"}</text>
     {(shape==="u"||shape==="l"&&lSide==="left")&&<text x={previewX1-16} y={(previewY+previewLeftY)/2} textAnchor="middle" fill="#755e37" fontSize="10" fontWeight="700" transform={"rotate(-90 "+(previewX1-16)+" "+((previewY+previewLeftY)/2)+")"}>{left>0?left+" mm":"Venstre"}</text>}
     {(shape==="u"||shape==="l"&&lSide==="right")&&<text x={previewX2+16} y={(previewY+previewRightY)/2} textAnchor="middle" fill="#755e37" fontSize="10" fontWeight="700" transform={"rotate(90 "+(previewX2+16)+" "+((previewY+previewRightY)/2)+")"}>{right>0?right+" mm":"Høyre"}</text>}
     <text x="160" y="101" textAnchor="middle" fill="#577469" fontSize="12" fontWeight="700">KJØKKENSIDE</text>
    </svg>
    {shape==="l"&&<div className={styles.kitchenWallDirection}><span>Hvilken side skal L-veggen være på?</span><div><button type="button" aria-pressed={lSide==="left"} onClick={()=>change("lSide","left")}>← Venstre</button><button type="button" aria-pressed={lSide==="right"} onClick={()=>change("lSide","right")}>Høyre →</button></div></div>}
    <div className={styles.roomModalGrid}>
     <label>Bakvegg – lengde (mm)<input type="number" inputMode="numeric" min="300" max="7000" required autoFocus value={value.backLength} onChange={e=>change("backLength",e.target.value)}/></label>
     {(shape==="u"||shape==="l"&&lSide==="left")&&<label>Venstre sidevegg (mm)<input type="number" inputMode="numeric" min="300" max="7000" required value={value.leftDepth} onChange={e=>change("leftDepth",e.target.value)}/></label>}
     {(shape==="u"||shape==="l"&&lSide==="right")&&<label>Høyre sidevegg (mm)<input type="number" inputMode="numeric" min="300" max="7000" required value={value.rightDepth} onChange={e=>change("rightDepth",e.target.value)}/></label>}
     <label>Vegghøyde (mm)<input type="number" inputMode="numeric" min="300" max="6000" required value={value.height} onChange={e=>change("height",e.target.value)}/></label>
     <label>Veggtykkelse (mm)<input type="number" inputMode="numeric" min="40" max="600" required value={value.thickness} onChange={e=>change("thickness",e.target.value)}/></label>
    </div>
    <div className={styles.kitchenWallHelp}><strong>Forslag til METOD-benkeskap</strong>{cabinetRuns.map(run=><p key={run.wallLabel}><b>{run.wallLabel}:</b> {run.fit.widths.length?run.fit.widths.map(width=>width+" mm").join(" + "):"ingen standardmodul passer"}<br/>Skap: {run.fit.used} mm av {run.fit.target} mm{run.fit.remainder>0?" · "+run.fit.remainder+" mm fri til foring/tilpasning":" · fyller tilgjengelig lengde"}{run.start>0?" · starter "+run.start+" mm fra hjørnet":""}</p>)}<label><input type="checkbox" checked={includeCabinets} onChange={e=>setIncludeCabinets(e.target.checked)}/> Plasser benkeskapene automatisk i tegningen</label><small>Ved L- og U-kjøkken holdes 875 mm fri ved hvert innerhjørne for å unngå at automatiske skap kolliderer. Hjørneskap settes ikke inn automatisk. Kontroller hjørneløsning, hvitevarer, vask og monteringsmål før bestilling.</small></div>
    <p className={styles.kitchenWallHelp}>Målene gjelder lengden langs hver kjøkkenvegg. Skap monteres på innsiden og kan plasseres helt mot veggens ender. Du kan endre målene på veggene etterpå.</p>
    {error&&<p role="alert" className={styles.kitchenWallError}>{error}</p>}
    <div className={styles.roomModalActions}><button type="button" onClick={onCancel}>Avbryt</button><button type="submit">Lag {shape==="straight"?"én vegg":shape==="l"?"L-kjøkken":"U-kjøkken"}</button></div>
   </form>
  </section>
 </div>;
}
