"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./drawing.module.css";

const GRID=100, VIEW=8000, STORE="aadlandDrawingsV2";
const catalog=[
 {group:"Bygg",items:[["door","Dør",900,100],["sliding","Skyvedør",1800,100],["window","Vindu",1200,100],["stairs","Trapp",900,2500],["post","Stolpe",98,98]]},
 {group:"Bad",items:[["toilet","Toalett",400,700],["walltoilet","Vegghengt toalett",400,600],["shower","Dusj",900,900],["bath","Badekar",750,1700],["sink","Servant",600,500],["washer","Vaskemaskin",600,600]]},
 {group:"Kjøkken",items:[["base","Benkeskap",600,600],["wallcab","Overskap",600,350],["tallcab","Høyskap",600,600],["fridge","Kjøleskap",600,600],["oven","Komfyr",600,600],["dishwasher","Oppvaskmaskin",600,600],["island","Kjøkkenøy",1800,900]]},
 {group:"Møbler",items:[["sofa","Sofa",2200,900],["table","Spisebord",1800,900],["chair","Stol",500,500],["bed","Seng",1800,2000],["wardrobe","Garderobe",1200,600],["tv","TV",1200,120]]},
 {group:"Ute",items:[["deck","Terrassefelt",3000,3000],["railing","Rekkverk",2000,100],["screen","Levegg",1800,100],["bench","Benk",1800,500],["planter","Plantekasse",1200,450]]}
];
const flat=catalog.flatMap(g=>g.items), labelFor=t=>flat.find(x=>x[0]===t)?.[1]||t;
const uid=()=>crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
const snap=n=>Math.round(n/GRID)*GRID;
const len=w=>Math.round(Math.hypot(w.x2-w.x1,w.y2-w.y1));
const angle=w=>Math.round(Math.atan2(w.y2-w.y1,w.x2-w.x1)*180/Math.PI*10)/10;
const wallOffset=(o,w)=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,L=Math.hypot(dx,dy)||1;return Math.round(((o.x+o.w/2-w.x1)*dx+(o.y+o.h/2-w.y1)*dy)/L)};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const initial=()=>({id:uid(),name:"Ny tegning",projectId:"",customer:"",address:"",notes:"",walls:[],items:[]});
const wallTypes=new Set(["door","sliding","window","railing","screen"]);
function nearestWall(o,walls){
 let best=null;
 for(const w of walls){const dx=w.x2-w.x1,dy=w.y2-w.y1,L2=dx*dx+dy*dy;if(!L2)continue;let t=((o.x-w.x1)*dx+(o.y-w.y1)*dy)/L2;t=Math.max(0,Math.min(1,t));const x=w.x1+t*dx,y=w.y1+t*dy,dist=Math.hypot(o.x-x,o.y-y);if(!best||dist<best.dist)best={wall:w,x,y,dist,t};}
 return best;
}

