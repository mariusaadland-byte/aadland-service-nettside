"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./drawing.module.css";

const SCALE=0.12, GRID=100;
const catalog=[
["door","Dør",900,100],["window","Vindu",1200,100],["stairs","Trapp",900,2500],
["toilet","Toalett",400,700],["shower","Dusj",900,900],["bath","Badekar",750,1700],["sink","Servant",600,500],
["base","Kjøkkenskap",600,600],["fridge","Kjøleskap",600,600],["oven","Komfyr",600,600],["island","Kjøkkenøy",1800,900],
["sofa","Sofa",2200,900],["table","Spisebord",1800,900],["bed","Seng",1800,2000],["wardrobe","Garderobe",1200,600],
["post","Stolpe",98,98],["bench","Benk",1800,500],["planter","Plantekasse",1200,450]
];
const labelFor=t=>catalog.find(x=>x[0]===t)?.[1]||t;
const uid=()=>Math.random().toString(36).slice(2,10);
export default function DrawingClient(){
 const [walls,setWalls]=useState([]),[items,setItems]=useState([]),[selected,setSelected]=useState(null),[name,setName]=useState("Ny tegning"),[draft,setDraft]=useState(null);
 const svg=useRef(null);
 useEffect(()=>{try{const x=JSON.parse(localStorage.getItem("aadlandDrawing")||"null");if(x){setWalls(x.walls||[]);setItems(x.items||[]);setName(x.name||"Ny tegning")}}catch{}},[]);
 const save=()=>{localStorage.setItem("aadlandDrawing",JSON.stringify({name,walls,items}));alert("Tegningen er lagret på denne enheten.")};
 const pt=e=>{const r=svg.current.getBoundingClientRect();return{x:(e.clientX-r.left)/SCALE,y:(e.clientY-r.top)/SCALE}};
 const clickCanvas=e=>{if(e.target!==svg.current)return;const p=pt(e);if(!draft){setDraft(p);setSelected(null)}else{setWalls(v=>[...v,{id:uid(),x1:draft.x,y1:draft.y,x2:p.x,y2:p.y,t:98,h:2400}]);setDraft(null)}};
 const addItem=(type,w,h)=>{setItems(v=>[...v,{id:uid(),type,x:1800,y:1400,w,h,rot:0}])};
 const sel=useMemo(()=>selected?.kind==="wall"?walls.find(x=>x.id===selected.id):selected?.kind==="item"?items.find(x=>x.id===selected.id):null,[selected,walls,items]);
 const wallLen=w=>Math.round(Math.hypot(w.x2-w.x1,w.y2-w.y1));
 const update=(key,val)=>{const n=Number(val);if(selected?.kind==="item")setItems(v=>v.map(x=>x.id===selected.id?{...x,[key]:n}:x));if(selected?.kind==="wall")setWalls(v=>v.map(x=>{if(x.id!==selected.id)return x;if(key==="len"){const a=Math.atan2(x.y2-x.y1,x.x2-x.x1);return{...x,x2:x.x1+n*Math.cos(a),y2:x.y1+n*Math.sin(a)}}return{...x,[key]:n}}))};
 const remove=()=>{if(selected?.kind==="wall")setWalls(v=>v.filter(x=>x.id!==selected.id));else setItems(v=>v.filter(x=>x.id!==selected.id));setSelected(null)};
 const room=()=>{const w=Number(prompt("Romlengde i mm","4000")),h=Number(prompt("Rombredde i mm","3000"));if(!w||!h)return;const x=700,y=700;setWalls([{id:uid(),x1:x,y1:y,x2:x+w,y2:y,t:98,h:2400},{id:uid(),x1:x+w,y1:y,x2:x+w,y2:y+h,t:98,h:2400},{id:uid(),x1:x+w,y1:y+h,x2:x,y2:y+h,t:98,h:2400},{id:uid(),x1:x,y1:y+h,x2:x,y2:y,t:98,h:2400}]);};
 return <main className={styles.shell}>
  <header className={styles.top}><Link href="/admin">← Backoffice</Link><strong>Tegning & visualisering</strong><input value={name} onChange={e=>setName(e.target.value)}/><button className={styles.btn} onClick={save}>Lagre</button><button className={styles.btn} onClick={()=>window.print()}>Skriv ut / PDF</button></header>
  <div className={styles.layout}>
   <aside className={styles.panel}><div className={styles.group}><h2>Rom og vegger</h2><div className={styles.row}><button className={styles.btn} onClick={room}>Nytt rom etter mål</button><button className={styles.btn} onClick={()=>setDraft(null)}>Avbryt vegg</button></div><p className={styles.muted}>Klikk to steder på arket for å tegne en vegg. Velg veggen etterpå og skriv inn nøyaktig lengde, tykkelse og høyde.</p></div>
   <div className={styles.group}><h2>Objektbibliotek</h2><div className={styles.library}>{catalog.map(([t,l,w,h])=><button key={t} onClick={()=>addItem(t,w,h)}>{l}<br/><small>{w} × {h} mm</small></button>)}</div></div></aside>
   <section className={styles.workspace}><div className={styles.canvasWrap}><svg ref={svg} className={styles.canvas} width={720} height={720} viewBox="0 0 6000 6000" onClick={clickCanvas}>
    <defs><pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={"M "+GRID+" 0 L 0 0 0 "+GRID} fill="none" stroke="#ece9e1" strokeWidth="6"/></pattern></defs><rect width="6000" height="6000" fill="url(#grid)"/>
    {walls.map(w=><g key={w.id} onClick={e=>{e.stopPropagation();setSelected({kind:"wall",id:w.id})}} style={{cursor:"pointer"}}><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={selected?.id===w.id?"#9b7a39":"#222"} strokeWidth={Math.max(35,w.t)} strokeLinecap="square"/><text x={(w.x1+w.x2)/2} y={(w.y1+w.y2)/2-80} textAnchor="middle" fontSize="105" fill="#555">{wallLen(w)} mm</text></g>)}
    {items.map(o=><g key={o.id} transform={"translate("+o.x+" "+o.y+") rotate("+o.rot+" "+o.w/2+" "+o.h/2+")"} onClick={e=>{e.stopPropagation();setSelected({kind:"item",id:o.id})}} style={{cursor:"pointer"}}><rect width={o.w} height={o.h} rx="30" fill={selected?.id===o.id?"#eadcbf":"#f5f1e7"} stroke="#51462f" strokeWidth="18"/><text x={o.w/2} y={o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize="100">{labelFor(o.type)}</text></g>)}
    {draft&&<circle cx={draft.x} cy={draft.y} r="45" fill="#9b7a39"/>}
   </svg></div></section>
   <aside className={styles.panel+" "+styles.right}><h2>Egenskaper</h2>{!sel?<p className={styles.muted}>Velg en vegg eller et objekt for å angi eksakte mål.</p>:selected.kind==="wall"?<><div className={styles.field}><label>Lengde (mm)</label><input type="number" value={wallLen(sel)} onChange={e=>update("len",e.target.value)}/></div><div className={styles.field}><label>Veggtykkelse (mm)</label><input type="number" value={sel.t} onChange={e=>update("t",e.target.value)}/></div><div className={styles.field}><label>Vegghøyde (mm)</label><input type="number" value={sel.h} onChange={e=>update("h",e.target.value)}/></div></>:<><h3>{labelFor(sel.type)}</h3>{[["Bredde","w"],["Dybde/lengde","h"],["X-posisjon","x"],["Y-posisjon","y"],["Rotasjon °","rot"]].map(([l,k])=><div className={styles.field} key={k}><label>{l} (mm)</label><input type="number" value={sel[k]} onChange={e=>update(k,e.target.value)}/></div>)}</>} {sel&&<button className={styles.btn+" "+styles.danger} onClick={remove}>Slett valgt</button>}
   <div className={styles.group} style={{marginTop:28}}><h2>AI-visualisering</h2><p className={styles.muted}>Neste trinn kobler prosjekttegningen og kundebilder til AI-visualisering av terrasse, rom, bad og andre forslag. Tegningen beholdes som målgrunnlag; AI-bilder blir merket som illustrasjon.</p></div></aside>
  </div>
 </main>
}