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
 const change=(key,next)=>{setError("");onChange(current=>({...current,[key]:next}))};
 const submit=event=>{
  event.preventDefault();setError("");
  try{onCreate(value)}catch(err){setError(err?.message||"Kunne ikke opprette veggene.")}
 };
 const shape=KITCHEN_SHAPES.includes(value.shape)?value.shape:"straight";
 const back=Math.max(0,Number(value.backLength)||0),left=Math.max(0,Number(value.leftDepth)||0),right=Math.max(0,Number(value.rightDepth)||0);
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
     {shape==="u"&&<line x1="71" y1="125" x2="71" y2="40" stroke="#252a28" strokeWidth="10" strokeLinecap="square"/>}
     <line x1="71" y1="40" x2="249" y2="40" stroke="#252a28" strokeWidth="10" strokeLinecap="square"/>
     {shape!=="straight"&&<line x1="249" y1="40" x2="249" y2="125" stroke="#252a28" strokeWidth="10" strokeLinecap="square"/>}
     <text x="160" y="27" textAnchor="middle" fill="#755e37" fontSize="11" fontWeight="700">{back>0?back+" mm":"Bakvegg"}</text>
     {shape==="u"&&<text x="47" y="92" textAnchor="middle" fill="#755e37" fontSize="10" fontWeight="700" transform="rotate(-90 47 92)">{left>0?left+" mm":"Venstre"}</text>}
     {shape!=="straight"&&<text x="273" y="92" textAnchor="middle" fill="#755e37" fontSize="10" fontWeight="700" transform="rotate(90 273 92)">{right>0?right+" mm":"Høyre"}</text>}
     <text x="160" y="101" textAnchor="middle" fill="#577469" fontSize="12" fontWeight="700">KJØKKENSIDE</text>
    </svg>
    <div className={styles.roomModalGrid}>
     <label>Bakvegg – lengde (mm)<input type="number" inputMode="numeric" min="300" max="7000" required autoFocus value={value.backLength} onChange={e=>change("backLength",e.target.value)}/></label>
     {shape==="u"&&<label>Venstre sidevegg (mm)<input type="number" inputMode="numeric" min="300" max="7000" required value={value.leftDepth} onChange={e=>change("leftDepth",e.target.value)}/></label>}
     {shape!=="straight"&&<label>Høyre sidevegg (mm)<input type="number" inputMode="numeric" min="300" max="7000" required value={value.rightDepth} onChange={e=>change("rightDepth",e.target.value)}/></label>}
     <label>Vegghøyde (mm)<input type="number" inputMode="numeric" min="300" max="6000" required value={value.height} onChange={e=>change("height",e.target.value)}/></label>
     <label>Veggtykkelse (mm)<input type="number" inputMode="numeric" min="40" max="600" required value={value.thickness} onChange={e=>change("thickness",e.target.value)}/></label>
    </div>
    <p className={styles.kitchenWallHelp}>Målene gjelder lengden langs hver kjøkkenvegg. Skap monteres på innsiden og kan plasseres helt mot veggens ender. Du kan endre målene på veggene etterpå.</p>
    {error&&<p role="alert" className={styles.kitchenWallError}>{error}</p>}
    <div className={styles.roomModalActions}><button type="button" onClick={onCancel}>Avbryt</button><button type="submit">Lag {shape==="straight"?"én vegg":shape==="l"?"L-kjøkken":"U-kjøkken"}</button></div>
   </form>
  </section>
 </div>;
}