export default function DrawingClient(){
 const [docs,setDocs]=useState([]),[doc,setDoc]=useState(initial),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[tool,setTool]=useState("select"),[drag,setDrag]=useState(null),[history,setHistory]=useState([]),[message,setMessage]=useState(""),[projects,setProjects]=useState([]);
 const svg=useRef(null);
 useEffect(()=>{try{const d=JSON.parse(localStorage.getItem(STORE)||"[]");if(d.length){setDocs(d);setDoc(d[0])}else{const old=JSON.parse(localStorage.getItem("aadlandDrawing")||"null");if(old)setDoc({...initial(),...old})}}catch{} fetch("/api/admin/projects").then(r=>r.ok?r.json():null).then(x=>setProjects(x?.projects||[])).catch(()=>{});},[]);
 const persist=(next=doc)=>{const list=[...docs.filter(x=>x.id!==next.id),next];setDocs(list);localStorage.setItem(STORE,JSON.stringify(list));setMessage("Lagret");setTimeout(()=>setMessage(""),1500)};
 const checkpoint=()=>setHistory(h=>[...h.slice(-24),JSON.stringify(doc)]);
 const mutate=fn=>{checkpoint();setDoc(d=>fn(d))};
 const undo=()=>{const last=history.at(-1);if(!last)return;setDoc(JSON.parse(last));setHistory(h=>h.slice(0,-1));setSelected(null)};
 const point=e=>{const r=svg.current.getBoundingClientRect(),vb=svg.current.viewBox.baseVal;return{x:(e.clientX-r.left)*vb.width/r.width,y:(e.clientY-r.top)*vb.height/r.height}};
 const newDoc=()=>{const d=initial();setDoc(d);setSelected(null);setHistory([])};
 const openDoc=id=>{const d=docs.find(x=>x.id===id);if(d){setDoc(d);setSelected(null);setHistory([])}};
 const makeRoom=()=>{const w=Number(prompt("Romlengde i mm","4000")),h=Number(prompt("Rombredde i mm","3000"));if(w<300||h<300)return;const x=1000,y=1000,t=98,H=2400;mutate(d=>({...d,walls:[...d.walls,{id:uid(),x1:x,y1:y,x2:x+w,y2:y,t,h:H},{id:uid(),x1:x+w,y1:y,x2:x+w,y2:y+h,t,h:H},{id:uid(),x1:x+w,y1:y+h,x2:x,y2:y+h,t,h:H},{id:uid(),x1:x,y1:y+h,x2:x,y2:y,t,h:H}]}))};
 const addItem=(type,w,h)=>mutate(d=>({...d,items:[...d.items,{id:uid(),type,x:1800,y:1600,w,h,rot:0}]}));
 const sel=useMemo(()=>selected?.kind==="wall"?doc.walls.find(x=>x.id===selected.id):selected?.kind==="item"?doc.items.find(x=>x.id===selected.id):null,[selected,doc]);
 const update=(key,value)=>{const n=Number(value);if(!Number.isFinite(n))return;mutate(d=>selected?.kind==="item"?{...d,items:d.items.map(o=>{if(o.id!==selected.id)return o;if(key==="wallOffset"&&o.wallId){const w=d.walls.find(x=>x.id===o.wallId);if(!w)return o;const L=len(w),off=clamp(n,0,L),a=Math.atan2(w.y2-w.y1,w.x2-w.x1),cx=w.x1+Math.cos(a)*off,cy=w.y1+Math.sin(a)*off;return{...o,x:cx-o.w/2,y:cy-o.h/2,rot:a*180/Math.PI}}return{...o,[key]:n}})}:{...d,walls:d.walls.map(w=>{if(w.id!==selected.id)return w;if(key==="len"||key==="angle"){const L=key==="len"?n:len(w),A=(key==="angle"?n:angle(w))*Math.PI/180;return{...w,x2:w.x1+L*Math.cos(A),y2:w.y1+L*Math.sin(A)}}return{...w,[key]:n}})} )};
 const remove=()=>{checkpoint();setDoc(d=>selected?.kind==="wall"?{...d,walls:d.walls.filter(x=>x.id!==selected.id)}:{...d,items:d.items.filter(x=>x.id!==selected.id)});setSelected(null)};
 const duplicate=()=>{if(selected?.kind!=="item"||!sel)return;mutate(d=>({...d,items:[...d.items,{...sel,id:uid(),x:sel.x+200,y:sel.y+200}]}))};
 const downItem=(e,o)=>{e.stopPropagation();setTool("select");setSelected({kind:"item",id:o.id});const p=point(e);setDrag({id:o.id,dx:p.x-o.x,dy:p.y-o.y,start:JSON.stringify(doc)})};
 const move=e=>{if(!drag)return;const p=point(e);setDoc(d=>({...d,items:d.items.map(o=>o.id===drag.id?{...o,x:snap(p.x-drag.dx),y:snap(p.y-drag.dy)}:o)}))};
 const up=()=>{if(!drag)return;setHistory(h=>[...h.slice(-24),drag.start]);setDoc(d=>{const o=d.items.find(x=>x.id===drag.id);if(!o||!wallTypes.has(o.type))return d;const n=nearestWall({x:o.x+o.w/2,y:o.y+o.h/2},d.walls);if(!n||n.dist>450)return d;const a=Math.atan2(n.wall.y2-n.wall.y1,n.wall.x2-n.wall.x1)*180/Math.PI;return {...d,items:d.items.map(x=>x.id!==o.id?x:{...x,x:n.x-o.w/2,y:n.y-o.h/2,rot:a,wallId:n.wall.id})}});setDrag(null)};
 const canvasDown=e=>{if(e.target.dataset?.canvas!=="yes")return;setSelected(null);if(tool!=="wall")return;const p=point(e),q={x:snap(p.x),y:snap(p.y)};if(!draft)setDraft(q);else{mutate(d=>({...d,walls:[...d.walls,{id:uid(),x1:draft.x,y1:draft.y,x2:q.x,y2:q.y,t:98,h:2400}]}));setDraft(q)}};
 const exportJson=()=>{const blob=new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(doc.name||"tegning").replace(/[^a-z0-9æøå]+/gi,"-")+".json";a.click();URL.revokeObjectURL(a.href)};
 return <main className={styles.shell}>
  <header className={styles.top}><Link href="/admin">← Backoffice</Link><strong>Tegning & visualisering</strong><input className={styles.name} value={doc.name} onChange={e=>setDoc(d=>({...d,name:e.target.value}))}/><span className={styles.saved}>{message}</span><button className={styles.btn} onClick={()=>persist()}>Lagre</button><button className={styles.btn} onClick={undo} disabled={!history.length}>Angre</button><button className={styles.btn} onClick={()=>window.print()}>PDF</button></header>
  <div className={styles.layout}>
   <aside className={styles.panel}>
    <div className={styles.group}><h2>Tegninger</h2><div className={styles.row}><button className={styles.btn} onClick={newDoc}>+ Ny</button><button className={styles.btn} onClick={exportJson}>Eksporter</button></div>{docs.length>0&&<select className={styles.select} value={doc.id} onChange={e=>openDoc(e.target.value)}>{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}<div className={styles.field}><label>Koble til oppdrag</label><select className={styles.select} value={doc.projectId||""} onChange={e=>setDoc(d=>({...d,projectId:e.target.value}))}><option value="">Ikke koblet</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div><div className={styles.field}><label>Kunde</label><input value={doc.customer||""} onChange={e=>setDoc(d=>({...d,customer:e.target.value}))}/></div><div className={styles.field}><label>Adresse</label><input value={doc.address||""} onChange={e=>setDoc(d=>({...d,address:e.target.value}))}/></div><div className={styles.field}><label>Notater</label><textarea className={styles.textarea} value={doc.notes||""} onChange={e=>setDoc(d=>({...d,notes:e.target.value}))}/></div></div>
    <div className={styles.group}><h2>Rom og vegger</h2><div className={styles.row}><button className={tool==="wall"?styles.activeBtn:styles.btn} onClick={()=>{setTool("wall");setDraft(null)}}>Tegn vegg</button><button className={styles.btn} onClick={makeRoom}>Rom etter mål</button></div><p className={styles.muted}>Vegger snapper til 100 mm-rutenettet. Klikk fortløpende punkter for sammenhengende vegger. Lengde og vinkel kan finjusteres eksakt.</p></div>
    {catalog.map(g=><div className={styles.group} key={g.group}><h2>{g.group}</h2><div className={styles.library}>{g.items.map(([t,l,w,h])=><button key={t} onClick={()=>addItem(t,w,h)}>{l}<small>{w} × {h} mm</small></button>)}</div></div>)}
   </aside>
   <section className={styles.workspace}><div className={styles.canvasWrap}><svg ref={svg} className={styles.canvas} viewBox={"0 0 "+VIEW+" "+VIEW} onPointerDown={canvasDown} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
    <defs><pattern id="minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={"M "+GRID+" 0 L 0 0 0 "+GRID} fill="none" stroke="#ece9e1" strokeWidth="6"/></pattern><pattern id="major" width="1000" height="1000" patternUnits="userSpaceOnUse"><rect width="1000" height="1000" fill="url(#minor)"/><path d="M1000 0L0 0 0 1000" fill="none" stroke="#d9d5ca" strokeWidth="12"/></pattern></defs>
    <rect data-canvas="yes" width={VIEW} height={VIEW} fill="url(#major)"/>
    {doc.walls.map(w=><g key={w.id} onPointerDown={e=>{e.stopPropagation();setTool("select");setSelected({kind:"wall",id:w.id})}} className={styles.pick}><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={selected?.id===w.id?"#9b7a39":"#222"} strokeWidth={Math.max(35,w.t)} strokeLinecap="square"/><line x1={w.x1} y1={w.y1-150} x2={w.x2} y2={w.y2-150} stroke="#777" strokeWidth="10"/><line x1={w.x1} y1={w.y1-210} x2={w.x1} y2={w.y1-90} stroke="#777" strokeWidth="10"/><line x1={w.x2} y1={w.y2-210} x2={w.x2} y2={w.y2-90} stroke="#777" strokeWidth="10"/><text x={(w.x1+w.x2)/2} y={(w.y1+w.y2)/2-210} textAnchor="middle" fontSize="105">{len(w)} mm · {angle(w)}°</text></g>)}
    {doc.items.map(o=><g key={o.id} transform={"translate("+o.x+" "+o.y+") rotate("+o.rot+" "+o.w/2+" "+o.h/2+")"} onPointerDown={e=>downItem(e,o)} className={styles.pick}>{o.type==="door"?<><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#51462f" strokeWidth="28"/><path d={"M0 "+o.h/2+" A "+o.w+" "+o.w+" 0 0 1 "+o.w+" "+(o.h/2-o.w)} fill="none" stroke="#8b806a" strokeWidth="18"/></>:o.type==="window"?<><rect width={o.w} height={Math.max(o.h,100)} fill="#dfeef1" stroke="#51462f" strokeWidth="18"/><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#64828a" strokeWidth="18"/></>:<rect width={o.w} height={o.h} rx="30" fill={selected?.id===o.id?"#eadcbf":"#f5f1e7"} stroke="#51462f" strokeWidth="18"/>}<text x={o.w/2} y={o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize="100">{labelFor(o.type)}</text><text x={o.w/2} y={o.h/2+125} textAnchor="middle" fontSize="75">{o.w} × {o.h}</text></g>)}
    {draft&&<><circle cx={draft.x} cy={draft.y} r="55" fill="#9b7a39"/><text x={draft.x+90} y={draft.y-80} fontSize="90">Neste veggpunkt</text></>}
   </svg></div></section>
   <aside className={styles.panel+" "+styles.right}><h2>Egenskaper</h2>{!sel?<p className={styles.muted}>Velg et objekt. Møbler og utstyr kan dras direkte i tegningen. Dører, vinduer, rekkverk og levegger fester seg automatisk til nærmeste vegg når du slipper dem.</p>:selected.kind==="wall"?<><h3>Vegg</h3>{[["Lengde (mm)","len",len(sel)],["Vinkel (grader)","angle",angle(sel)],["Tykkelse (mm)","t",sel.t],["Høyde (mm)","h",sel.h]].map(([l,k,v])=><div className={styles.field} key={k}><label>{l}</label><input type="number" value={v} onChange={e=>update(k,e.target.value)}/></div>)}</>:<><h3>{labelFor(sel.type)}</h3>{[["Bredde (mm)","w"],["Dybde/lengde (mm)","h"],["X-posisjon (mm)","x"],["Y-posisjon (mm)","y"],["Rotasjon (grader)","rot"]].map(([l,k])=><div className={styles.field} key={k}><label>{l}</label><input type="number" value={Math.round(sel[k])} onChange={e=>update(k,e.target.value)}/></div>)}{sel.wallId&&doc.walls.find(w=>w.id===sel.wallId)&&<div className={styles.field}><label>Avstand fra veggens start/hjørne (mm)</label><input type="number" min="0" max={len(doc.walls.find(w=>w.id===sel.wallId))} value={wallOffset(sel,doc.walls.find(w=>w.id===sel.wallId))} onChange={e=>update("wallOffset",e.target.value)}/><small className={styles.muted}>Gir nøyaktig plassering av dør/vindu langs veggen.</small></div>}<button className={styles.btn} onClick={duplicate}>Dupliser</button></>} {sel&&<button className={styles.btn+" "+styles.danger} onClick={remove}>Slett valgt</button>}
    <div className={styles.group+" "+styles.ai}><h2>AI-visualisering</h2><p className={styles.muted}>Klargjort for neste trinn: kundebilde + prosjektmål + tekstbeskrivelse → realistisk visualisering. AI-bildet skal lagres som illustrasjon, mens denne tegningen er målgrunnlaget.</p></div>
   </aside>
  </div>
 </main>
}