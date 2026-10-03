"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./drawing.module.css";

const GRID=100, VIEW=8000, STORE="aadlandDrawingsV2";
const catalog=[
 {group:"Bygg",items:[["door","Dør",900,100],["sliding","Skyvedør",1800,100],["window","Vindu",1200,100],["opening","Åpning",1000,100],["stairs","Trapp",900,2500],["post","Stolpe",98,98]]},
 {group:"Bad",items:[["toilet","Toalett",400,700],["walltoilet","Vegghengt toalett",400,600],["shower","Dusj",900,900],["bath","Badekar",750,1700],["sink","Servant",600,500],["washer","Vaskemaskin",600,600]]},
 {group:"Kjøkken",items:[["base","Benkeskap",600,600],["wallcab","Overskap",600,350],["tallcab","Høyskap",600,600],["fridge","Kjøleskap",600,600],["oven","Komfyr",600,600],["dishwasher","Oppvaskmaskin",600,600],["island","Kjøkkenøy",1800,900]]},
 {group:"Møbler",items:[["sofa","Sofa",2200,900],["table","Spisebord",1800,900],["chair","Stol",500,500],["bed","Seng",1800,2000],["wardrobe","Garderobe",1200,600],["tv","TV",1200,120]]},
 {group:"Ute",items:[["deck","Terrassefelt",3000,3000],["railing","Rekkverk",2000,100],["screen","Levegg",1800,100],["bench","Benk",1800,500],["planter","Plantekasse",1200,450]]}
];
const sizePresets={
 door:[["70 cm dør",700,100],["80 cm dør",800,100],["90 cm dør",900,100],["100 cm dør",1000,100]],
 sliding:[["120 cm skyvedør",1200,100],["150 cm skyvedør",1500,100],["180 cm skyvedør",1800,100],["240 cm skyvedør",2400,100]],
 window:[["60 cm vindu",600,100],["90 cm vindu",900,100],["120 cm vindu",1200,100],["150 cm vindu",1500,100],["180 cm vindu",1800,100]],
 opening:[["80 cm åpning",800,100],["90 cm åpning",900,100],["100 cm åpning",1000,100],["120 cm åpning",1200,100],["180 cm åpning",1800,100]],
 stairs:[["90 × 250 cm",900,2500],["100 × 300 cm",1000,3000],["120 × 300 cm",1200,3000]],
 toilet:[["40 × 70 cm",400,700],["40 × 75 cm",400,750]],
 walltoilet:[["40 × 55 cm",400,550],["40 × 60 cm",400,600]],
 shower:[["80 × 80 cm",800,800],["90 × 90 cm",900,900],["100 × 100 cm",1000,1000],["120 × 90 cm",1200,900]],
 bath:[["70 × 160 cm",700,1600],["75 × 170 cm",750,1700],["80 × 180 cm",800,1800]],
 sink:[["40 × 40 cm",400,400],["60 × 50 cm",600,500],["80 × 50 cm",800,500],["100 × 50 cm",1000,500],["120 × 50 cm",1200,500]],
 washer:[["60 × 60 cm",600,600]],
 base:[["40 cm benkeskap",400,600],["60 cm benkeskap",600,600],["80 cm benkeskap",800,600],["100 cm benkeskap",1000,600]],
 wallcab:[["40 cm overskap",400,350],["60 cm overskap",600,350],["80 cm overskap",800,350],["100 cm overskap",1000,350]],
 tallcab:[["40 cm høyskap",400,600],["60 cm høyskap",600,600]],
 fridge:[["60 × 60 cm",600,600],["90 × 70 cm",900,700]],
 oven:[["60 × 60 cm",600,600]],
 dishwasher:[["45 × 60 cm",450,600],["60 × 60 cm",600,600]],
 island:[["120 × 90 cm",1200,900],["180 × 90 cm",1800,900],["240 × 100 cm",2400,1000]],
 sofa:[["180 × 90 cm",1800,900],["220 × 90 cm",2200,900],["260 × 100 cm",2600,1000],["300 × 100 cm",3000,1000]],
 table:[["120 × 80 cm",1200,800],["160 × 90 cm",1600,900],["180 × 90 cm",1800,900],["220 × 100 cm",2200,1000]],
 chair:[["50 × 50 cm",500,500],["60 × 60 cm",600,600]],
 bed:[["90 × 200 cm",900,2000],["120 × 200 cm",1200,2000],["150 × 200 cm",1500,2000],["180 × 200 cm",1800,2000]],
 wardrobe:[["60 × 60 cm",600,600],["120 × 60 cm",1200,600],["180 × 60 cm",1800,600],["240 × 60 cm",2400,600]],
 tv:[["100 cm TV",1000,120],["120 cm TV",1200,120],["150 cm TV",1500,120],["180 cm TV",1800,120]],
 bench:[["120 × 50 cm",1200,500],["180 × 50 cm",1800,500],["240 × 50 cm",2400,500]],
 planter:[["80 × 40 cm",800,400],["120 × 45 cm",1200,450],["180 × 50 cm",1800,500]]
};
const flat=catalog.flatMap(g=>g.items), labelFor=t=>flat.find(x=>x[0]===t)?.[1]||t;
const uid=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
const snapTo=(n,size=GRID)=>Math.round(n/size)*size;
const len=w=>Math.round(Math.hypot(w.x2-w.x1,w.y2-w.y1));
const angle=w=>Math.round(Math.atan2(w.y2-w.y1,w.x2-w.x1)*180/Math.PI*10)/10;
const wallOffset=(o,w)=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,L=Math.hypot(dx,dy)||1;return Math.round(((o.x+o.w/2-w.x1)*dx+(o.y+o.h/2-w.y1)*dy)/L)};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mountedLimits=(o,w)=>{const L=len(w),width=Math.max(0,Number(o?.w)||0),half=width/2;if(L<=0)return{L:0,min:0,max:0,tooWide:width>0};if(width>=L)return{L,min:L/2,max:L/2,tooWide:width>L};return{L,min:half,max:L-half,tooWide:false}};
const wallEdgeOffsets=(o,w)=>{const limits=mountedLimits(o,w),center=clamp(Number.isFinite(o?.wallOffset)?o.wallOffset:wallOffset(o,w),limits.min,limits.max),half=Math.max(0,Number(o?.w)||0)/2;return{start:Math.max(0,Math.round(center-half)),end:Math.max(0,Math.round(limits.L-center-half)),center:Math.round(center),tooWide:limits.tooWide,L:limits.L}};
const dim=w=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,off=150;return {ax:w.x1+nx*off,ay:w.y1+ny*off,bx:w.x2+nx*off,by:w.y2+ny*off,nx,ny,mx:(w.x1+w.x2)/2+nx*(off+70),my:(w.y1+w.y2)/2+ny*(off+70)}};
const wallPresets=[
 ["Lettvegg · 70 mm / 2400 mm",70,2400],
 ["Innervegg · 98 mm / 2400 mm",98,2400],
 ["Innervegg · 98 mm / 2500 mm",98,2500],
 ["Innervegg · 120 mm / 2500 mm",120,2500],
 ["Yttervegg · 198 mm / 2400 mm",198,2400],
 ["Yttervegg · 198 mm / 2500 mm",198,2500],
 ["Yttervegg · 248 mm / 2500 mm",248,2500],
 ["Yttervegg · 248 mm / 2600 mm",248,2600]
];
function closedWallAreaM2(walls){
 if(!Array.isArray(walls)||walls.length<3)return null;
 const tol=10,first=walls[0],points=[{x:first.x1,y:first.y1}];
 for(let i=0;i<walls.length;i++){
  const w=walls[i],next=walls[(i+1)%walls.length];
  if(i>0){
   const prev=walls[i-1];
   if(Math.hypot(prev.x2-w.x1,prev.y2-w.y1)>tol)return null;
  }
  points.push({x:w.x2,y:w.y2});
  if(i===walls.length-1&&Math.hypot(w.x2-first.x1,w.y2-first.y1)>tol)return null;
  if(i<walls.length-1&&Math.hypot(w.x2-next.x1,w.y2-next.y1)>tol)return null;
 }
 let area=0;
 for(let i=0;i<points.length-1;i++)area+=points[i].x*points[i+1].y-points[i+1].x*points[i].y;
 return Math.abs(area)/2/1000000;
}
function polygonAreaM2(points){
 if(!Array.isArray(points)||points.length<3)return 0;
 let area=0;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y}
 return Math.abs(area)/2/1000000;
}
function polygonPerimeterM(points){
 if(!Array.isArray(points)||points.length<2)return 0;
 let total=0;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];total+=Math.hypot(b.x-a.x,b.y-a.y)}
 return total/1000;
}
function polygonCentroid(points){
 if(!Array.isArray(points)||!points.length)return{x:0,y:0};
 let x=0,y=0;
 for(const p of points){x+=p.x;y+=p.y}
 return{x:x/points.length,y:y/points.length};
}

const initial=()=>({id:uid(),name:"Ny tegning",orderId:"",projectId:"",customer:"",address:"",notes:"",visualizationNotes:"",walls:[],items:[],zones:[],measurements:[],snapSize:50,showGrid:true,scale:"1:50",zoom:1,defaultWallThickness:98,defaultWallHeight:2400});
const wallTypes=new Set(["door","sliding","window","opening","railing","screen"]);
const openingTypes=new Set(["door","sliding","window","opening"]);
const openingDefaults=type=>type==="window"?{openingHeight:1200,sillHeight:900}:openingTypes.has(type)?{openingHeight:2100,sillHeight:0}:{};
function nearestWall(o,walls){
 let best=null;
 for(const w of walls){const dx=w.x2-w.x1,dy=w.y2-w.y1,L2=dx*dx+dy*dy;if(!L2)continue;let t=((o.x-w.x1)*dx+(o.y-w.y1)*dy)/L2;t=Math.max(0,Math.min(1,t));const x=w.x1+t*dx,y=w.y1+t*dy,dist=Math.hypot(o.x-x,o.y-y);if(!best||dist<best.dist)best={wall:w,x,y,dist,t};}
 return best;
}

export default function DrawingClient(){
 const [docs,setDocs]=useState([]),[doc,setDoc]=useState(initial),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[zoneDraft,setZoneDraft]=useState([]),[tool,setTool]=useState("select"),[drag,setDrag]=useState(null),[history,setHistory]=useState([]),[future,setFuture]=useState([]),[message,setMessage]=useState(""),[orders,setOrders]=useState([]),[projects,setProjects]=useState([]),[measureDraft,setMeasureDraft]=useState(null),[wallDrag,setWallDrag]=useState(null),[zoneDrag,setZoneDrag]=useState(null),[pan,setPan]=useState({x:0,y:0}),[panning,setPanning]=useState(null),[mobileEditOpen,setMobileEditOpen]=useState(false),[roomBuilder,setRoomBuilder]=useState(null),[quickAddOpen,setQuickAddOpen]=useState(false),[fieldMode,setFieldMode]=useState(false),[canvasAspect,setCanvasAspect]=useState(1),[wallBuilder,setWallBuilder]=useState(null),[snapHint,setSnapHint]=useState(null),[wallChain,setWallChain]=useState(null);
 const svg=useRef(null);
 const leftPanel=useRef(null),rightPanel=useRef(null);
 const touchPointers=useRef(new Map()),pinchGesture=useRef(null),pendingCanvasTouch=useRef(null);
 const linkedOrderHandled=useRef("");
 const autosaveReady=useRef(false);
 useEffect(()=>{const el=svg.current;if(!el||typeof ResizeObserver==="undefined")return;const update=()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setCanvasAspect(clamp(r.width/r.height,.35,2.8))};update();const observer=new ResizeObserver(update);observer.observe(el);window.addEventListener("orientationchange",update);return()=>{observer.disconnect();window.removeEventListener("orientationchange",update)}},[]);
 useEffect(()=>{try{const d=JSON.parse(localStorage.getItem(STORE)||"[]");if(d.length){setDocs(d);setDoc({...initial(),...d[0]})}else{const old=JSON.parse(localStorage.getItem("aadlandDrawing")||"null");if(old)setDoc({...initial(),...old})}}catch{} Promise.all([
  fetch("/api/admin/orders").then(r=>r.ok?r.json():null).catch(()=>null),
  fetch("/api/admin/projects").then(r=>r.ok?r.json():null).catch(()=>null)
 ]).then(([orderData,projectData])=>{
  setOrders((orderData?.orders||[]).filter(order=>order.orderType==="custom"&&!order.archivedAt));
  setProjects(projectData?.projects||[]);
 }).catch(()=>{});},[]);
 useEffect(()=>{
  const readyTimer=setTimeout(()=>{autosaveReady.current=true},700);
  return()=>clearTimeout(readyTimer);
 },[]);
 useEffect(()=>{
  if(!autosaveReady.current)return;
  const timer=setTimeout(()=>{
   try{
    const stored=JSON.parse(localStorage.getItem(STORE)||"[]");
    const list=Array.isArray(stored)?stored:[];
    const next=[...list.filter(item=>item.id!==doc.id),doc];
    localStorage.setItem(STORE,JSON.stringify(next));
    setDocs(current=>[...current.filter(item=>item.id!==doc.id),doc]);
   }catch{}
  },650);
  return()=>clearTimeout(timer);
 },[doc]);
 const persistLocal=next=>{const list=[...docs.filter(x=>x.id!==next.id),next];setDocs(list);localStorage.setItem(STORE,JSON.stringify(list))};
 const persist=async(next=doc)=>{persistLocal(next);if(!next.orderId&&!next.projectId){setMessage("Lagret på enheten");setTimeout(()=>setMessage(""),1800);return}setMessage("Lagrer…");try{const body={id:next.serverId,orderId:next.orderId||null,projectId:next.projectId||null,name:next.name,customer:next.customer,address:next.address,notes:next.notes,drawingData:{...next,serverId:undefined}};const r=await fetch("/api/admin/project-drawings",{method:next.serverId?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),x=await r.json();if(r.ok&&x.drawing){const saved={...next,serverId:x.drawing.id};setDoc(saved);persistLocal(saved);setMessage("Lagret i oppdraget")}else if(x.setupRequired)setMessage("Lokalt lagret · database ikke aktivert");else setMessage("Lokalt lagret · serverfeil")}catch{setMessage("Lokalt lagret · server utilgjengelig")}setTimeout(()=>setMessage(""),2600)};
 const checkpoint=()=>setHistory(h=>[...h.slice(-24),JSON.stringify(doc)]);
 const syncMounted=(walls,items)=>items.map(o=>{if(!o.wallId)return o;const w=walls.find(x=>x.id===o.wallId);if(!w)return {...o,wallId:null,wallOffset:null};const limits=mountedLimits(o,w),off=clamp(Number.isFinite(o.wallOffset)?o.wallOffset:wallOffset(o,w),limits.min,limits.max),a=Math.atan2(w.y2-w.y1,w.x2-w.x1),cx=w.x1+Math.cos(a)*off,cy=w.y1+Math.sin(a)*off;return {...o,x:cx-o.w/2,y:cy-o.h/2,rot:a*180/Math.PI,wallOffset:off}});
 const mutate=fn=>{checkpoint();setFuture([]);setDoc(d=>fn(d))};
 const undo=()=>{const last=history.at(-1);if(!last)return;setFuture(f=>[JSON.stringify(doc),...f].slice(0,25));setDoc(JSON.parse(last));setHistory(h=>h.slice(0,-1));setSelected(null)};
 const redo=()=>{const next=future[0];if(!next)return;setHistory(h=>[...h.slice(-24),JSON.stringify(doc)]);setDoc(JSON.parse(next));setFuture(f=>f.slice(1));setSelected(null)};
 const viewDimsFor=(zoom=doc.zoom||1)=>{
  const aspect=clamp(canvasAspect||1,.35,2.8),base=VIEW/zoom;
  return aspect>=1?{w:base,h:base/aspect}:{w:base*aspect,h:base};
 };
 const {w:viewWidth,h:viewHeight}=viewDimsFor();
 const pointFromClient=(clientX,clientY)=>{const r=svg.current.getBoundingClientRect();return{x:pan.x+(clientX-r.left)*viewWidth/r.width,y:pan.y+(clientY-r.top)*viewHeight/r.height}};
 const point=e=>pointFromClient(e.clientX,e.clientY);
 const magneticPoint=(p,walls=doc.walls,excludeWallId=null)=>{
  const threshold=Math.max(55,220/(doc.zoom||1));
  let best=null;
  for(const wall of walls){
   if(wall.id===excludeWallId)continue;
   for(const endpoint of [{x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2}]){
    const dist=Math.hypot(p.x-endpoint.x,p.y-endpoint.y);
    if(dist<=threshold&&(!best||dist<best.dist))best={...endpoint,dist};
   }
  }
  return best?{point:{x:best.x,y:best.y},snapped:true}:{point:{x:snapTo(p.x,doc.snapSize||50),y:snapTo(p.y,doc.snapSize||50)},snapped:false};
 };
 const clampPanForZoom=(value,zoom)=>{const dims=viewDimsFor(zoom);return{x:clamp(value.x,0,Math.max(0,VIEW-dims.w)),y:clamp(value.y,0,Math.max(0,VIEW-dims.h))}};
 const zoomBy=delta=>setDoc(d=>{const oldZoom=d.zoom||1,oldDims=viewDimsFor(oldZoom),zoom=clamp(oldZoom+delta,.5,5),nextDims=viewDimsFor(zoom);setPan(p=>clampPanForZoom({x:p.x+oldDims.w/2-nextDims.w/2,y:p.y+oldDims.h/2-nextDims.h/2},zoom));return {...d,zoom}});
 const fitView=()=>{const b=drawingBounds(),aspect=clamp(canvasAspect||1,.35,2.8),base=aspect>=1?{w:VIEW,h:VIEW/aspect}:{w:VIEW*aspect,h:VIEW},zoom=clamp(Math.min(base.w/Math.max(500,b.w*1.12),base.h/Math.max(500,b.h*1.12)),.5,5),nextDims=viewDimsFor(zoom);setPan(clampPanForZoom({x:b.x+b.w/2-nextDims.w/2,y:b.y+b.h/2-nextDims.h/2},zoom));setDoc(d=>({...d,zoom}))};
 const capturePointer=e=>{try{svg.current?.setPointerCapture?.(e.pointerId)}catch{}};
 const releasePointer=e=>{try{if(svg.current?.hasPointerCapture?.(e.pointerId))svg.current.releasePointerCapture(e.pointerId)}catch{}};
 const scrollPanel=ref=>ref.current?.scrollIntoView?.({behavior:"smooth",block:"start"});
 const clearPendingCanvasTouch=()=>{if(pendingCanvasTouch.current){clearTimeout(pendingCanvasTouch.current);pendingCanvasTouch.current=null}};
 const rollbackGestureDrag=()=>{const start=drag?.start||wallDrag?.start||zoneDrag?.start;if(start){try{setDoc(JSON.parse(start))}catch{}}setDrag(null);setWallDrag(null);setZoneDrag(null);setPanning(null)};
 const beginPinch=()=>{
  const points=[...touchPointers.current.values()];
  if(points.length<2||!svg.current)return;
  clearPendingCanvasTouch();rollbackGestureDrag();
  const a=points[0],b=points[1],r=svg.current.getBoundingClientRect(),startZoom=doc.zoom||1,startDims=viewDimsFor(startZoom);
  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  pinchGesture.current={
   startDistance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),
   startZoom,
   worldX:pan.x+(mx-r.left)*startDims.w/r.width,
   worldY:pan.y+(my-r.top)*startDims.h/r.height
  };
 };
 const pointerDownCapture=e=>{
  if(e.pointerType!=="touch")return;
  capturePointer(e);
  touchPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touchPointers.current.size>=2){
   if(touchPointers.current.size===2)beginPinch();
   e.preventDefault();e.stopPropagation();
  }
 };
 const pointerMoveCapture=e=>{
  if(e.pointerType!=="touch"||!touchPointers.current.has(e.pointerId))return;
  touchPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const gesture=pinchGesture.current,points=[...touchPointers.current.values()];
  if(!gesture||points.length<2||!svg.current)return;
  e.preventDefault();e.stopPropagation();
  const a=points[0],b=points[1],distance=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
  const zoom=clamp(gesture.startZoom*(distance/gesture.startDistance),.5,5);
  const r=svg.current.getBoundingClientRect(),nextDims=viewDimsFor(zoom),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  const nextPan=clampPanForZoom({
   x:gesture.worldX-(mx-r.left)*nextDims.w/r.width,
   y:gesture.worldY-(my-r.top)*nextDims.h/r.height
  },zoom);
  setPan(nextPan);setDoc(d=>Math.abs((d.zoom||1)-zoom)<.002?d:{...d,zoom});
 };
 const pointerUpCapture=e=>{
  if(e.pointerType!=="touch")return;
  const wasPinching=!!pinchGesture.current;
  touchPointers.current.delete(e.pointerId);releasePointer(e);
  if(touchPointers.current.size<2)pinchGesture.current=null;
  if(wasPinching){e.preventDefault();e.stopPropagation()}
 };
 const startPan=e=>{if(tool!=="pan")return;capturePointer(e);setPanning({cx:e.clientX,cy:e.clientY,x:pan.x,y:pan.y})};
 const movePan=e=>{if(!panning)return;const r=svg.current.getBoundingClientRect();setPan(clampPanForZoom({x:panning.x-(e.clientX-panning.cx)*viewWidth/r.width,y:panning.y-(e.clientY-panning.cy)*viewHeight/r.height},doc.zoom||1))};
 const newDoc=()=>{const d=initial();setDoc(d);setSelected(null);setHistory([]);setFuture([])};
 const openDoc=id=>{const d=docs.find(x=>x.id===id);if(d){setDoc(d);setSelected(null);setHistory([]);setFuture([])}};
 const mergeIncomingDrawings=incoming=>{if(!incoming.length)return;const merged=[...docs];for(const drawing of incoming){const i=merged.findIndex(x=>x.serverId===drawing.serverId);if(i>=0)merged[i]=drawing;else merged.push(drawing)}setDocs(merged);localStorage.setItem(STORE,JSON.stringify(merged));setMessage(incoming.length+" tegning(er) hentet");setTimeout(()=>setMessage(""),2200)};
 const loadOrderDrawings=async orderId=>{if(!orderId)return;try{const r=await fetch("/api/admin/project-drawings?orderId="+encodeURIComponent(orderId)),x=await r.json();if(!r.ok||x.setupRequired)return;const incoming=(x.drawings||[]).map(row=>({...initial(),...(row.drawingData||{}),serverId:row.id,orderId:row.orderId||orderId,projectId:row.projectId||"",name:row.name,customer:row.customer,address:row.address,notes:row.notes}));mergeIncomingDrawings(incoming)}catch{}};
 const loadProjectDrawings=async projectId=>{if(!projectId)return;try{const r=await fetch("/api/admin/project-drawings?projectId="+encodeURIComponent(projectId)),x=await r.json();if(!r.ok||x.setupRequired)return;const incoming=(x.drawings||[]).map(row=>({...initial(),...(row.drawingData||{}),serverId:row.id,orderId:row.orderId||"",projectId:row.projectId,name:row.name,customer:row.customer,address:row.address,notes:row.notes}));mergeIncomingDrawings(incoming)}catch{}};
 const changeOrder=e=>{const orderId=e.target.value,order=orders.find(item=>item.id===orderId);setDoc(d=>({...d,orderId,projectId:orderId?"":d.projectId,customer:orderId?(order?.customerName||d.customer):d.customer,address:orderId?(order?.customer?.address||d.address):d.address,name:orderId&&d.name==="Ny tegning"?"Tegning – "+(order?.orderNumber||"oppdrag"):d.name}));if(orderId)loadOrderDrawings(orderId)};
 const changeProject=e=>{const projectId=e.target.value;setDoc(d=>({...d,projectId,orderId:projectId?"":d.orderId}));if(projectId)loadProjectDrawings(projectId)};
 useEffect(()=>{
  if(!orders.length||linkedOrderHandled.current)return;
  const orderId=new URLSearchParams(window.location.search).get("orderId")||"";
  if(!orderId)return;
  const order=orders.find(item=>item.id===orderId);
  if(!order)return;
  linkedOrderHandled.current=orderId;
  let cancelled=false;
  (async()=>{
   try{
    const r=await fetch("/api/admin/project-drawings?orderId="+encodeURIComponent(orderId)),x=await r.json();
    if(cancelled)return;
    if(r.ok&&!x.setupRequired&&Array.isArray(x.drawings)&&x.drawings.length){
     const incoming=x.drawings.map(row=>({...initial(),...(row.drawingData||{}),serverId:row.id,orderId:row.orderId||orderId,projectId:row.projectId||"",name:row.name,customer:row.customer,address:row.address,notes:row.notes}));
     const latest=incoming[0];
     setDoc(latest);
     setSelected(null);
     setHistory([]);
     setFuture([]);
     setDocs(current=>{const merged=[...current];for(const drawing of incoming){const i=merged.findIndex(item=>item.serverId===drawing.serverId);if(i>=0)merged[i]=drawing;else merged.push(drawing)}localStorage.setItem(STORE,JSON.stringify(merged));return merged});
     setMessage("Tegning hentet fra "+(order.orderNumber||"oppdraget"));
     setTimeout(()=>setMessage(""),2200);
     return;
    }
   }catch{}
   if(cancelled)return;
   const next={...initial(),orderId,customer:order.customerName||"",address:order.customer?.address||"",name:"Tegning – "+(order.orderNumber||"oppdrag")};
   setDoc(next);setSelected(null);setHistory([]);setFuture([]);
   setMessage("Ny tegning koblet til "+(order.orderNumber||"oppdraget"));
   setTimeout(()=>setMessage(""),2200);
  })();
  return()=>{cancelled=true};
 },[orders]);
 const openRoomBuilder=type=>setRoomBuilder(type==="l"
  ?{type:"l",name:"Rom "+((doc.zones||[]).length+1),w:"5000",h:"4000",rw:"1800",rh:"1500"}
  :{type:"rect",name:"Rom "+((doc.zones||[]).length+1),w:"4000",h:"3000"});
 const roomStart=(w,h)=>{const cx=pan.x+viewWidth/2,cy=pan.y+viewHeight/2;return{x:clamp(snapTo(cx-w/2,doc.snapSize||50),100,Math.max(100,VIEW-w-100)),y:clamp(snapTo(cy-h/2,doc.snapSize||50),100,Math.max(100,VIEW-h-100))}};
 const createRoom=()=>{
  if(!roomBuilder)return;
  const w=Number(roomBuilder.w),h=Number(roomBuilder.h),name=String(roomBuilder.name||"").trim()||"Rom "+((doc.zones||[]).length+1);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<300||h<300||w>7000||h>7000){setMessage("Sjekk rommålene");setTimeout(()=>setMessage(""),1800);return}
  const t=Number(doc.defaultWallThickness)||98,H=Number(doc.defaultWallHeight)||2400,{x,y}=roomStart(w,h);
  if(roomBuilder.type==="l"){
   const rw=Number(roomBuilder.rw),rh=Number(roomBuilder.rh);
   if(!Number.isFinite(rw)||!Number.isFinite(rh)||w<600||h<600||rw<300||rh<300||rw>=w-300||rh>=h-300){setMessage("Innhakket passer ikke i L-rommet");setTimeout(()=>setMessage(""),2200);return}
   const pts=[[x,y],[x+w-rw,y],[x+w-rw,y+rh],[x+w,y+rh],[x+w,y+h],[x,y+h],[x,y]];
   const points=pts.slice(0,-1).map(p=>({x:p[0],y:p[1]})),zone={id:uid(),name,points,ceilingHeight:H,floorFinish:"",notes:""};
   mutate(d=>({...d,walls:[...d.walls,...pts.slice(0,-1).map((p,i)=>({id:uid(),x1:p[0],y1:p[1],x2:pts[i+1][0],y2:pts[i+1][1],t,h:H}))],zones:[...(d.zones||[]),zone]}));
   setSelected({kind:"zone",id:zone.id});
  }else{
   const points=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],zone={id:uid(),name,points,ceilingHeight:H,floorFinish:"",notes:""};
   mutate(d=>({...d,walls:[...d.walls,{id:uid(),x1:x,y1:y,x2:x+w,y2:y,t,h:H},{id:uid(),x1:x+w,y1:y,x2:x+w,y2:y+h,t,h:H},{id:uid(),x1:x+w,y1:y+h,x2:x,y2:y+h,t,h:H},{id:uid(),x1:x,y1:y+h,x2:x,y2:y,t,h:H}],zones:[...(d.zones||[]),zone]}));
   setSelected({kind:"zone",id:zone.id});
  }
  const focusZoom=clamp(VIEW/Math.max(500,Math.max(w,h)*1.18),.5,5),focusView=VIEW/focusZoom;
  setPan(clampPanForZoom({x:x+w/2-focusView/2,y:y+h/2-focusView/2},focusZoom));
  setDoc(d=>({...d,zoom:focusZoom}));
  setRoomBuilder(null);setTool("select");
 };
 const makeRoom=()=>openRoomBuilder("rect");
 const makeLRoom=()=>openRoomBuilder("l");
 const openWallBuilder=()=>{
  const wall=selected?.kind==="wall"?doc.walls.find(item=>item.id===selected.id):null;
  setWallBuilder({
   length:"3000",angle:wall?String(Math.round(angle(wall))):"0",
   thickness:String(doc.defaultWallThickness||98),height:String(doc.defaultWallHeight||2400),
   connectToSelected:!!wall
  });
 };
 const createExactWall=()=>{
  if(!wallBuilder)return;
  const L=Number(wallBuilder.length),A=Number(wallBuilder.angle),t=Number(wallBuilder.thickness),h=Number(wallBuilder.height);
  if(!Number.isFinite(L)||L<100||L>12000||!Number.isFinite(A)||!Number.isFinite(t)||t<40||!Number.isFinite(h)||h<300){setMessage("Sjekk veggmålene");setTimeout(()=>setMessage(""),1800);return}
  const selectedWall=wallBuilder.connectToSelected&&selected?.kind==="wall"?doc.walls.find(item=>item.id===selected.id):null;
  const dims=viewDimsFor(),rad=A*Math.PI/180;
  const x1=selectedWall?selectedWall.x2:snapTo(pan.x+dims.w/2-Math.cos(rad)*L/2,doc.snapSize||50);
  const y1=selectedWall?selectedWall.y2:snapTo(pan.y+dims.h/2-Math.sin(rad)*L/2,doc.snapSize||50);
  const id=uid(),wall={id,x1:clamp(x1,0,VIEW),y1:clamp(y1,0,VIEW),x2:clamp(x1+Math.cos(rad)*L,0,VIEW),y2:clamp(y1+Math.sin(rad)*L,0,VIEW),t,h};
  mutate(d=>({...d,walls:[...d.walls,wall]}));
  setSelected({kind:"wall",id});setTool("select");setWallBuilder(null);setQuickAddOpen(false);
 };
 const addItem=(type,w,h)=>{
  const id=uid(),selectedWall=selected?.kind==="wall"?doc.walls.find(wall=>wall.id===selected.id):null;
  if(selectedWall&&wallTypes.has(type)){
   const limits=mountedLimits({w},selectedWall),off=clamp(limits.L/2,limits.min,limits.max),a=Math.atan2(selectedWall.y2-selectedWall.y1,selectedWall.x2-selectedWall.x1),cx=selectedWall.x1+Math.cos(a)*off,cy=selectedWall.y1+Math.sin(a)*off;
   mutate(d=>({...d,items:[...d.items,{id,type,x:cx-w/2,y:cy-h/2,w,h,rot:a*180/Math.PI,wallId:selectedWall.id,wallOffset:off,...openingDefaults(type)}]}));
  }else{
   const cx=pan.x+viewWidth/2,cy=pan.y+viewHeight/2,x=snapTo(cx-w/2,doc.snapSize||50),y=snapTo(cy-h/2,doc.snapSize||50);
   mutate(d=>({...d,items:[...d.items,{id,type,x:clamp(x,0,VIEW-w),y:clamp(y,0,VIEW-h),w,h,rot:0,...openingDefaults(type)}]}));
  }
  setSelected({kind:"item",id});setTool("select");setQuickAddOpen(false);
 };
 const sel=useMemo(()=>selected?.kind==="wall"?doc.walls.find(x=>x.id===selected.id):selected?.kind==="item"?doc.items.find(x=>x.id===selected.id):selected?.kind==="zone"?(doc.zones||[]).find(x=>x.id===selected.id):null,[selected,doc]);
 useEffect(()=>{setMobileEditOpen(false)},[selected?.kind,selected?.id]);
 const update=(key,value)=>{const n=Number(value);if(!Number.isFinite(n))return;mutate(d=>{if(selected?.kind==="item"){return {...d,items:d.items.map(o=>{if(o.id!==selected.id)return o;if((key==="wallOffset"||key==="wallStartGap"||key==="wallEndGap")&&o.wallId){const w=d.walls.find(x=>x.id===o.wallId);if(!w)return o;const limits=mountedLimits(o,w),half=Math.max(0,Number(o.w)||0)/2;let desired=n;if(key==="wallStartGap")desired=n+half;if(key==="wallEndGap")desired=limits.L-n-half;const off=clamp(desired,limits.min,limits.max),a=Math.atan2(w.y2-w.y1,w.x2-w.x1),cx=w.x1+Math.cos(a)*off,cy=w.y1+Math.sin(a)*off;return {...o,x:cx-o.w/2,y:cy-o.h/2,rot:a*180/Math.PI,wallOffset:off}}return {...o,[key]:n}})}}const walls=d.walls.map(w=>{if(w.id!==selected?.id)return w;if(key==="len"||key==="angle"){const L=key==="len"?n:len(w),A=(key==="angle"?n:angle(w))*Math.PI/180;return {...w,x2:w.x1+L*Math.cos(A),y2:w.y1+L*Math.sin(A)}}if(key==="x1"||key==="y1"){const dx=key==="x1"?n-w.x1:0,dy=key==="y1"?n-w.y1:0;return {...w,x1:w.x1+dx,y1:w.y1+dy,x2:w.x2+dx,y2:w.y2+dy}}return {...w,[key]:n}});return {...d,walls,items:syncMounted(walls,d.items)}})};
 const remove=()=>{checkpoint();setFuture([]);setDoc(d=>selected?.kind==="wall"?{...d,walls:d.walls.filter(x=>x.id!==selected.id),items:d.items.map(o=>o.wallId===selected.id?{...o,wallId:null,wallOffset:null}:o)}:selected?.kind==="zone"?{...d,zones:(d.zones||[]).filter(x=>x.id!==selected.id)}:{...d,items:d.items.filter(x=>x.id!==selected.id)});setSelected(null)};
 const flipDoor=()=>{if(selected?.kind!=="item"||!sel||sel.type!=="door")return;mutate(d=>({...d,items:d.items.map(o=>o.id===sel.id?{...o,flip:!o.flip}:o)}))};
 const detach=()=>{if(selected?.kind!=="item"||!sel)return;mutate(d=>({...d,items:d.items.map(o=>o.id===sel.id?{...o,wallId:null}:o)}))};
 const duplicate=()=>{if(selected?.kind!=="item"||!sel)return;mutate(d=>({...d,items:[...d.items,{...sel,id:uid(),x:sel.x+200,y:sel.y+200}]}))};
 const applySizePreset=value=>{if(selected?.kind!=="item"||!sel||!value)return;const [w,h]=value.split("x").map(Number);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;mutate(d=>{const items=d.items.map(o=>o.id!==sel.id?o:{...o,x:o.x+(o.w-w)/2,y:o.y+(o.h-h)/2,w,h});return {...d,items:syncMounted(d.walls,items)}})};
 const applyWallPreset=value=>{if(selected?.kind!=="wall"||!sel||!value)return;const [t,h]=value.split("x").map(Number);if(!Number.isFinite(t)||!Number.isFinite(h)||t<=0||h<=0)return;mutate(d=>({...d,walls:d.walls.map(w=>w.id!==sel.id?w:{...w,t,h})}))};
 const finishZone=()=>{if(zoneDraft.length<3){setMessage("Romsonen trenger minst 3 punkter");setTimeout(()=>setMessage(""),1800);return}const zone={id:uid(),name:"Rom "+((doc.zones||[]).length+1),points:zoneDraft,ceilingHeight:Number(doc.defaultWallHeight)||2400,floorFinish:"",notes:""};mutate(d=>({...d,zones:[...(d.zones||[]),zone]}));setZoneDraft([]);setTool("select");setSelected({kind:"zone",id:zone.id})};
 const cancelZone=()=>{setZoneDraft([]);setTool("select")};
 const updateZoneField=(key,value,numeric=false)=>{if(selected?.kind!=="zone"||!sel)return;const next=numeric?Number(value):String(value);if(numeric&&!Number.isFinite(next))return;mutate(d=>({...d,zones:(d.zones||[]).map(z=>z.id===sel.id?{...z,[key]:next}:z)}))};
 useEffect(()=>{
  const onKey=e=>{
   const tag=String(e.target?.tagName||"").toLowerCase();
   const typing=tag==="input"||tag==="textarea"||tag==="select"||e.target?.isContentEditable;
   const mod=e.ctrlKey||e.metaKey;
   if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();persist();return}
   if(typing)return;
   if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();if(e.shiftKey)redo();else undo();return}
   if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();redo();return}
   if(mod&&e.key.toLowerCase()==="d"&&selected?.kind==="item"){e.preventDefault();duplicate();return}
   if((e.key==="Delete"||e.key==="Backspace")&&selected){e.preventDefault();remove();return}
   if(e.key==="Escape"){setDraft(null);setWallChain(null);setSnapHint(null);setZoneDraft([]);setMeasureDraft(null);setTool("select");setSelected(null)}
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 });
 const downWallEnd=(e,w,end)=>{e.stopPropagation();capturePointer(e);setTool("select");setSelected({kind:"wall",id:w.id});setWallDrag({id:w.id,end,start:JSON.stringify(doc)})};
 const moveWallEnd=e=>{if(!wallDrag)return;const p=point(e),magnet=magneticPoint(p,doc.walls,wallDrag.id),q=magnet.point;setSnapHint(magnet.snapped?q:null);setDoc(d=>{const target=d.walls.find(w=>w.id===wallDrag.id);if(!target)return d;const ox=wallDrag.end===1?target.x1:target.x2,oy=wallDrag.end===1?target.y1:target.y2;const walls=d.walls.map(w=>{let n={...w};if(w.id===wallDrag.id){if(wallDrag.end===1){n.x1=q.x;n.y1=q.y}else{n.x2=q.x;n.y2=q.y}}else{if(Math.hypot(w.x1-ox,w.y1-oy)<5){n.x1=q.x;n.y1=q.y}if(Math.hypot(w.x2-ox,w.y2-oy)<5){n.x2=q.x;n.y2=q.y}}return n});return {...d,walls,items:syncMounted(walls,d.items)}})};
 const endWallDrag=()=>{if(!wallDrag)return;setSnapHint(null);setHistory(h=>[...h.slice(-24),wallDrag.start]);setFuture([]);setWallDrag(null)};
 const downZonePoint=(e,z,index)=>{e.stopPropagation();capturePointer(e);setTool("select");setSelected({kind:"zone",id:z.id});setZoneDrag({id:z.id,index,start:JSON.stringify(doc)})};
 const moveZonePoint=e=>{if(!zoneDrag)return;const p=point(e),magnet=magneticPoint(p),q=magnet.point;setSnapHint(magnet.snapped?q:null);setDoc(d=>({...d,zones:(d.zones||[]).map(z=>z.id!==zoneDrag.id?z:{...z,points:z.points.map((pt,i)=>i===zoneDrag.index?q:pt)})}))};
 const endZoneDrag=()=>{if(!zoneDrag)return;setSnapHint(null);setHistory(h=>[...h.slice(-24),zoneDrag.start]);setFuture([]);setZoneDrag(null)};
 const downItem=(e,o)=>{e.stopPropagation();capturePointer(e);setTool("select");setSelected({kind:"item",id:o.id});const p=point(e);setDrag({id:o.id,dx:p.x-o.x,dy:p.y-o.y,start:JSON.stringify(doc)})};
 const move=e=>{if(panning){movePan(e);return}if(wallDrag){moveWallEnd(e);return}if(zoneDrag){moveZonePoint(e);return}if(!drag)return;const p=point(e);setDoc(d=>({...d,items:d.items.map(o=>o.id===drag.id?{...o,x:snapTo(p.x-drag.dx,d.snapSize||50),y:snapTo(p.y-drag.dy,d.snapSize||50)}:o)}))};
 const up=e=>{if(e)releasePointer(e);if(panning){setPanning(null);return}if(wallDrag){endWallDrag();return}if(zoneDrag){endZoneDrag();return}if(!drag)return;setHistory(h=>[...h.slice(-24),drag.start]);setFuture([]);setDoc(d=>{const o=d.items.find(x=>x.id===drag.id);if(!o||!wallTypes.has(o.type))return d;const n=nearestWall({x:o.x+o.w/2,y:o.y+o.h/2},d.walls);if(!n||n.dist>450)return {...d,items:d.items.map(x=>x.id!==o.id?x:{...x,wallId:null,wallOffset:null})};const a=Math.atan2(n.wall.y2-n.wall.y1,n.wall.x2-n.wall.x1)*180/Math.PI,limits=mountedLimits(o,n.wall),off=clamp(Math.round(n.t*limits.L),limits.min,limits.max),cx=n.wall.x1+Math.cos(a*Math.PI/180)*off,cy=n.wall.y1+Math.sin(a*Math.PI/180)*off;return {...d,items:d.items.map(x=>x.id!==o.id?x:{...x,x:cx-o.w/2,y:cy-o.h/2,rot:a,wallId:n.wall.id,wallOffset:off})}});setDrag(null)};
 const applyCanvasPoint=p=>{
  setSelected(null);
  const magnet=magneticPoint(p),q=magnet.point;
  setSnapHint(magnet.snapped?q:null);
  if(tool==="zone"){setZoneDraft(points=>[...points,q]);setTimeout(()=>setSnapHint(null),350);return}
  if(tool==="measure"){if(!measureDraft)setMeasureDraft(q);else{mutate(d=>({...d,measurements:[...(d.measurements||[]),{id:uid(),x1:measureDraft.x,y1:measureDraft.y,x2:q.x,y2:q.y}]}));setMeasureDraft(null)}setTimeout(()=>setSnapHint(null),350);return}
  if(tool!=="wall")return;
  if(!draft){
   setDraft(q);setWallChain({start:q,count:0});setTimeout(()=>setSnapHint(null),350);return;
  }
  const nextCount=(wallChain?.count||0)+1,closing=wallChain?.start&&nextCount>=3&&Math.hypot(q.x-wallChain.start.x,q.y-wallChain.start.y)<2;
  mutate(d=>({...d,walls:[...d.walls,{id:uid(),x1:draft.x,y1:draft.y,x2:q.x,y2:q.y,t:Number(d.defaultWallThickness)||98,h:Number(d.defaultWallHeight)||2400}]}));
  if(closing){setDraft(null);setWallChain(null);setTool("select");setSnapHint(null);setMessage("Romkontur lukket");setTimeout(()=>setMessage(""),1500)}
  else{setDraft(q);setWallChain(chain=>({...chain,start:chain?.start||draft,count:nextCount}));setTimeout(()=>setSnapHint(null),350)}
 };
 const canvasDown=e=>{
  if(e.target.dataset?.canvas!=="yes")return;
  capturePointer(e);
  if(tool==="pan"){startPan(e);return}
  const p=point(e);
  if(e.pointerType==="touch"&&["wall","zone","measure"].includes(tool)){
   clearPendingCanvasTouch();
   const x=p.x,y=p.y;
   pendingCanvasTouch.current=setTimeout(()=>{pendingCanvasTouch.current=null;if(!pinchGesture.current&&touchPointers.current.size<=1)applyCanvasPoint({x,y})},130);
   return;
  }
  if(tool==="select"){setSelected(null);return}
  applyCanvasPoint(p);
 };
 const summary=useMemo(()=>{const wallM=doc.walls.reduce((s,w)=>s+len(w),0)/1000,wallM2=doc.walls.reduce((s,w)=>s+len(w)*(w.h||2400),0)/1000000,deckM2=doc.items.filter(o=>o.type==="deck").reduce((s,o)=>s+o.w*o.h,0)/1000000,floorM2=closedWallAreaM2(doc.walls),openingM2=doc.items.filter(o=>o.wallId&&openingTypes.has(o.type)).reduce((s,o)=>s+(Number(o.w)||0)*(Number(o.openingHeight)||openingDefaults(o.type).openingHeight||0),0)/1000000,netWallM2=Math.max(0,wallM2-openingM2),zoneRows=(doc.zones||[]).map(z=>{const area=polygonAreaM2(z.points),perimeter=polygonPerimeterM(z.points),height=(Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400)/1000;return {...z,area,perimeter,wallArea:perimeter*height}}),zonedFloorM2=zoneRows.reduce((s,z)=>s+z.area,0),zonePerimeterM=zoneRows.reduce((s,z)=>s+z.perimeter,0),zoneWallM2=zoneRows.reduce((s,z)=>s+z.wallArea,0);const count=t=>doc.items.filter(o=>o.type===t).length;return {wallM,wallM2,openingM2,netWallM2,deckM2,floorM2,zoneRows,zonedFloorM2,zonePerimeterM,zoneWallM2,objects:doc.items.length,doors:count("door")+count("sliding"),windows:count("window"),posts:count("post")}},[doc]);
 const selectedOrder=orders.find(order=>order.id===doc.orderId);
 const selectedProject=projects.find(p=>p.id===doc.projectId);
 const projectLabel=selectedOrder
  ?[selectedOrder.orderNumber,selectedOrder.customerName].filter(Boolean).join(" · ")
  :selectedProject?.title
   ?selectedProject.title+" (eldre prosjektkobling)"
   :"Ikke koblet til oppdrag";
 const clearMeasures=()=>mutate(d=>({...d,measurements:[]}));
 const importJson=e=>{const file=e.target.files?.[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(String(r.result));if(!Array.isArray(x.walls)||!Array.isArray(x.items))throw new Error();const next={...initial(),...x,id:uid(),name:(x.name||"Importert tegning")+" – kopi"};setDoc(next);setSelected(null);setHistory([]);setMessage("Importert – trykk Lagre")}catch{alert("Filen ser ikke ut som en gyldig Aadland-tegning.")}};r.readAsText(file);e.target.value=""};
 const deleteDoc=async()=>{if(!confirm("Slette denne tegningen?"))return;if(doc.serverId){try{const r=await fetch("/api/admin/project-drawings",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:doc.serverId})});const x=await r.json();if(!r.ok&&!x.setupRequired){setMessage("Kunne ikke slette fra oppdraget");return}}catch{setMessage("Server utilgjengelig");return}}const list=docs.filter(x=>x.id!==doc.id);setDocs(list);localStorage.setItem(STORE,JSON.stringify(list));setDoc(list[0]||initial());setSelected(null);setHistory([]);setFuture([])};
 const exportJson=()=>{const blob=new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(doc.name||"tegning").replace(/[^a-z0-9æøå]+/gi,"-")+".json";a.click();URL.revokeObjectURL(a.href)};
 const quantityText=()=>{const lines=["Mengdegrunnlag fra tegning: "+(doc.name||"Tegning"),""];if(summary.zoneRows.length){for(const z of summary.zoneRows){lines.push((z.name||"Rom")+": "+z.area.toFixed(2)+" m² gulv/tak · "+z.perimeter.toFixed(2)+" lm brutto list · "+z.wallArea.toFixed(2)+" m² brutto vegg"+(z.floorFinish?" · "+z.floorFinish:""));}}else{lines.push("Gulvareal lukket rom: "+(summary.floorM2==null?"ikke beregnet":summary.floorM2.toFixed(2)+" m²"));lines.push("Netto veggflate: "+summary.netWallM2.toFixed(2)+" m²");}lines.push("Åpningsareal: "+summary.openingM2.toFixed(2)+" m²");lines.push("Dører/skyvedører: "+summary.doors+" · Vinduer: "+summary.windows);if(doc.notes)lines.push("","Tegningsnotat: "+doc.notes);return lines.join("\n")};
 const quoteLinesFromDrawing=()=>{const rows=[];if(summary.zoneRows.length){for(const z of summary.zoneRows){const name=z.name||"Rom",finish=z.floorFinish?" · "+z.floorFinish:"";rows.push({type:"other",description:"Gulvareal – "+name+finish,quantity:Number(z.area.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});rows.push({type:"other",description:"Takareal – "+name,quantity:Number(z.area.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});rows.push({type:"other",description:"Gulvlister, brutto – "+name,quantity:Number(z.perimeter.toFixed(2)),unit:"lm",unitPriceOre:"",vatRate:25});rows.push({type:"other",description:"Veggflate, brutto – "+name,quantity:Number(z.wallArea.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});}}else{if(summary.floorM2!=null&&summary.floorM2>0){rows.push({type:"other",description:"Gulvareal fra tegning",quantity:Number(summary.floorM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});rows.push({type:"other",description:"Takareal fra tegning",quantity:Number(summary.floorM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});}if(summary.netWallM2>0)rows.push({type:"other",description:"Netto veggflate fra tegning",quantity:Number(summary.netWallM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});}return rows};
 const newQuoteFromDrawing=()=>{try{const lines=quoteLinesFromDrawing();sessionStorage.setItem("aadlandQuoteDraftFromDrawing",JSON.stringify({title:"Tilbud – "+(doc.name||"tegning"),customer:{name:doc.customer||"",address:doc.address||""},notes:quantityText(),lineItems:lines}));window.location.href="/admin/tilbud/ny"+(doc.orderId?"?orderId="+encodeURIComponent(doc.orderId):"")}catch{setMessage("Kunne ikke åpne tilbudskladd");setTimeout(()=>setMessage(""),1800)}};
 const drawingBounds=()=>{const xs=[],ys=[];for(const w of doc.walls){xs.push(w.x1,w.x2);ys.push(w.y1,w.y2)}for(const o of doc.items){xs.push(o.x,o.x+o.w);ys.push(o.y,o.y+o.h)}for(const z of doc.zones||[]){for(const p of z.points||[]){xs.push(p.x);ys.push(p.y)}}if(!xs.length)return{x:0,y:0,w:VIEW,h:VIEW};const pad=350,minX=Math.max(0,Math.min(...xs)-pad),minY=Math.max(0,Math.min(...ys)-pad),maxX=Math.min(VIEW,Math.max(...xs)+pad),maxY=Math.min(VIEW,Math.max(...ys)+pad);return{x:minX,y:minY,w:Math.max(500,maxX-minX),h:Math.max(500,maxY-minY)}};
 const exportPng=()=>{try{const source=svg.current;if(!source)return;const clone=source.cloneNode(true),b=drawingBounds(),maxPx=1800,scale=Math.min(maxPx/b.w,maxPx/b.h),width=Math.max(600,Math.round(b.w*scale)),height=Math.max(600,Math.round(b.h*scale));clone.setAttribute("viewBox",b.x+" "+b.y+" "+b.w+" "+b.h);clone.setAttribute("width",String(width));clone.setAttribute("height",String(height));const data=new XMLSerializer().serializeToString(clone),blob=new Blob([data],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);URL.revokeObjectURL(url);canvas.toBlob(png=>{if(!png)return;const a=document.createElement("a");a.href=URL.createObjectURL(png);a.download=(doc.name||"tegning").replace(/[^a-z0-9æøå]+/gi,"-")+"-grunnlag.png";a.click();URL.revokeObjectURL(a.href)},"image/png")};img.onerror=()=>{URL.revokeObjectURL(url);setMessage("Kunne ikke lage PNG");setTimeout(()=>setMessage(""),1800)};img.src=url}catch{setMessage("Kunne ikke lage PNG");setTimeout(()=>setMessage(""),1800)}};
 const aiBrief=()=>{
  const lines=[
   "Lag en realistisk visualisering basert på vedlagte plantegning og eventuelt kundebilde.",
   "",
   "Prosjekt: "+(doc.name||"Tegning"),
   doc.customer?"Kunde: "+doc.customer:"",
   doc.address?"Adresse/arbeidssted: "+doc.address:"",
   "",
   "Rom og hovedmål:"
  ];
  if(summary.zoneRows.length){
   for(const z of summary.zoneRows){
    lines.push("- "+(z.name||"Rom")+": "+z.area.toFixed(2)+" m², omkrets "+z.perimeter.toFixed(2)+" m, takhøyde "+(Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400)+" mm"+(z.floorFinish?", gulv/overflate: "+z.floorFinish:""));
   }
  }else{
   lines.push("- Vegger totalt: "+summary.wallM.toFixed(2)+" lm","- Gulvareal: "+(summary.floorM2==null?"ikke beregnet":summary.floorM2.toFixed(2)+" m²"));
  }
  if(doc.walls.length){
   lines.push("","Vegger:");
   doc.walls.forEach((w,index)=>lines.push("- Vegg "+(index+1)+": "+len(w)+" mm lang, "+Math.round(Number(w.h)||2400)+" mm høy, "+Math.round(Number(w.t)||98)+" mm tykk, vinkel "+angle(w)+"°"));
  }
  if(doc.items.length){
   lines.push("","Åpninger, innredning og objekter:");
   doc.items.forEach((o,index)=>{
    const extra=[];
    if(openingTypes.has(o.type))extra.push((o.type==="window"?"vindushøyde ":"åpningshøyde ")+Math.round(Number(o.openingHeight)||openingDefaults(o.type).openingHeight||0)+" mm");
    if(o.type==="window")extra.push("brystning "+Math.round(Number(o.sillHeight)||0)+" mm");
    if(o.wallId&&Number.isFinite(o.wallOffset))extra.push("senter "+Math.round(o.wallOffset)+" mm fra veggens start");
    lines.push("- "+(index+1)+". "+labelFor(o.type)+": "+Math.round(o.w)+" × "+Math.round(o.h)+" mm, rotasjon "+Math.round(Number(o.rot)||0)+"°"+(extra.length?" · "+extra.join(", "):""));
   });
  }
  const counts=[["Dører/skyvedører",summary.doors],["Vinduer",summary.windows],["Stolper",summary.posts]].filter(x=>x[1]);
  if(counts.length)lines.push("","Antall:",...counts.map(([label,count])=>"- "+label+": "+count));
  if(doc.notes)lines.push("","Notater fra befaring: "+doc.notes);
  if(doc.visualizationNotes)lines.push("","Ønsket uttrykk / endringer i visualiseringen: "+doc.visualizationNotes);
  lines.push(
   "",
   "Krav til visualiseringen:",
   "- Behold romgeometri, vegglengder, åpninger og hovedplasseringer fra tegningen.",
   "- Bruk målgrunnlaget som styrende og ikke flytt vegger, dører eller vinduer uten at det uttrykkelig bes om det.",
   "- Respekter oppgitte høyder, bredder og brystningshøyder.",
   "- Resultatet skal være en realistisk illustrasjon av ferdig løsning, ikke en teknisk arbeidstegning.",
   "- Dersom noe ikke kan avgjøres fra grunnlaget, behold eksisterende løsning fremfor å finne på nye bygningsmessige endringer."
  );
  return lines.filter(line=>line!==null&&line!==undefined).join("\n");
 };
 const copyAiBrief=async(showMessage=true)=>{try{await navigator.clipboard.writeText(aiBrief());if(showMessage){setMessage("ChatGPT-brief kopiert");setTimeout(()=>setMessage(""),1800)}return true}catch{if(showMessage){setMessage("Kunne ikke kopiere brief");setTimeout(()=>setMessage(""),1800)}return false}};
 const prepareChatGptPackage=async()=>{const copied=await copyAiBrief(false);exportPng();setMessage(copied?"PNG eksporteres · ChatGPT-brief kopiert":"PNG eksporteres · brief kunne ikke kopieres");setTimeout(()=>setMessage(""),2600)};
 return <main className={styles.shell+(fieldMode?" "+styles.fieldMode:"")}>
  <header className={styles.top}><Link href="/admin">← Backoffice</Link><strong>Tegning & visualisering</strong><input className={styles.name} value={doc.name} onChange={e=>setDoc(d=>({...d,name:e.target.value}))}/><span className={styles.saved}>{message||"Autolagres lokalt"}</span><button className={styles.btn} onClick={()=>persist()}>Lagre på oppdrag</button><button className={styles.btn} onClick={undo} disabled={!history.length}>Angre</button><button className={styles.btn} onClick={redo} disabled={!future.length}>Gjør om</button><button className={styles.btn} onClick={()=>zoomBy(-.25)}>−</button><span className={styles.zoom}>{Math.round((doc.zoom||1)*100)}%</span><button className={styles.btn} onClick={()=>zoomBy(.25)}>+</button><button className={styles.btn} onClick={fitView}>Tilpass</button><button className={tool==="pan"?styles.activeBtn:styles.btn} onClick={()=>{setTool(tool==="pan"?"select":"pan");setDraft(null);setMeasureDraft(null)}}>Flytt visning</button><button className={styles.btn} onClick={()=>window.print()}>PDF</button><button className={styles.btn} onClick={newQuoteFromDrawing}>Nytt tilbud fra tegning</button></header>
  <nav className={styles.mobileTools} aria-label="Tegneverktøy mobil">
   <button type="button" className={tool==="select"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("select");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Velg</button>
   <button type="button" className={tool==="wall"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("wall");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Vegg</button>
   <button type="button" className={tool==="pan"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("pan");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Flytt</button>
   <button type="button" className={tool==="measure"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("measure");setDraft(null);setWallChain(null);setSnapHint(null);setZoneDraft([]);setMeasureDraft(null)}}>Mål</button>
   <button type="button" className={tool==="zone"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("zone");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Romsone</button>
   <button type="button" className={quickAddOpen?styles.mobileActive:styles.mobileTool} onClick={()=>{setMobileEditOpen(false);setQuickAddOpen(value=>!value)}}>+ Legg til</button><button type="button" className={fieldMode?styles.mobileActive:styles.mobileTool} onClick={()=>{setFieldMode(value=>!value);setQuickAddOpen(false);setMobileEditOpen(false)}}>{fieldMode?"Avslutt befaring":"Befaring"}</button>
   {(draft||measureDraft||zoneDraft.length>0)&&<button type="button" className={styles.mobileDone} onClick={()=>{if(tool==="zone"&&zoneDraft.length>=3)finishZone();else{setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([]);setTool("select")}}}>{tool==="zone"&&zoneDraft.length>=3?"Lukk sone":"Ferdig"}</button>}
   <span className={styles.mobileDivider}/>
   <button type="button" className={styles.mobileTool} onClick={undo} disabled={!history.length}>↶</button>
   <button type="button" className={styles.mobileTool} onClick={redo} disabled={!future.length}>↷</button>
   <button type="button" className={styles.mobileTool} onClick={()=>zoomBy(-.25)}>−</button>
   <span className={styles.mobileZoom}>{Math.round((doc.zoom||1)*100)}%</span>
   <button type="button" className={styles.mobileTool} onClick={()=>zoomBy(.25)}>+</button>
   <button type="button" className={styles.mobileTool} onClick={fitView}>Tilpass</button>
   <span className={styles.mobileDivider}/>
   <button type="button" className={styles.mobileTool} onClick={()=>scrollPanel(leftPanel)}>Objekter</button>
   <button type="button" className={styles.mobileTool} onClick={()=>scrollPanel(rightPanel)}>Egenskaper</button>
   <button type="button" className={styles.mobileSave} onClick={()=>persist()}>Lagre</button>
  </nav>
  {quickAddOpen&&<div className={styles.mobileQuickAdd}>
   <button type="button" onClick={openWallBuilder}>↔ Vegg med mål</button>
   <button type="button" onClick={makeRoom}>▭ Rektangulært rom</button>
   <button type="button" onClick={makeLRoom}>⌞ L-rom</button>
   <button type="button" onClick={()=>addItem("door",900,100)}>Dør 90</button>
   <button type="button" onClick={()=>addItem("window",1200,100)}>Vindu 120</button>
   <button type="button" onClick={()=>addItem("opening",1000,100)}>Åpning 100</button>
   <button type="button" onClick={()=>addItem("shower",900,900)}>Dusj 90×90</button>
   <button type="button" onClick={()=>addItem("toilet",400,700)}>Toalett</button>
   <button type="button" onClick={()=>addItem("sink",600,500)}>Servant 60</button>
   <button type="button" onClick={()=>addItem("base",600,600)}>Benkeskap 60</button>
   <button type="button" onClick={()=>addItem("washer",600,600)}>Vaskemaskin</button>
  </div>}
  {sel&&!quickAddOpen&&<div className={styles.mobileSelection}>
   <div><span>VALGT</span><strong>{selected.kind==="wall"?"Vegg · "+len(sel)+" mm · "+angle(sel)+"°":selected.kind==="zone"?(sel.name||"Romsone")+" · "+polygonAreaM2(sel.points).toFixed(2)+" m²":labelFor(sel.type)+" · "+Math.round(sel.w)+" × "+Math.round(sel.h)+" mm"}</strong></div>
   <button type="button" onClick={()=>setMobileEditOpen(value=>!value)}>{mobileEditOpen?"Lukk":"Rediger mål"}</button>
  </div>}
  {sel&&!quickAddOpen&&mobileEditOpen&&<div className={styles.mobileInspector}>
   {selected.kind==="wall"?<>
    <label>Lengde (mm)<input key={"ml-"+sel.id+"-"+len(sel)} type="number" inputMode="numeric" defaultValue={len(sel)} onBlur={e=>update("len",e.target.value)}/></label>
    <label>Vinkel (°)<input key={"ma-"+sel.id+"-"+angle(sel)} type="number" inputMode="decimal" defaultValue={angle(sel)} onBlur={e=>update("angle",e.target.value)}/></label>
    <label>Høyde (mm)<input key={"mh-"+sel.id+"-"+sel.h} type="number" inputMode="numeric" defaultValue={Math.round(sel.h||2400)} onBlur={e=>update("h",e.target.value)}/></label>
    <label>Tykkelse (mm)<input key={"mt-"+sel.id+"-"+sel.t} type="number" inputMode="numeric" defaultValue={Math.round(sel.t||98)} onBlur={e=>update("t",e.target.value)}/></label>
    <div className={styles.mobileAngles}>{[0,90,180,270].map(value=><button type="button" key={value} onClick={()=>update("angle",value)}>{value}°</button>)}</div>
   </>:selected.kind==="zone"?<>
    <label>Romnavn<input key={"zn-"+sel.id+"-"+sel.name} defaultValue={sel.name||""} onBlur={e=>updateZoneField("name",e.target.value)}/></label>
    <label>Takhøyde (mm)<input key={"zh-"+sel.id+"-"+sel.ceilingHeight} type="number" inputMode="numeric" defaultValue={Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400} onBlur={e=>updateZoneField("ceilingHeight",e.target.value,true)}/></label>
   </>:<>
    <label>Bredde (mm)<input key={"iw-"+sel.id+"-"+sel.w} type="number" inputMode="numeric" defaultValue={Math.round(sel.w)} onBlur={e=>update("w",e.target.value)}/></label>
    <label>Dybde/lengde (mm)<input key={"ih-"+sel.id+"-"+sel.h} type="number" inputMode="numeric" defaultValue={Math.round(sel.h)} onBlur={e=>update("h",e.target.value)}/></label>
    <label>Rotasjon (°)<input key={"ir-"+sel.id+"-"+sel.rot} type="number" inputMode="decimal" defaultValue={Math.round(Number(sel.rot)||0)} onBlur={e=>update("rot",e.target.value)}/></label>
    {openingTypes.has(sel.type)&&<label>{sel.type==="window"?"Vindushøyde (mm)":"Åpningshøyde (mm)"}<input key={"io-"+sel.id+"-"+sel.openingHeight} type="number" inputMode="numeric" defaultValue={Math.round(Number(sel.openingHeight)||openingDefaults(sel.type).openingHeight||2100)} onBlur={e=>update("openingHeight",e.target.value)}/></label>}
    {sel.type==="window"&&<label>Brystning (mm)<input key={"is-"+sel.id+"-"+sel.sillHeight} type="number" inputMode="numeric" defaultValue={Math.round(Number(sel.sillHeight)||0)} onBlur={e=>update("sillHeight",e.target.value)}/></label>}
   </>}
   <div className={styles.mobileObjectActions}>
    {selected.kind==="item"&&sel.type==="door"&&<button type="button" onClick={flipDoor}>Speil dør</button>}
    {selected.kind==="item"&&sel.wallId&&<button type="button" onClick={detach}>Løsne</button>}
    {selected.kind==="item"&&<button type="button" onClick={duplicate}>Dupliser</button>}
    <button type="button" className={styles.mobileDanger} onClick={remove}>Slett valgt</button>
   </div>
   <button type="button" className={styles.mobileAllProps} onClick={()=>scrollPanel(rightPanel)}>Vis alle egenskaper</button>
  </div>}
  {wallBuilder&&<div className={styles.roomModalBackdrop} role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)setWallBuilder(null)}}>
   <section className={styles.roomModal} role="dialog" aria-modal="true" aria-label="Lag vegg med mål">
    <div className={styles.roomModalHead}><div><span>NY VEGG</span><h2>Vegg med eksakte mål</h2></div><button type="button" onClick={()=>setWallBuilder(null)} aria-label="Lukk">×</button></div>
    <div className={styles.roomModalGrid}>
     <label>Lengde (mm)<input autoFocus type="number" inputMode="numeric" min="100" max="12000" value={wallBuilder.length} onChange={e=>setWallBuilder(v=>({...v,length:e.target.value}))}/></label>
     <label>Vinkel (°)<input type="number" inputMode="decimal" value={wallBuilder.angle} onChange={e=>setWallBuilder(v=>({...v,angle:e.target.value}))}/></label>
     <label>Tykkelse (mm)<input type="number" inputMode="numeric" min="40" value={wallBuilder.thickness} onChange={e=>setWallBuilder(v=>({...v,thickness:e.target.value}))}/></label>
     <label>Høyde (mm)<input type="number" inputMode="numeric" min="300" value={wallBuilder.height} onChange={e=>setWallBuilder(v=>({...v,height:e.target.value}))}/></label>
    </div>
    <div className={styles.wallAngleButtons}>{[0,45,90,135,180,225,270,315].map(value=><button type="button" key={value} onClick={()=>setWallBuilder(v=>({...v,angle:String(value)}))}>{value}°</button>)}</div>
    {selected?.kind==="wall"&&<label className={styles.wallConnect}><input type="checkbox" checked={wallBuilder.connectToSelected} onChange={e=>setWallBuilder(v=>({...v,connectToSelected:e.target.checked}))}/> Start fra enden av valgt vegg</label>}
    <p>{wallBuilder.connectToSelected&&selected?.kind==="wall"?"Den nye veggen starter nøyaktig i endepunktet på veggen du valgte.":"Veggen plasseres midt i området du ser på."}</p>
    <div className={styles.roomModalActions}><button type="button" onClick={()=>setWallBuilder(null)}>Avbryt</button><button type="button" onClick={createExactWall}>Lag vegg</button></div>
   </section>
  </div>}
  {roomBuilder&&<div className={styles.roomModalBackdrop} role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)setRoomBuilder(null)}}>
   <section className={styles.roomModal} role="dialog" aria-modal="true" aria-label={roomBuilder.type==="l"?"Lag L-rom":"Lag rektangulært rom"}>
    <div className={styles.roomModalHead}><div><span>NYTT ROM</span><h2>{roomBuilder.type==="l"?"L-formet rom":"Rektangulært rom"}</h2></div><button type="button" onClick={()=>setRoomBuilder(null)} aria-label="Lukk">×</button></div>
    <label>Romnavn<input autoFocus value={roomBuilder.name} onChange={e=>setRoomBuilder(v=>({...v,name:e.target.value}))}/></label>
    <div className={styles.roomModalGrid}>
     <label>Lengde (mm)<input type="number" inputMode="numeric" min="300" max="7000" value={roomBuilder.w} onChange={e=>setRoomBuilder(v=>({...v,w:e.target.value}))}/></label>
     <label>Bredde (mm)<input type="number" inputMode="numeric" min="300" max="7000" value={roomBuilder.h} onChange={e=>setRoomBuilder(v=>({...v,h:e.target.value}))}/></label>
     {roomBuilder.type==="l"&&<>
      <label>Innhakk bredde (mm)<input type="number" inputMode="numeric" min="300" value={roomBuilder.rw} onChange={e=>setRoomBuilder(v=>({...v,rw:e.target.value}))}/></label>
      <label>Innhakk dybde (mm)<input type="number" inputMode="numeric" min="300" value={roomBuilder.rh} onChange={e=>setRoomBuilder(v=>({...v,rh:e.target.value}))}/></label>
     </>}
    </div>
    <div className={styles.roomPreview} aria-hidden="true"><div className={roomBuilder.type==="l"?styles.roomLShape:styles.roomRectShape}/></div>
    <p>Rommet plasseres midt i det du ser på tegneflaten. Vegger får standard tykkelse <b>{doc.defaultWallThickness||98} mm</b> og høyde <b>{doc.defaultWallHeight||2400} mm</b>.</p>
    <div className={styles.roomModalActions}><button type="button" onClick={()=>setRoomBuilder(null)}>Avbryt</button><button type="button" onClick={createRoom}>Lag rom</button></div>
   </section>
  </div>}
  <div className={styles.layout}>
   <aside ref={leftPanel} className={styles.panel+" "+styles.left}>
    <div className={styles.group}><h2>Tegninger</h2><div className={styles.row}><button className={styles.btn} onClick={newDoc}>+ Ny</button><button className={styles.btn} onClick={exportJson}>Eksporter</button><label className={styles.btn}>Importer<input className={styles.hiddenFile} type="file" accept="application/json,.json" onChange={importJson}/></label><button className={styles.btn+" "+styles.danger} onClick={deleteDoc}>Slett</button></div>{docs.length>0&&<select className={styles.select} value={doc.id} onChange={e=>openDoc(e.target.value)}>{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}<div className={styles.field}><label>Koble til oppdrag</label><select className={styles.select} value={doc.orderId||""} onChange={changeOrder}><option value="">Ikke koblet</option>{orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.customerName||"Uten kundenavn"}</option>)}</select><small className={styles.muted}>Velger du et oppdrag, hentes kunde og arbeidsadresse automatisk og tegningen lagres på oppdraget.</small></div>{doc.projectId&&<div className={styles.field}><label>Eldre prosjektkobling</label><select className={styles.select} value={doc.projectId||""} onChange={changeProject}><option value="">Fjern eldre kobling</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div>}<div className={styles.field}><label>Kunde</label><input value={doc.customer||""} onChange={e=>setDoc(d=>({...d,customer:e.target.value}))}/></div><div className={styles.field}><label>Adresse</label><input value={doc.address||""} onChange={e=>setDoc(d=>({...d,address:e.target.value}))}/></div><div className={styles.field}><label>Notater</label><textarea className={styles.textarea} value={doc.notes||""} onChange={e=>setDoc(d=>({...d,notes:e.target.value}))}/></div></div>
    <div className={styles.group}><h2>Innstillinger</h2><div className={styles.field}><label>Snap/rutenett</label><select className={styles.select} value={doc.snapSize||50} onChange={e=>setDoc(d=>({...d,snapSize:Number(e.target.value)}))}><option value="10">10 mm</option><option value="25">25 mm</option><option value="50">50 mm</option><option value="100">100 mm</option></select></div><div className={styles.field}><label>Standard veggtykkelse</label><select className={styles.select} value={doc.defaultWallThickness||98} onChange={e=>setDoc(d=>({...d,defaultWallThickness:Number(e.target.value)}))}><option value="70">70 mm</option><option value="98">98 mm</option><option value="120">120 mm</option><option value="198">198 mm</option><option value="248">248 mm</option></select></div><div className={styles.field}><label>Standard vegghøyde</label><select className={styles.select} value={doc.defaultWallHeight||2400} onChange={e=>setDoc(d=>({...d,defaultWallHeight:Number(e.target.value)}))}><option value="2200">2200 mm</option><option value="2400">2400 mm</option><option value="2500">2500 mm</option><option value="2600">2600 mm</option><option value="2700">2700 mm</option></select></div><div className={styles.field}><label>PDF-målestokk</label><select className={styles.select} value={doc.scale||"1:50"} onChange={e=>setDoc(d=>({...d,scale:e.target.value}))}><option>1:20</option><option>1:25</option><option>1:50</option><option>1:100</option></select></div><label className={styles.check}><input type="checkbox" checked={doc.showGrid!==false} onChange={e=>setDoc(d=>({...d,showGrid:e.target.checked}))}/> Vis rutenett</label></div><div className={styles.group}><h2>Rom og vegger</h2><div className={styles.row}><button className={tool==="wall"?styles.activeBtn:styles.btn} onClick={()=>{setTool("wall");setDraft(null);setWallChain(null);setSnapHint(null)}}>Tegn vegg</button><button className={styles.btn} onClick={makeRoom}>Rektangulært rom</button><button className={styles.btn} onClick={makeLRoom}>L-formet rom</button><button className={tool==="zone"?styles.activeBtn:styles.btn} onClick={()=>{setTool("zone");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Tegn romsone</button>{tool==="zone"&&<><button className={styles.btn} onClick={finishZone} disabled={zoneDraft.length<3}>Lukk romsone</button><button className={styles.btn} onClick={cancelZone}>Avbryt sone</button></>}<button className={tool==="measure"?styles.activeBtn:styles.btn} onClick={()=>{setTool("measure");setDraft(null);setWallChain(null);setSnapHint(null);setZoneDraft([]);setMeasureDraft(null)}}>Mål avstand</button><button className={styles.btn} onClick={clearMeasures}>Fjern mål</button></div><p className={styles.muted}>Nye vegger bruker standard tykkelse og høyde over. Med «Tegn romsone» klikker du rundt innsiden av et rom og avslutter med «Lukk romsone». Da beregnes gulv/tak, brutto listelengde og veggflate per rom.</p></div>
    {catalog.map(g=><div className={styles.group} key={g.group}><h2>{g.group}</h2><div className={styles.library}>{g.items.map(([t,l,w,h])=><button key={t} onClick={()=>addItem(t,w,h)}>{l}<small>{w} × {h} mm</small></button>)}</div></div>)}
   </aside>
   <section className={styles.workspace}><div className={styles.printHead}><h1>{doc.name}</h1><p>{[doc.customer,doc.address].filter(Boolean).join(" · ")}</p><p>Oppdrag: {projectLabel}</p><p>Målestokk: {doc.scale||"1:50"} · Alle mål i mm · Aadland Service</p></div><div className={styles.printSummary}><div><span>Vegger</span><b>{summary.wallM.toFixed(2)} lm</b></div><div><span>Gulvareal</span><b>{summary.floorM2==null?"—":summary.floorM2.toFixed(2)+" m²"}</b></div><div><span>Brutto veggflate</span><b>{summary.wallM2.toFixed(2)} m²</b></div><div><span>Åpningsareal</span><b>{summary.openingM2.toFixed(2)} m²</b></div><div><span>Netto veggflate</span><b>{summary.netWallM2.toFixed(2)} m²</b></div><div><span>Dører / vinduer</span><b>{summary.doors} / {summary.windows}</b></div>{summary.zoneRows.length>0&&<><div><span>Romsone gulv/tak</span><b>{summary.zonedFloorM2.toFixed(2)} m²</b></div><div><span>Brutto listelengde</span><b>{summary.zonePerimeterM.toFixed(2)} lm</b></div><div><span>Romsone veggflate</span><b>{summary.zoneWallM2.toFixed(2)} m²</b></div></>}{doc.notes&&<div className={styles.printNotes}><span>Notater</span><b>{doc.notes}</b></div>}</div><div className={styles.canvasWrap}><div className={styles.mobileCanvasHint}>Én finger: tegn/velg · To fingre: zoom og flytt</div><svg ref={svg} className={styles.canvas} viewBox={pan.x+" "+pan.y+" "+viewWidth+" "+viewHeight} onPointerDownCapture={pointerDownCapture} onPointerMoveCapture={pointerMoveCapture} onPointerUpCapture={pointerUpCapture} onPointerCancelCapture={pointerUpCapture} onPointerDown={canvasDown} onPointerMove={move} onPointerUp={up} onPointerLeave={e=>{if(e.pointerType!=="touch")up(e)}} onWheel={e=>{e.preventDefault();zoomBy(e.deltaY<0?.15:-.15)}}>
    <defs><pattern id="minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={"M "+GRID+" 0 L 0 0 0 "+GRID} fill="none" stroke="#ece9e1" strokeWidth="6"/></pattern><pattern id="major" width="1000" height="1000" patternUnits="userSpaceOnUse"><rect width="1000" height="1000" fill="url(#minor)"/><path d="M1000 0L0 0 0 1000" fill="none" stroke="#d9d5ca" strokeWidth="12"/></pattern></defs>
    <rect data-canvas="yes" width={VIEW} height={VIEW} fill={doc.showGrid===false?"#fff":"url(#major)"}/>
    {(doc.zones||[]).map(z=>{const c=polygonCentroid(z.points),active=selected?.kind==="zone"&&selected.id===z.id;return <g key={z.id} onPointerDown={e=>{if(tool==="zone")return;e.stopPropagation();setTool("select");setSelected({kind:"zone",id:z.id})}} style={{pointerEvents:tool==="zone"?"none":"auto",cursor:"pointer"}}><polygon points={z.points.map(p=>p.x+","+p.y).join(" ")} fill={active?"rgba(207,161,83,.28)":"rgba(50,106,118,.10)"} stroke={active?"#9b7a39":"#326a76"} strokeWidth={active?28:18} strokeDasharray="45 22"/><text x={c.x} y={c.y-35} textAnchor="middle" fontSize="120" fontWeight="700" fill="#274e57">{z.name||"Rom"}</text><text x={c.x} y={c.y+95} textAnchor="middle" fontSize="90" fill="#326a76">{polygonAreaM2(z.points).toFixed(2)} m²</text>{active&&z.points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="190" fill="transparent" onPointerDown={e=>downZonePoint(e,z,i)}/><circle cx={p.x} cy={p.y} r="55" fill="#fff" stroke="#9b7a39" strokeWidth="20" pointerEvents="none"/></g>)}</g>})}
    {zoneDraft.length>0&&<g style={{pointerEvents:"none"}}><polyline points={zoneDraft.map(p=>p.x+","+p.y).join(" ")} fill="rgba(207,161,83,.12)" stroke="#9b7a39" strokeWidth="24" strokeDasharray="45 22"/>{zoneDraft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="38" fill="#9b7a39"/>)}</g>}
    {doc.walls.map(w=><g key={w.id} onPointerDown={e=>{e.stopPropagation();setTool("select");setSelected({kind:"wall",id:w.id})}} className={styles.pick}><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="transparent" strokeWidth="260" strokeLinecap="round"/><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={selected?.id===w.id?"#9b7a39":"#222"} strokeWidth={Math.max(35,w.t)} strokeLinecap="square"/>{selected?.kind==="wall"&&selected.id===w.id&&<><circle cx={w.x1} cy={w.y1} r="190" fill="transparent" onPointerDown={e=>downWallEnd(e,w,1)}/><circle cx={w.x2} cy={w.y2} r="190" fill="transparent" onPointerDown={e=>downWallEnd(e,w,2)}/><circle cx={w.x1} cy={w.y1} r="70" fill="#fff" stroke="#9b7a39" strokeWidth="22" pointerEvents="none"/><circle cx={w.x2} cy={w.y2} r="70" fill="#fff" stroke="#9b7a39" strokeWidth="22" pointerEvents="none"/></>}{(()=>{const d=dim(w);return <><line x1={d.ax} y1={d.ay} x2={d.bx} y2={d.by} stroke="#777" strokeWidth="10"/><line x1={d.ax-d.nx*60} y1={d.ay-d.ny*60} x2={d.ax+d.nx*60} y2={d.ay+d.ny*60} stroke="#777" strokeWidth="10"/><line x1={d.bx-d.nx*60} y1={d.by-d.ny*60} x2={d.bx+d.nx*60} y2={d.by+d.ny*60} stroke="#777" strokeWidth="10"/><text x={d.mx} y={d.my} textAnchor="middle" fontSize="105">{len(w)} mm · {angle(w)}°</text></>})()}</g>)}
    {doc.items.map(o=><g key={o.id} transform={"translate("+o.x+" "+o.y+") rotate("+o.rot+" "+o.w/2+" "+o.h/2+")"} onPointerDown={e=>downItem(e,o)} className={styles.pick}><rect x="-140" y="-140" width={o.w+280} height={Math.max(o.h,100)+280} fill="transparent"/>{o.type==="door"?<g transform={o.flip?"translate("+o.w+" 0) scale(-1 1)":undefined}><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#51462f" strokeWidth="28"/><path d={"M0 "+o.h/2+" A "+o.w+" "+o.w+" 0 0 1 "+o.w+" "+(o.h/2-o.w)} fill="none" stroke="#8b806a" strokeWidth="18"/></g>:o.type==="sliding"?<><rect width={o.w} height={Math.max(o.h,100)} fill="#f7f7f7" stroke="#51462f" strokeWidth="18"/><line x1="60" y1="20" x2={o.w*.62} y2="20" stroke="#51462f" strokeWidth="22"/><line x1={o.w*.38} y1={o.h-20} x2={o.w-60} y2={o.h-20} stroke="#51462f" strokeWidth="22"/></>:o.type==="opening"?<><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#fff" strokeWidth="100"/><line x1="0" y1="0" x2="0" y2={o.h} stroke="#777" strokeWidth="16"/><line x1={o.w} y1="0" x2={o.w} y2={o.h} stroke="#777" strokeWidth="16"/></>:o.type==="window"?<><rect width={o.w} height={Math.max(o.h,100)} fill="#dfeef1" stroke="#51462f" strokeWidth="18"/><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#64828a" strokeWidth="18"/></>:<rect width={o.w} height={o.h} rx="30" fill={selected?.id===o.id?"#eadcbf":"#f5f1e7"} stroke="#51462f" strokeWidth="18"/>}<text x={o.w/2} y={o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize="100">{labelFor(o.type)}</text><text x={o.w/2} y={o.h/2+125} textAnchor="middle" fontSize="75">{o.w} × {o.h}</text></g>)}
    {(doc.measurements||[]).map(m=><g key={m.id}><line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#326a76" strokeWidth="12" strokeDasharray="35 22"/><circle cx={m.x1} cy={m.y1} r="28" fill="#326a76"/><circle cx={m.x2} cy={m.y2} r="28" fill="#326a76"/><text x={(m.x1+m.x2)/2} y={(m.y1+m.y2)/2-70} textAnchor="middle" fontSize="90" fill="#326a76">{Math.round(Math.hypot(m.x2-m.x1,m.y2-m.y1))} mm</text></g>)}{snapHint&&<g pointerEvents="none"><circle cx={snapHint.x} cy={snapHint.y} r="105" fill="rgba(215,167,78,.18)" stroke="#d7a74e" strokeWidth="26"/><circle cx={snapHint.x} cy={snapHint.y} r="24" fill="#d7a74e"/><text x={snapHint.x+130} y={snapHint.y-105} fontSize="82" fontWeight="700" fill="#8a6729">Snap</text></g>}{draft&&<><circle cx={draft.x} cy={draft.y} r="55" fill="#9b7a39"/><text x={draft.x+90} y={draft.y-80} fontSize="90">Neste veggpunkt</text></>}{measureDraft&&<><circle cx={measureDraft.x} cy={measureDraft.y} r="45" fill="#326a76"/><text x={measureDraft.x+80} y={measureDraft.y-60} fontSize="85" fill="#326a76">Velg endepunkt</text></>}
   </svg></div></section>
   <aside ref={rightPanel} className={styles.panel+" "+styles.right}><h2>Egenskaper</h2>{!sel?<p className={styles.muted}>Velg et objekt, en vegg eller en romsone. Møbler og utstyr kan dras direkte i tegningen. Dører, vinduer, rekkverk og levegger fester seg automatisk til nærmeste vegg når du slipper dem.</p>:selected.kind==="zone"?<><h3>{sel.name||"Romsone"}</h3><div className={styles.field}><label>Romnavn</label><input value={sel.name||""} onChange={e=>updateZoneField("name",e.target.value)}/></div><div className={styles.field}><label>Takhøyde (mm)</label><input type="number" min="300" value={Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400} onChange={e=>updateZoneField("ceilingHeight",e.target.value,true)}/></div><div className={styles.field}><label>Gulv / overflate</label><input value={sel.floorFinish||""} onChange={e=>updateZoneField("floorFinish",e.target.value)} placeholder="F.eks. flis, parkett, vinyl"/></div><div className={styles.field}><label>Romnotat</label><textarea className={styles.textarea} value={sel.notes||""} onChange={e=>updateZoneField("notes",e.target.value)}/></div><p className={styles.muted}>Gulv/tak: <b>{polygonAreaM2(sel.points).toFixed(2)} m²</b><br/>Brutto listelengde: <b>{polygonPerimeterM(sel.points).toFixed(2)} lm</b><br/>Brutto veggflate: <b>{(polygonPerimeterM(sel.points)*((Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400)/1000)).toFixed(2)} m²</b></p><p className={styles.muted}>De markerte hjørnepunktene i tegningen kan dras for å finjustere sonen etter befaringen.</p></>:selected.kind==="wall"?<><h3>Vegg</h3><div className={styles.field}><label>Standard veggtype</label><select className={styles.select} value="" onChange={e=>applyWallPreset(e.target.value)}><option value="">Velg veggtype…</option>{wallPresets.map(([label,t,h])=><option key={label} value={t+"x"+h}>{label}</option>)}</select></div><div className={styles.field}><label>Startpunkt X (mm)</label><input type="number" value={Math.round(sel.x1)} onChange={e=>update("x1",e.target.value)}/></div><div className={styles.field}><label>Startpunkt Y (mm)</label><input type="number" value={Math.round(sel.y1)} onChange={e=>update("y1",e.target.value)}/></div>{[["Lengde (mm)","len",len(sel)],["Vinkel (grader)","angle",angle(sel)],["Tykkelse (mm)","t",sel.t],["Høyde (mm)","h",sel.h]].map(([l,k,v])=><div className={styles.field} key={k}><label>{l}</label><input type="number" value={v} onChange={e=>update(k,e.target.value)}/></div>)}<div className={styles.field}><label>Hurtigvinkel</label><div className={styles.row}>{[0,90,180,270].map(value=><button type="button" key={value} className={Math.abs(angle(sel)-value)<.1?styles.activeBtn:styles.btn} onClick={()=>update("angle",value)}>{value}°</button>)}</div><small className={styles.muted}>Startpunktet beholdes når lengde eller vinkel endres. Dører og vinduer som er festet til veggen følger med.</small></div></>:<><h3>{labelFor(sel.type)}</h3>{sizePresets[sel.type]?.length>0&&<div className={styles.field}><label>Standardmål</label><select className={styles.select} value="" onChange={e=>applySizePreset(e.target.value)}><option value="">Velg standardmål…</option>{sizePresets[sel.type].map(([label,w,h])=><option key={label+"-"+w+"-"+h} value={w+"x"+h}>{label}</option>)}</select><small className={styles.muted}>Standardmålet beholder objektets senterpunkt. Du kan fortsatt finjustere målene under.</small></div>}{openingTypes.has(sel.type)&&<><div className={styles.field}><label>{sel.type==="window"?"Vindushøyde (mm)":"Åpningshøyde (mm)"}</label><input type="number" min="100" value={Math.round(Number(sel.openingHeight)||openingDefaults(sel.type).openingHeight||2100)} onChange={e=>update("openingHeight",e.target.value)}/></div>{sel.type==="window"&&<div className={styles.field}><label>Brystningshøyde (mm)</label><input type="number" min="0" value={Math.round(Number(sel.sillHeight)||0)} onChange={e=>update("sillHeight",e.target.value)}/><small className={styles.muted}>Avstand fra ferdig gulv til underkant vindu.</small></div>}</>}{[["Bredde (mm)","w"],["Dybde/lengde (mm)","h"],["X-posisjon (mm)","x"],["Y-posisjon (mm)","y"],["Rotasjon (grader)","rot"]].map(([l,k])=><div className={styles.field} key={k}><label>{l}</label><input type="number" value={Math.round(sel[k])} onChange={e=>update(k,e.target.value)}/></div>)}{sel.wallId&&doc.walls.find(w=>w.id===sel.wallId)&&(()=>{const wall=doc.walls.find(w=>w.id===sel.wallId),gaps=wallEdgeOffsets(sel,wall),maxGap=Math.max(0,gaps.L-Math.max(0,Number(sel.w)||0));return <div className={styles.field}><label>Plassering på vegg</label>{gaps.tooWide&&<p className={styles.muted}><b>Obs:</b> Objektet er bredere enn veggen og kan ikke plasseres helt innenfor.</p>}<label>Fra start/hjørne til nærmeste objektkant (mm)</label><input type="number" min="0" max={maxGap} value={gaps.start} onChange={e=>update("wallStartGap",e.target.value)}/><label>Fra motsatt objektkant til veggslutt (mm)</label><input type="number" min="0" max={maxGap} value={gaps.end} onChange={e=>update("wallEndGap",e.target.value)}/><small className={styles.muted}>Begge målene går til objektets kant, ikke senter. Objektet holdes automatisk innenfor veggen når det er plass.</small></div>})()}<div className={styles.row}>{sel.type==="door"&&<button className={styles.btn} onClick={flipDoor}>Speil slagretning</button>}{sel.wallId&&<button className={styles.btn} onClick={detach}>Løsne fra vegg</button>}<button className={styles.btn} onClick={duplicate}>Dupliser</button></div></>} {sel&&<button className={styles.btn+" "+styles.danger} onClick={remove}>Slett valgt</button>}
    <div className={styles.group+" "+styles.ai}><h2>Tegningsinfo</h2><p className={styles.muted}>Oppdrag: <b>{projectLabel}</b><br/>Målestokk for utskrift: <b>{doc.scale||"1:50"}</b><br/>Alle oppgitte mål er i millimeter.</p></div><div className={styles.group+" "+styles.ai}><h2>Mengder fra tegning</h2><p className={styles.muted}>Vegger: <b>{summary.wallM.toFixed(2)} lm</b><br/>Brutto veggflate: <b>{summary.wallM2.toFixed(2)} m²</b><br/>Åpningsareal i vegg: <b>{summary.openingM2.toFixed(2)} m²</b><br/>Netto veggflate: <b>{summary.netWallM2.toFixed(2)} m²</b><br/>Gulvareal lukket rom: <b>{summary.floorM2==null?"—":summary.floorM2.toFixed(2)+" m²"}</b><br/>Terrassefelt: <b>{summary.deckM2.toFixed(2)} m²</b><br/>Dører/skyvedører: <b>{summary.doors}</b><br/>Vinduer: <b>{summary.windows}</b><br/>Stolper: <b>{summary.posts}</b><br/>Objekter totalt: <b>{summary.objects}</b>{summary.zoneRows.length>0&&<><br/><br/>Romsoner: <b>{summary.zoneRows.length}</b><br/>Samlet gulv/tak: <b>{summary.zonedFloorM2.toFixed(2)} m²</b><br/>Brutto listelengde: <b>{summary.zonePerimeterM.toFixed(2)} lm</b><br/>Brutto rom-veggflate: <b>{summary.zoneWallM2.toFixed(2)} m²</b></>}</p>{summary.zoneRows.length>0&&<div className={styles.zoneList}>{summary.zoneRows.map(z=><button type="button" key={z.id} onClick={()=>setSelected({kind:"zone",id:z.id})}><span>{z.name||"Rom"}</span><b>{z.area.toFixed(2)} m²</b></button>)}</div>}</div><div className={styles.group+" "+styles.ai}><h2>AI-visualisering</h2><p className={styles.muted}>Bruk plantegningen som målgrunnlag sammen med kundebilde i ChatGPT. Briefen inkluderer vegger, åpninger, høyder, standardmål og plasseringer.</p><div className={styles.field}><label>Ønsket uttrykk / endringer</label><textarea className={styles.textarea} value={doc.visualizationNotes||""} onChange={e=>setDoc(d=>({...d,visualizationNotes:e.target.value}))} placeholder="F.eks. lyse eikefronter, beige fliser, behold vinduene, fjern overskap på høyre vegg…"/></div><div className={styles.row}><button type="button" className={styles.activeBtn} onClick={prepareChatGptPackage}>Klargjør for ChatGPT</button><button type="button" className={styles.btn} onClick={exportPng}>Bare PNG</button><button type="button" className={styles.btn} onClick={()=>copyAiBrief()}>Bare brief</button></div><p className={styles.muted}>«Klargjør for ChatGPT» eksporterer tegningen som PNG og kopierer den detaljerte briefen. Legg ved PNG-en og eventuelle kundebilder i ChatGPT, og lim inn briefen. AI-bildet er en illustrasjon; målene i tegningen er fortsatt teknisk grunnlag.</p></div>
   </aside>
  </div>
 </main>
}