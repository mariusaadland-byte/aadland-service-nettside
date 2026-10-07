"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./drawing.module.css";

const GRID=100, VIEW=8000, STORE="aadlandDrawingsV2", LAST_STORE="aadlandDrawingsV2:last";
const catalog=[
 {group:"Bygg",items:[["door","Dør",900,100],["sliding","Skyvedør",1800,100],["window","Vindu",1200,100],["opening","Åpning",1000,100],["stairs","Trapp",900,2500],["post","Stolpe",98,98]]},
 {group:"Bad",items:[["toilet","Toalett",400,700],["walltoilet","Vegghengt toalett",400,600],["shower","Dusj",900,900],["bath","Badekar",750,1700],["sink","Servant",600,500],["washer","Vaskemaskin",600,600]]},
 {group:"Kjøkken",items:[["base","Benkeskap",600,600],["wallcab","Overskap",600,350],["tallcab","Høyskap",600,600],["fridge","Kjøleskap",600,600],["oven","Komfyr",600,600],["dishwasher","Oppvaskmaskin",600,600],["island","Kjøkkenøy",1800,900]]},
 {group:"Møbler",items:[["sofa","Sofa",2200,900],["table","Spisebord",1800,900],["chair","Stol",500,500],["bed","Seng",1800,2000],["wardrobe","Garderobe",1200,600],["tv","TV",1200,120]]},
 {group:"Soverom",items:[["nightstand","Nattbord",500,450],["dresser","Kommode",1200,450],["desk","Skrivebord",1200,600],["bookshelf","Bokhylle",900,350],["vanity","Sminkebord",1000,450],["armchair","Lenestol",850,850],["ottoman","Puff",600,600],["headboard","Hodegavl",1800,120]]},
 {group:"Ute",items:[["deck","Terrassefelt",3000,3000],["railing","Rekkverk",2000,100],["screen","Levegg",1800,100],["bench","Benk",1800,500],["planter","Plantekasse",1200,450]]},
 {group:"Elektro",items:[
  ["ceilinglight","Lyspunkt tak",180,180],
  ["downlight","Downlight",120,120],
  ["ledstrip","LED-stripe tak",2000,50],
  ["walllight","Lyspunkt vegg",180,100],
  ["outlet","Stikk",180,100],
  ["doubleoutlet","Dobbel stikk",220,100],
  ["switch","Bryter",120,100],
  ["dimmer","Dimmer",120,100],
  ["thermostat","Termostat",140,100],
  ["junction","Koblingspunkt",140,140]
 ]}
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
 bed:[["80 × 200 cm",800,2000],["90 × 200 cm",900,2000],["120 × 200 cm",1200,2000],["140 × 200 cm",1400,2000],["150 × 200 cm",1500,2000],["160 × 200 cm",1600,2000],["180 × 200 cm",1800,2000],["200 × 200 cm",2000,2000]],
 nightstand:[["40 × 40 cm",400,400],["50 × 45 cm",500,450],["60 × 45 cm",600,450]],
 dresser:[["80 × 45 cm",800,450],["120 × 45 cm",1200,450],["160 × 50 cm",1600,500]],
 desk:[["100 × 60 cm",1000,600],["120 × 60 cm",1200,600],["160 × 70 cm",1600,700]],
 bookshelf:[["60 × 30 cm",600,300],["90 × 35 cm",900,350],["120 × 35 cm",1200,350]],
 vanity:[["80 × 45 cm",800,450],["100 × 45 cm",1000,450],["120 × 50 cm",1200,500]],
 armchair:[["75 × 75 cm",750,750],["85 × 85 cm",850,850],["95 × 90 cm",950,900]],
 ottoman:[["45 × 45 cm",450,450],["60 × 60 cm",600,600],["90 × 60 cm",900,600]],
 headboard:[["90 cm",900,120],["120 cm",1200,120],["150 cm",1500,120],["180 cm",1800,120],["200 cm",2000,120]],
 wardrobe:[["60 × 60 cm",600,600],["120 × 60 cm",1200,600],["180 × 60 cm",1800,600],["240 × 60 cm",2400,600]],
 tv:[["100 cm TV",1000,120],["120 cm TV",1200,120],["150 cm TV",1500,120],["180 cm TV",1800,120]],
 bench:[["120 × 50 cm",1200,500],["180 × 50 cm",1800,500],["240 × 50 cm",2400,500]],
 planter:[["80 × 40 cm",800,400],["120 × 45 cm",1200,450],["180 × 50 cm",1800,500]],
 ceilinglight:[["Lyspunkt",180,180]],downlight:[["Downlight",120,120]],
 ledstrip:[["1,0 m LED",1000,50],["2,0 m LED",2000,50],["3,0 m LED",3000,50],["4,0 m LED",4000,50],["5,0 m LED",5000,50]],
 walllight:[["Vegglampe",180,100]],outlet:[["Stikk",180,100]],doubleoutlet:[["Dobbel stikk",220,100]],
 switch:[["Bryter",120,100]],dimmer:[["Dimmer",120,100]],thermostat:[["Termostat",140,100]],junction:[["Koblingspunkt",140,140]]
};
const flat=catalog.flatMap(g=>g.items), labelFor=t=>t==="customwall"||t==="customfloor"?"Eget møbel":flat.find(x=>x[0]===t)?.[1]||t;
const uid=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
const snapTo=(n,size=GRID)=>Math.round(n/size)*size;
const len=w=>Math.round(Math.hypot(w.x2-w.x1,w.y2-w.y1));
const angle=w=>Math.round(Math.atan2(w.y2-w.y1,w.x2-w.x1)*180/Math.PI*10)/10;
const wallOffset=(o,w)=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,L=Math.hypot(dx,dy)||1;return Math.round(((o.x+o.w/2-w.x1)*dx+(o.y+o.h/2-w.y1)*dy)/L)};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mountedLimits=(o,w)=>{const L=len(w),width=Math.max(0,Number(o?.w)||0),half=width/2;if(L<=0)return{L:0,min:0,max:0,tooWide:width>0};if(width>=L)return{L,min:L/2,max:L/2,tooWide:width>L};return{L,min:half,max:L-half,tooWide:false}};
const wallEdgeOffsets=(o,w)=>{const limits=mountedLimits(o,w),center=clamp(Number.isFinite(o?.wallOffset)?o.wallOffset:wallOffset(o,w),limits.min,limits.max),half=Math.max(0,Number(o?.w)||0)/2;return{start:Math.max(0,Math.round(center-half)),end:Math.max(0,Math.round(limits.L-center-half)),center:Math.round(center),tooWide:limits.tooWide,L:limits.L}};
const wallOpeningLayout=(wall,items)=>{
 const rows=(items||[]).filter(item=>item.wallId===wall.id&&openingTypes.has(item.type)).map(item=>({item,gaps:wallEdgeOffsets(item,wall)})).sort((a,b)=>a.gaps.start-b.gaps.start);
 let cursor=0,overlap=false;const parts=[];
 for(const row of rows){
  const gap=row.gaps.start-cursor;if(gap<0)overlap=true;
  parts.push({gap:Math.max(0,gap),item:row.item,gaps:row.gaps});
  cursor=Math.max(cursor,row.gaps.start+Number(row.item.w||0));
 }
 return {rows,parts,endGap:Math.max(0,len(wall)-cursor),overlap,L:len(wall)};
};

const dim=w=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,off=150;return {ax:w.x1+nx*off,ay:w.y1+ny*off,bx:w.x2+nx*off,by:w.y2+ny*off,nx,ny,mx:(w.x1+w.x2)/2+nx*(off+70),my:(w.y1+w.y2)/2+ny*(off+70)}};
const furnitureTemplates=[
 {id:"underskap",label:"Underskap",name:"Underskap",width:600,depth:600,height:900,elevation:0,mount:"floor",sectionsX:1,sectionsY:1},
 {id:"overskap",label:"Overskap",name:"Overskap",width:600,depth:350,height:700,elevation:1400,mount:"wall",sectionsX:1,sectionsY:1},
 {id:"garderobe",label:"Garderobe",name:"Garderobe",width:1200,depth:600,height:2100,elevation:0,mount:"floor",sectionsX:2,sectionsY:1},
 {id:"hylle",label:"Vegghylle",name:"Vegghylle",width:1200,depth:300,height:350,elevation:1500,mount:"wall",sectionsX:3,sectionsY:1},
 {id:"benk",label:"Benk",name:"Benk",width:1200,depth:450,height:500,elevation:0,mount:"floor",sectionsX:2,sectionsY:1},
 {id:"custom",label:"Fra bunnen",name:"Eget møbel",width:1000,depth:450,height:900,elevation:0,mount:"floor",sectionsX:2,sectionsY:1}
];
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

const electricalTypes=new Set(["ceilinglight","downlight","ledstrip","walllight","outlet","doubleoutlet","switch","dimmer","thermostat","junction"]);
const wallElectricalTypes=new Set(["walllight","outlet","doubleoutlet","switch","dimmer","thermostat"]);
const ceilingElectricalTypes=new Set(["ceilinglight","downlight","ledstrip","junction"]);
function wallProjectedFurniture(wall,items){
 const L=Math.max(1,len(wall)),dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,raw=Math.hypot(dx,dy)||1,ux=dx/raw,uy=dy/raw,nx=-uy,ny=ux;
 return (items||[]).filter(item=>!item.wallId&&!electricalTypes.has(item.type)&&!openingTypes.has(item.type)&&!["deck","railing","screen","post","stairs"].includes(item.type)).map(item=>{
  const corners=rotatedItemCorners(item),along=corners.map(p=>(p.x-wall.x1)*ux+(p.y-wall.y1)*uy),normal=corners.map(p=>(p.x-wall.x1)*nx+(p.y-wall.y1)*ny);
  const rawStart=Math.min(...along),rawEnd=Math.max(...along),start=clamp(rawStart,0,L),end=clamp(rawEnd,0,L);
  const minN=Math.min(...normal),maxN=Math.max(...normal),distance=minN<=0&&maxN>=0?0:Math.min(Math.abs(minN),Math.abs(maxN));
  const shortSide=Math.max(100,Math.min(Number(item.w)||100,Number(item.h)||100));
  const blockDistance=Math.max(700,Math.min(1500,shortSide*.8));
  const visible=end-start>=40,blocksGap=visible&&distance<=blockDistance;
  return {item,start,end,width:Math.max(0,end-start),distance,blockDistance,blocksGap};
 }).filter(row=>row.visible).sort((a,b)=>a.distance-b.distance);
}
function wallFurnitureGaps(wall,items,excludeId=null){
 const L=Math.max(1,len(wall));
 const mounted=(items||[])
  .filter(item=>item.wallId===wall.id&&item.id!==excludeId&&!wallElectricalTypes.has(item.type)&&!["railing","screen"].includes(item.type))
  .map(item=>{const gaps=wallEdgeOffsets(item,wall),start=clamp(gaps.start,0,L),end=clamp(gaps.start+Math.max(0,Number(item.w)||0),0,L);return{start,end}});
 const floor=wallProjectedFurniture(wall,items).filter(row=>row.item.id!==excludeId).map(row=>({start:row.start,end:row.end}));
 const blockers=[...mounted,...floor].filter(row=>row.end>row.start).sort((a,b)=>a.start-b.start);
 const merged=[];
 for(const row of blockers){
  const last=merged.at(-1);
  if(last&&row.start<=last.end)last.end=Math.max(last.end,row.end);
  else merged.push({...row});
 }
 const gaps=[];let cursor=0;
 for(const row of merged){
  if(row.start-cursor>=100)gaps.push({start:cursor,end:row.start,width:row.start-cursor});
  cursor=Math.max(cursor,row.end);
 }
 if(L-cursor>=100)gaps.push({start:cursor,end:L,width:L-cursor});
 return gaps.map(g=>({start:Math.round(g.start),end:Math.round(g.end),width:Math.round(g.width)}));
}
const roomBoundedTypes=new Set(["toilet","walltoilet","shower","bath","sink","washer","base","wallcab","tallcab","fridge","oven","dishwasher","island","sofa","table","chair","bed","wardrobe","tv","nightstand","dresser","desk","bookshelf","vanity","armchair","ottoman","headboard","ceilinglight","downlight","ledstrip","junction","customfloor"]);
const item3DHeight={
 toilet:780,walltoilet:450,shower:2100,bath:600,sink:850,washer:850,
 base:900,wallcab:700,tallcab:2200,fridge:2000,oven:900,dishwasher:850,island:900,
 sofa:850,table:750,chair:900,bed:550,wardrobe:2100,tv:750,nightstand:550,dresser:900,desk:750,bookshelf:1900,vanity:780,armchair:900,ottoman:450,headboard:1200,bench:500,planter:550,post:2400,customfloor:900,customwall:700
};
const itemDefaults=(type,doc)=>({
 ...(electricalTypes.has(type)?{circuit:"",itemNote:""}:{}),
 ...(wallElectricalTypes.has(type)?{mountHeight:type==="outlet"||type==="doubleoutlet"?300:type==="switch"||type==="dimmer"?1100:type==="thermostat"?1500:1800}:{}),
 ...(ceilingElectricalTypes.has(type)?{mountHeight:Number(doc?.defaultWallHeight)||2400}:{}),
 modelHeight:item3DHeight[type]||600,
 elevation:type==="wallcab"?1400:type==="tv"?900:type==="walltoilet"?250:0
});
function pointOnSegment(point,a,b,tolerance=2){
 const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy;
 if(!L2)return Math.hypot(point.x-a.x,point.y-a.y)<=tolerance;
 const t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/L2,0,1);
 return Math.hypot(point.x-(a.x+t*dx),point.y-(a.y+t*dy))<=tolerance;
}
function pointInPolygonInclusive(point,points){
 if(!Array.isArray(points)||points.length<3)return false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  if(pointOnSegment(point,points[j],points[i],3))return true;
 }
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  const hit=((a.y>point.y)!==(b.y>point.y))&&(point.x<(b.x-a.x)*(point.y-a.y)/((b.y-a.y)||1e-9)+a.x);
  if(hit)inside=!inside;
 }
 return inside;
}
function rotatedItemCorners(item,x=item.x,y=item.y){
 const w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),cx=x+w/2,cy=y+h/2,a=(Number(item.rot)||0)*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
 return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy])=>({x:cx+dx*cos-dy*sin,y:cy+dx*sin+dy*cos}));
}
function itemFitsZone(item,zone,x=item.x,y=item.y){
 return !!zone?.points?.length&&rotatedItemCorners(item,x,y).every(point=>pointInPolygonInclusive(point,zone.points));
}
function itemCenter(item,x=item.x,y=item.y){return{x:x+(Number(item.w)||0)/2,y:y+(Number(item.h)||0)/2}}
function zoneContainingPoint(point,zones){return (zones||[]).find(zone=>pointInPolygonInclusive(point,zone.points||[]))||null}
function safeCenterInZone(item,zone,preferred){
 const points=zone?.points||[];if(points.length<3)return null;
 const candidates=[];
 if(preferred)candidates.push(preferred);
 const centroid=polygonCentroid(points);candidates.push(centroid);
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 candidates.push({x:(minX+maxX)/2,y:(minY+maxY)/2});
 for(let gy=1;gy<=7;gy++)for(let gx=1;gx<=7;gx++)candidates.push({x:minX+(maxX-minX)*gx/8,y:minY+(maxY-minY)*gy/8});
 let best=null;
 for(const center of candidates){
  const x=center.x-item.w/2,y=center.y-item.h/2;
  if(itemFitsZone(item,zone,x,y)){
   const score=preferred?Math.hypot(center.x-preferred.x,center.y-preferred.y):0;
   if(!best||score<best.score)best={center,score};
  }
 }
 return best?.center||null;
}
function constrainFreeItem(item,zones,{fallbackCenter=null,snapDistance=140}={}){
 if(!item||item.wallId||!roomBoundedTypes.has(item.type)){
  const corners=rotatedItemCorners(item),minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const dx=minX<0?-minX:maxX>VIEW?VIEW-maxX:0,dy=minY<0?-minY:maxY>VIEW?VIEW-maxY:0;
  return {...item,x:item.x+dx,y:item.y+dy};
 }
 const center=itemCenter(item),fallback=fallbackCenter||center;
 let zone=zoneContainingPoint(center,zones)||zoneContainingPoint(fallback,zones);
 if(!zone&&zones?.length){
  zone=[...zones].sort((a,b)=>{const ac=polygonCentroid(a.points||[]),bc=polygonCentroid(b.points||[]);return Math.hypot(ac.x-center.x,ac.y-center.y)-Math.hypot(bc.x-center.x,bc.y-center.y)})[0];
 }
 if(!zone){const clamped=constrainFreeItem({...item,type:"__canvas__"},[],{});return {...clamped,type:item.type}}
 if(itemFitsZone(item,zone)) {
  const safe=safeCenterInZone(item,zone,fallback);
  if(safe&&snapDistance>0){
   const vx=center.x-safe.x,vy=center.y-safe.y,L=Math.hypot(vx,vy);
   if(L>1){
    const extended={x:center.x+vx/L*snapDistance,y:center.y+vy/L*snapDistance};
    const ex=extended.x-item.w/2,ey=extended.y-item.h/2;
    if(!itemFitsZone(item,zone,ex,ey)){
     let lo=0,hi=1;
     for(let i=0;i<24;i++){const mid=(lo+hi)/2,cx=center.x+(extended.x-center.x)*mid,cy=center.y+(extended.y-center.y)*mid;if(itemFitsZone(item,zone,cx-item.w/2,cy-item.h/2))lo=mid;else hi=mid}
     const cx=center.x+(extended.x-center.x)*lo,cy=center.y+(extended.y-center.y)*lo;
     return {...item,x:cx-item.w/2,y:cy-item.h/2,roomId:zone.id};
    }
   }
  }
  return {...item,roomId:zone.id};
 }
 const safe=safeCenterInZone(item,zone,fallback);
 if(!safe)return {...item,x:fallback.x-item.w/2,y:fallback.y-item.h/2,roomId:zone.id};
 let lo=0,hi=1,best=safe;
 for(let i=0;i<28;i++){
  const mid=(lo+hi)/2,cx=safe.x+(center.x-safe.x)*mid,cy=safe.y+(center.y-safe.y)*mid;
  if(itemFitsZone(item,zone,cx-item.w/2,cy-item.h/2)){lo=mid;best={x:cx,y:cy}}else hi=mid;
 }
 return {...item,x:best.x-item.w/2,y:best.y-item.h/2,roomId:zone.id};
}
function polygonSignedArea(points){
 let area=0;
 for(let i=0;i<(points||[]).length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y}
 return area/2;
}
function infiniteLineIntersection(a,b,c,d){
 const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},den=r.x*s.y-r.y*s.x;
 if(Math.abs(den)<1e-7)return null;
 const t=((c.x-a.x)*s.y-(c.y-a.y)*s.x)/den;
 return{x:a.x+t*r.x,y:a.y+t*r.y};
}
function insetLinkedZone(zone,walls,defaultThickness=98){
 const points=zone?.points||[],ids=Array.isArray(zone?.wallIds)?zone.wallIds:[];
 if(points.length<3||ids.length!==points.length)return zone;
 const byId=new Map((walls||[]).map(w=>[w.id,w])),orientation=polygonSignedArea(points)>=0?1:-1,shifted=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
  const wall=byId.get(ids[i]),distance=Math.max(0,(Number(wall?.t)||Number(defaultThickness)||98)/2);
  const nx=orientation>0?-dy/L:dy/L,ny=orientation>0?dx/L:-dx/L;
  shifted.push({a:{x:a.x+nx*distance,y:a.y+ny*distance},b:{x:b.x+nx*distance,y:b.y+ny*distance},nx,ny,distance});
 }
 const inset=points.map((point,i)=>{
  const prev=shifted[(i-1+shifted.length)%shifted.length],next=shifted[i],hit=infiniteLineIntersection(prev.a,prev.b,next.a,next.b);
  if(hit&&Number.isFinite(hit.x)&&Number.isFinite(hit.y)&&Math.hypot(hit.x-point.x,hit.y-point.y)<2000)return hit;
  const nx=prev.nx*prev.distance+next.nx*next.distance,ny=prev.ny*prev.distance+next.ny*next.distance;
  return{x:point.x+nx/2,y:point.y+ny/2};
 });
 return {...zone,points:inset,_sourcePoints:points};
}
function roomPlacementZones(zones,walls,defaultThickness=98){
 return (zones||[]).map(zone=>insetLinkedZone(zone,walls,defaultThickness));
}
function itemFitsSomePlacementZone(item,zones){
 return (zones||[]).some(zone=>itemFitsZone(item,zone));
}
function constrainFreeItemStrict(item,zones,{fallbackItem=null,fallbackCenter=null,snapDistance=140}={}){
 const placed=constrainFreeItem(item,zones,{fallbackCenter,snapDistance});
 if(!roomBoundedTypes.has(item?.type)||!(zones||[]).length||itemFitsSomePlacementZone(placed,zones))return placed;
 return fallbackItem?{...fallbackItem}:placed;
}
function wallInwardNormal(wall,zones){
 const zone=(zones||[]).find(z=>Array.isArray(z.wallIds)&&z.wallIds.includes(wall?.id));
 if(!zone)return{x:0,y:0};
 const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,L=Math.hypot(dx,dy)||1,ccw=polygonSignedArea(zone.points||[])>=0;
 return ccw?{x:-dy/L,y:dx/L}:{x:dy/L,y:-dx/L};
}
function mountedItemCenter(item,wall,zones=[]){
 const limits=mountedLimits(item,wall),off=clamp(Number.isFinite(item?.wallOffset)?item.wallOffset:wallOffset(item,wall),limits.min,limits.max),a=Math.atan2(wall.y2-wall.y1,wall.x2-wall.x1);
 let cx=wall.x1+Math.cos(a)*off,cy=wall.y1+Math.sin(a)*off;
 if(item?.type==="customwall"){
  const inward=wallInwardNormal(wall,zones),shift=Math.max(0,(Number(wall.t)||98)/2)+Math.max(0,Number(item.h)||0)/2;
  cx+=inward.x*shift;cy+=inward.y*shift;
 }
 return{off,a,cx,cy};
}
function electricalSymbol(type){
 return ({ceilinglight:"⊗",downlight:"⊙",ledstrip:"LED",walllight:"◐",outlet:"◫",doubleoutlet:"▣",switch:"S",dimmer:"D",thermostat:"T",junction:"●"})[type]||"";
}
function modelHeight(item){return Math.max(80,Number(item?.modelHeight)||item3DHeight[item?.type]||600)}

function PlanItemGlyph({item,active}){
 const o=item;
 if(o.type==="door")return <g transform={o.flip?"translate("+o.w+" 0) scale(-1 1)":undefined}><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#51462f" strokeWidth="28"/><path d={"M0 "+o.h/2+" A "+o.w+" "+o.w+" 0 0 1 "+o.w+" "+(o.h/2-o.w)} fill="none" stroke="#8b806a" strokeWidth="18"/></g>;
 if(o.type==="sliding")return <><rect width={o.w} height={Math.max(o.h,100)} fill="#f7f7f7" stroke="#51462f" strokeWidth="18"/><line x1="60" y1="20" x2={o.w*.62} y2="20" stroke="#51462f" strokeWidth="22"/><line x1={o.w*.38} y1={o.h-20} x2={o.w-60} y2={o.h-20} stroke="#51462f" strokeWidth="22"/></>;
 if(o.type==="opening")return <><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#fff" strokeWidth="100"/><line x1="0" y1="0" x2="0" y2={o.h} stroke="#777" strokeWidth="16"/><line x1={o.w} y1="0" x2={o.w} y2={o.h} stroke="#777" strokeWidth="16"/></>;
 if(o.type==="window")return <><rect width={o.w} height={Math.max(o.h,100)} fill="#dfeef1" stroke="#51462f" strokeWidth="18"/><line x1="0" y1={o.h/2} x2={o.w} y2={o.h/2} stroke="#64828a" strokeWidth="18"/></>;
 if(o.type==="customwall"||o.type==="customfloor"){
  const cols=Math.max(1,Math.min(8,Math.round(Number(o.sectionsX)||1))),rows=Math.max(1,Math.min(6,Math.round(Number(o.sectionsY)||1)));
  return <g>
   <rect width={o.w} height={o.h} rx="18" fill={active?"#f0dfbd":"#efe7d8"} stroke="#6e5633" strokeWidth="18"/>
   {Array.from({length:cols-1},(_,i)=><line key={"c"+i} x1={o.w*(i+1)/cols} y1="0" x2={o.w*(i+1)/cols} y2={o.h} stroke="#9a815a" strokeWidth="10"/>)}
   {Array.from({length:rows-1},(_,i)=><line key={"r"+i} x1="0" y1={o.h*(i+1)/rows} x2={o.w} y2={o.h*(i+1)/rows} stroke="#9a815a" strokeWidth="10"/>)}
  </g>;
 }
 if(o.type==="ledstrip"){
  return <g><rect width={o.w} height={Math.max(40,o.h)} rx="20" fill={active?"#fff1a8":"#fff7cf"} stroke="#9b7928" strokeWidth="14"/><line x1="30" y1={Math.max(40,o.h)/2} x2={Math.max(30,o.w-30)} y2={Math.max(40,o.h)/2} stroke="#d6a900" strokeWidth="20" strokeLinecap="round"/><text x={o.w/2} y={Math.max(40,o.h)/2-35} textAnchor="middle" fontSize="70" fontWeight="900" fill="#765915">LED</text></g>;
 }
 if(electricalTypes.has(o.type)){
  const cx=o.w/2,cy=o.h/2,r=Math.max(52,Math.min(o.w,o.h)*.34);
  return <g>
   <rect width={o.w} height={o.h} rx="24" fill={active?"#fff0bf":"#fff9df"} stroke="#b28a30" strokeWidth="14"/>
   {["ceilinglight","downlight","junction"].includes(o.type)&&<circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#b28a30" strokeWidth="16"/>}
   {o.type==="ceilinglight"&&<><line x1={cx-r*.7} y1={cy-r*.7} x2={cx+r*.7} y2={cy+r*.7} stroke="#b28a30" strokeWidth="14"/><line x1={cx+r*.7} y1={cy-r*.7} x2={cx-r*.7} y2={cy+r*.7} stroke="#b28a30" strokeWidth="14"/></>}
   {o.type==="downlight"&&<circle cx={cx} cy={cy} r={r*.25} fill="#b28a30"/>}
   {o.type==="junction"&&<circle cx={cx} cy={cy} r={r*.22} fill="#b28a30"/>}
   {!["ceilinglight","downlight","junction"].includes(o.type)&&<text x={cx} y={cy+30} textAnchor="middle" fontSize="82" fontWeight="900" fill="#7a5a1c">{electricalSymbol(o.type)}</text>}
  </g>;
 }
 return <rect width={o.w} height={o.h} rx="30" fill={active?"#eadcbf":"#f5f1e7"} stroke="#51462f" strokeWidth="18"/>;
}
function isoPoint(x,y,z=0){return{x:(x-y)*.8660254,y:(x+y)*.5-z}}
function pointsAttr(points){return points.map(p=>p.x+","+p.y).join(" ")}
function itemCeilingHeight(item,doc){
 const center=itemCenter(item),zone=zoneContainingPoint(center,doc.zones||[]);
 return Number(zone?.ceilingHeight)||Number(doc.defaultWallHeight)||2400;
}
function wallPrismCorners(w){
 const dx=w.x2-w.x1,dy=w.y2-w.y1,L=Math.hypot(dx,dy)||1,half=Math.max(20,Number(w.t)||98)/2,nx=-dy/L,ny=dx/L;
 return [
  {x:w.x1+nx*half,y:w.y1+ny*half},{x:w.x2+nx*half,y:w.y2+ny*half},
  {x:w.x2-nx*half,y:w.y2-ny*half},{x:w.x1-nx*half,y:w.y1-ny*half}
 ];
}
function camera3DPoint(x,y,z,camera,origin){
 const yaw=(Number(camera?.yaw)||42)*Math.PI/180,pitch=clamp(Number(camera?.pitch)||34,8,78)*Math.PI/180,zoom=clamp(Number(camera?.zoom)||1,.55,2.5);
 const dx=(Number(x)||0)-origin.x,dy=(Number(y)||0)-origin.y,rx=dx*Math.cos(yaw)-dy*Math.sin(yaw),ry=dx*Math.sin(yaw)+dy*Math.cos(yaw);
 return{x:rx*zoom,y:(ry*Math.sin(pitch)-(Number(z)||0)*Math.cos(pitch))*zoom,depth:ry*Math.cos(pitch)+(Number(z)||0)*Math.sin(pitch)};
}
function Drawing3DPreview({doc,onWallSelect,onItemSelect,camera}){
 const zones=doc.zones||[],walls=doc.walls||[],items=doc.items||[],planPoints=[];
 for(const z of zones)for(const p of z.points||[])planPoints.push({x:Number(p.x)||0,y:Number(p.y)||0});
 for(const w of walls)planPoints.push({x:Number(w.x1)||0,y:Number(w.y1)||0},{x:Number(w.x2)||0,y:Number(w.y2)||0});
 for(const item of items){const c=itemCenter(item);planPoints.push(c)}
 const origin=planPoints.length?{x:(Math.min(...planPoints.map(p=>p.x))+Math.max(...planPoints.map(p=>p.x)))/2,y:(Math.min(...planPoints.map(p=>p.y))+Math.max(...planPoints.map(p=>p.y)))/2}:{x:0,y:0};
 const project=(x,y,z=0)=>camera3DPoint(x,y,z,camera,origin),projected=[];
 const addPoint=(x,y,z=0)=>projected.push(project(x,y,z));
 for(const z of zones)for(const p of z.points||[]){addPoint(p.x,p.y,0);addPoint(p.x,p.y,Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400)}
 for(const w of walls){const h=Number(w.h)||2400;for(const p of wallPrismCorners(w)){addPoint(p.x,p.y,0);addPoint(p.x,p.y,h)}}
 for(const item of items){
  const height=ceilingElectricalTypes.has(item.type)?itemCeilingHeight(item,doc):wallElectricalTypes.has(item.type)?Number(item.mountHeight)||1200:modelHeight(item);
  const z0=electricalTypes.has(item.type)?height:Math.max(0,Number(item.elevation)||0);
  for(const p of rotatedItemCorners(item)){addPoint(p.x,p.y,z0);if(!electricalTypes.has(item.type))addPoint(p.x,p.y,z0+modelHeight(item))}
 }
 if(!projected.length)projected.push({x:-500,y:-350},{x:500,y:350});
 const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y)),pad=Math.max(300,(maxX-minX+maxY-minY)*.05);
 const viewBox=[minX-pad,minY-pad,Math.max(1000,maxX-minX+pad*2),Math.max(800,maxY-minY+pad*2)].join(" ");
 const wallRows=[...walls].sort((a,b)=>project((a.x1+a.x2)/2,(a.y1+a.y2)/2,0).depth-project((b.x1+b.x2)/2,(b.y1+b.y2)/2,0).depth);
 const itemRows=[...items].sort((a,b)=>project(itemCenter(a).x,itemCenter(a).y,0).depth-project(itemCenter(b).x,itemCenter(b).y,0).depth);
 return <svg viewBox={viewBox} role="img" aria-label="Dreibar 3D-visning av tegningen">
  <defs>
   <linearGradient id="floor3d" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#faf7ef"/><stop offset="1" stopColor="#e9e1d4"/></linearGradient>
   <linearGradient id="wall3d" x1="0" x2="1"><stop offset="0" stopColor="#d9d2c6"/><stop offset="1" stopColor="#b9b1a5"/></linearGradient>
   <linearGradient id="item3d" x1="0" x2="1"><stop offset="0" stopColor="#d8b979"/><stop offset="1" stopColor="#9d7b42"/></linearGradient>
  </defs>
  {zones.map(zone=><polygon key={"floor-"+zone.id} points={pointsAttr((zone.points||[]).map(p=>project(p.x,p.y,0)))} fill="url(#floor3d)" stroke="#b8ad9b" strokeWidth="18"/>)}
  {wallRows.map(w=>{const h=Number(w.h)||2400,fp=wallPrismCorners(w),base=fp.map(p=>project(p.x,p.y,0)),top=fp.map(p=>project(p.x,p.y,h));return <g key={"wall3d-"+w.id} role={onWallSelect?"button":undefined} tabIndex={onWallSelect?0:undefined} style={{cursor:onWallSelect?"pointer":"default"}} onClick={e=>{e.stopPropagation();onWallSelect?.(w)}} onKeyDown={e=>{if(onWallSelect&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onWallSelect(w)}}}>
   <polygon points={pointsAttr([base[0],base[1],top[1],top[0]])} fill="url(#wall3d)" stroke="#81796d" strokeWidth="12" opacity=".9"/>
   <polygon points={pointsAttr([base[1],base[2],top[2],top[1]])} fill="#aaa295" stroke="#81796d" strokeWidth="11" opacity=".92"/>
   <polygon points={pointsAttr([base[2],base[3],top[3],top[2]])} fill="#c9c1b5" stroke="#81796d" strokeWidth="11" opacity=".92"/>
   <polygon points={pointsAttr([base[3],base[0],top[0],top[3]])} fill="#b8b0a4" stroke="#81796d" strokeWidth="11" opacity=".92"/>
   <polygon points={pointsAttr(top)} fill="#e6e0d6" stroke="#81796d" strokeWidth="11" opacity=".96"/>
  </g>})}
  {itemRows.map(item=>{
   const center=itemCenter(item),select=()=>onItemSelect?.(item);
   if(openingTypes.has(item.type)){
    const a=(Number(item.rot)||0)*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),half=(Number(item.w)||0)/2,z0=item.type==="window"?Number(item.sillHeight)||0:0,z1=z0+(Number(item.openingHeight)||openingDefaults(item.type).openingHeight||2100);
    const pts=[project(center.x-ux*half,center.y-uy*half,z0),project(center.x+ux*half,center.y+uy*half,z0),project(center.x+ux*half,center.y+uy*half,z1),project(center.x-ux*half,center.y-uy*half,z1)];
    return <polygon key={"opening3d-"+item.id} points={pointsAttr(pts)} fill={item.type==="window"?"rgba(147,205,221,.78)":"rgba(250,248,242,.9)"} stroke="#5d5b56" strokeWidth="15" onClick={e=>{e.stopPropagation();select()}} style={{cursor:onItemSelect?"pointer":"default"}}/>;
   }
   if(item.type==="ledstrip"){
    const z=itemCeilingHeight(item,doc)-12,top=rotatedItemCorners(item).map(p=>project(p.x,p.y,z));
    return <g key={"led3d-"+item.id} onClick={e=>{e.stopPropagation();select()}} style={{cursor:onItemSelect?"pointer":"default"}}><polygon points={pointsAttr(top)} fill="#ffe78a" stroke="#9b7928" strokeWidth="12"/><polyline points={pointsAttr([project((top&&center.x)||center.x,center.y,z)])} fill="none"/></g>;
   }
   if(electricalTypes.has(item.type)){
    const z=ceilingElectricalTypes.has(item.type)?itemCeilingHeight(item,doc):Number(item.mountHeight)||1200,p=project(center.x,center.y,z),size=Math.max(90,Math.min(Number(item.w)||140,240));
    return <g key={"el3d-"+item.id} onClick={e=>{e.stopPropagation();select()}} style={{cursor:onItemSelect?"pointer":"default"}}><polygon points={pointsAttr([{x:p.x,y:p.y-size},{x:p.x+size,y:p.y},{x:p.x,y:p.y+size},{x:p.x-size,y:p.y}])} fill="#ffe773" stroke="#89691e" strokeWidth="14"/><text x={p.x} y={p.y+28} textAnchor="middle" fontSize="80" fontWeight="900" fill="#5f4715">{electricalSymbol(item.type)}</text></g>;
   }
   if(["railing","screen"].includes(item.type))return null;
   const corners=rotatedItemCorners(item),h=modelHeight(item),z0=Math.max(0,Number(item.elevation)||0),base=corners.map(p=>project(p.x,p.y,z0)),top=corners.map(p=>project(p.x,p.y,z0+h));
   return <g key={"obj3d-"+item.id} onClick={e=>{e.stopPropagation();select()}} style={{cursor:onItemSelect?"pointer":"default"}}>
    <polygon points={pointsAttr([base[1],base[2],top[2],top[1]])} fill="#9c7b48" stroke="#675236" strokeWidth="11"/>
    <polygon points={pointsAttr([base[2],base[3],top[3],top[2]])} fill="#80643d" stroke="#675236" strokeWidth="11"/>
    <polygon points={pointsAttr(top)} fill="url(#item3d)" stroke="#675236" strokeWidth="12"/>
   </g>
  })}
 </svg>;
}
function FurnitureGapPlanPreview({doc,wall,onSelectGap}){
 const walls=doc.walls||[],items=doc.items||[],gaps=wallFurnitureGaps(wall,items),points=[];
 for(const w of walls)points.push({x:Number(w.x1)||0,y:Number(w.y1)||0},{x:Number(w.x2)||0,y:Number(w.y2)||0});
 for(const item of items)for(const p of rotatedItemCorners(item))points.push(p);
 if(!points.length)points.push({x:0,y:0},{x:4000,y:3000});
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),pad=Math.max(350,Math.max(maxX-minX,maxY-minY)*.08);
 const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
 const gapPoly=gap=>{const thickness=240,a={x:wall.x1+ux*gap.start,y:wall.y1+uy*gap.start},b={x:wall.x1+ux*gap.end,y:wall.y1+uy*gap.end};return[
  {x:a.x+nx*thickness,y:a.y+ny*thickness},{x:b.x+nx*thickness,y:b.y+ny*thickness},
  {x:b.x-nx*thickness,y:b.y-ny*thickness},{x:a.x-nx*thickness,y:a.y-ny*thickness}
 ]};
 return <svg viewBox={[minX-pad,minY-pad,Math.max(900,maxX-minX+pad*2),Math.max(700,maxY-minY+pad*2)].join(" ")} role="img" aria-label="Velg mellomrom i plantegningen">
  <defs><pattern id={"gap-plan-grid-"+wall.id} width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#ebe7dd" strokeWidth="4"/></pattern></defs>
  <rect x={minX-pad} y={minY-pad} width={Math.max(900,maxX-minX+pad*2)} height={Math.max(700,maxY-minY+pad*2)} fill={"url(#gap-plan-grid-"+wall.id+")"}/>
  {(doc.zones||[]).map(z=><polygon key={"gap-zone-"+z.id} points={(z.points||[]).map(p=>p.x+","+p.y).join(" ")} fill="rgba(50,106,118,.07)" stroke="#8da2a7" strokeWidth="10" strokeDasharray="35 22"/>)}
  {walls.map(w=><line key={"gap-wall-"+w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={w.id===wall.id?"#2f846c":"#333"} strokeWidth={w.id===wall.id?Math.max(75,Number(w.t)||98):Math.max(35,Number(w.t)||98)} strokeLinecap="square"/>)}
  {items.map(item=><g key={"gap-item-"+item.id} transform={"translate("+item.x+" "+item.y+") rotate("+item.rot+" "+item.w/2+" "+item.h/2+")"} pointerEvents="none">
   <PlanItemGlyph item={item} active={false}/>
   {!electricalTypes.has(item.type)&&<><text x={item.w/2} y={item.h/2} textAnchor="middle" dominantBaseline="middle" fontSize="95" fontWeight="800" fill="#332d24">{item.customName||labelFor(item.type)}</text><text x={item.w/2} y={item.h/2+120} textAnchor="middle" fontSize="70" fill="#5f5547">{Math.round(item.w)} × {Math.round(item.h)}</text></>}
  </g>)}
  {gaps.map((gap,index)=>{const poly=gapPoly(gap),mid={x:wall.x1+ux*(gap.start+gap.width/2),y:wall.y1+uy*(gap.start+gap.width/2)};return <g key={"plan-gap-"+index} onPointerDown={e=>{e.stopPropagation();onSelectGap?.(gap)}} style={{cursor:"pointer"}}>
   <polygon points={pointsAttr(poly)} fill="rgba(47,132,108,.30)" stroke="#1f6c57" strokeWidth="22" strokeDasharray="45 24"/>
   <circle cx={mid.x} cy={mid.y} r="145" fill="#1f6c57" stroke="#fff" strokeWidth="18"/>
   <text x={mid.x} y={mid.y-12} textAnchor="middle" fontSize="68" fontWeight="900" fill="#fff">VELG</text>
   <text x={mid.x} y={mid.y+72} textAnchor="middle" fontSize="56" fontWeight="800" fill="#fff">{gap.width} mm</text>
  </g>})}
  <g pointerEvents="none"><rect x={minX-pad+45} y={minY-pad+45} width={Math.min(1900,Math.max(900,(maxX-minX)*.55))} height="165" rx="28" fill="rgba(255,255,255,.95)" stroke="#2f846c" strokeWidth="12"/><text x={minX-pad+90} y={minY-pad+112} fontSize="58" fontWeight="900" fill="#205f4e">VELG MELLOMROM I PLANTEGNINGEN</text><text x={minX-pad+90} y={minY-pad+174} fontSize="46" fontWeight="700" fill="#5a5246">Alle senger, skap og øvrige møbler vises mens du velger.</text></g>
 </svg>;
}

function WallElevationPreview({wall,items,onSelectItem,selectedItemId,gapPickMode=false,onSelectGap}){
 if(!wall)return null;
 const L=Math.max(1,len(wall)),H=Math.max(300,Number(wall.h)||2400),padX=Math.max(140,L*.035),padY=Math.max(140,H*.07);
 const wallItems=(items||[]).filter(item=>item.wallId===wall.id).sort((a,b)=>(Number(a.wallOffset)||0)-(Number(b.wallOffset)||0));
 const projectedFurniture=gapPickMode?wallProjectedFurniture(wall,items):[];
 const blockingFurniture=gapPickMode?projectedFurniture.filter(row=>row.blocksGap):[];
 const freeGaps=gapPickMode?wallFurnitureGaps(wall,items):[];
 const itemBox=item=>{
  const gaps=wallEdgeOffsets(item,wall),width=Math.max(60,Number(item.w)||120),start=gaps.start;
  if(openingTypes.has(item.type)){
   const z0=item.type==="window"?Math.max(0,Number(item.sillHeight)||0):0;
   const height=Math.max(100,Number(item.openingHeight)||openingDefaults(item.type).openingHeight||2100);
   return{x:start,y:H-(z0+height),w:width,h:height,z0};
  }
  if(wallElectricalTypes.has(item.type)){
   const size=Math.max(110,Math.min(220,Number(item.w)||150)),centerZ=Math.max(size/2,Number(item.mountHeight)||1000);
   return{x:gaps.center-size/2,y:H-centerZ-size/2,w:size,h:size,z0:centerZ-size/2};
  }
  const height=Math.max(80,modelHeight(item)),z0=Math.max(0,Number(item.elevation)||0);
  return{x:start,y:H-(z0+height),w:width,h:height,z0};
 };
 return <svg viewBox={[-padX,-padY,L+padX*2,H+padY*2].join(" ")} role="img" aria-label={"Veggvisning "+L+" millimeter"}>
  <defs><pattern id={"wallgrid-"+wall.id} width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#e7e2d8" strokeWidth="4"/></pattern></defs>
  <rect x="0" y="0" width={L} height={H} fill={"url(#wallgrid-"+wall.id+")"} stroke="#5e5b55" strokeWidth="18"/>
  <line x1="0" y1={H} x2={L} y2={H} stroke="#2b2a27" strokeWidth="22"/>
  <text x={L/2} y={-55} textAnchor="middle" fontSize="80" fontWeight="800" fill="#554a37">{L} mm</text>
  <text x={-70} y={H/2} textAnchor="middle" transform={"rotate(-90 -70 "+H/2+")"} fontSize="74" fontWeight="700" fill="#554a37">{Math.round(H)} mm</text>
  {gapPickMode&&freeGaps.map((gap,index)=><g key={"gap-"+index} onClick={()=>onSelectGap?.(gap)} style={{cursor:"pointer"}}>
   <rect x={gap.start+10} y="10" width={Math.max(20,gap.width-20)} height={Math.max(20,H-20)} rx="24" fill="rgba(47,132,108,.13)" stroke="#2f846c" strokeWidth="12" strokeDasharray="35 24"/>
   <text x={gap.start+gap.width/2} y={H/2-35} textAnchor="middle" fontSize="74" fontWeight="900" fill="#236853">TRYKK HER</text>
   <text x={gap.start+gap.width/2} y={H/2+55} textAnchor="middle" fontSize="62" fontWeight="700" fill="#236853">{gap.width} mm ledig</text>
  </g>)}
  {gapPickMode&&projectedFurniture.slice().reverse().map(({item,start,end,distance,blocksGap})=>{
   const height=Math.max(80,Math.min(H,modelHeight(item))),z0=Math.max(0,Number(item.elevation)||0),y=H-Math.min(H,z0+height),w=Math.max(60,end-start),opacity=blocksGap?.96:.58;
   return <g key={"context-"+item.id} opacity={opacity} pointerEvents="none">
    <rect x={start} y={y} width={w} height={Math.min(height,H-y)} rx="18" fill={blocksGap?"#cdb489":"#e8e1d6"} stroke={blocksGap?"#5f482c":"#9d9589"} strokeWidth={blocksGap?20:12} strokeDasharray={blocksGap?undefined:"28 20"}/>
    <text x={start+w/2} y={Math.max(70,y+75)} textAnchor="middle" fontSize="58" fontWeight="900" fill="#493d2d">{item.customName||labelFor(item.type)}</text>
    <text x={start+w/2} y={Math.min(H-35,y+145)} textAnchor="middle" fontSize="48" fontWeight="700" fill="#665846">{Math.round(w)} mm{blocksGap?" · teller som kant":" · vises som oversikt"}</text>
   </g>
  })}
  {gapPickMode&&<g pointerEvents="none">
   <rect x="20" y="20" width={Math.min(1450,Math.max(620,L*.42))} height="150" rx="24" fill="rgba(255,255,255,.94)" stroke="#2f846c" strokeWidth="10"/>
   <text x="55" y="82" fontSize="54" fontWeight="900" fill="#236853">Møbler synlig: {projectedFurniture.length} · kanter brukt: {blockingFurniture.length}</text>
   <text x="55" y="137" fontSize="43" fontWeight="700" fill="#665f54">Brune møbler begrenser mellomrommet. Grå møbler vises for orientering.</text>
  </g>}
  {wallItems.map(item=>{
   const b=itemBox(item),active=selectedItemId===item.id,custom=item.type==="customwall";
   return <g key={"elev-"+item.id} onClick={()=>onSelectItem?.(item)} style={{cursor:"pointer"}}>
    {openingTypes.has(item.type)?<rect x={b.x} y={b.y} width={b.w} height={b.h} fill={item.type==="window"?"#dceef2":"#faf8f2"} stroke={active?"#c39235":"#6c6961"} strokeWidth={active?22:15}/>:wallElectricalTypes.has(item.type)?<g><circle cx={b.x+b.w/2} cy={b.y+b.h/2} r={b.w*.42} fill="#fff4b8" stroke={active?"#c39235":"#8b6e25"} strokeWidth={active?20:13}/><text x={b.x+b.w/2} y={b.y+b.h/2+25} textAnchor="middle" fontSize={Math.max(55,b.w*.42)} fontWeight="900" fill="#72571d">{electricalSymbol(item.type)}</text></g>:<g>
     <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={custom?"#e8d6b6":"#d8c39d"} stroke={active?"#c39235":"#6e5633"} strokeWidth={active?22:15}/>
     {custom&&Array.from({length:Math.max(1,Math.min(8,Math.round(Number(item.sectionsX)||1)))-1},(_,i)=><line key={"vx"+i} x1={b.x+b.w*(i+1)/Math.max(1,Math.round(Number(item.sectionsX)||1))} y1={b.y} x2={b.x+b.w*(i+1)/Math.max(1,Math.round(Number(item.sectionsX)||1))} y2={b.y+b.h} stroke="#9a815a" strokeWidth="9"/>)}
     {custom&&Array.from({length:Math.max(1,Math.min(6,Math.round(Number(item.sectionsY)||1)))-1},(_,i)=><line key={"hy"+i} x1={b.x} y1={b.y+b.h*(i+1)/Math.max(1,Math.round(Number(item.sectionsY)||1))} x2={b.x+b.w} y2={b.y+b.h*(i+1)/Math.max(1,Math.round(Number(item.sectionsY)||1))} stroke="#9a815a" strokeWidth="9"/>)}
    </g>}
    <text x={b.x+b.w/2} y={Math.max(65,b.y-28)} textAnchor="middle" fontSize="60" fontWeight="800" fill="#4d4230">{item.customName||labelFor(item.type)}</text>
    {!wallElectricalTypes.has(item.type)&&<text x={b.x+b.w/2} y={Math.min(H+90,b.y+b.h+72)} textAnchor="middle" fontSize="52" fill="#6d6250">{Math.round(b.w)} × {Math.round(b.h)} mm{b.z0>0?" · +"+Math.round(b.z0):""}</text>}
   </g>
  })}
 </svg>;
}
function syncLinkedZones(walls,zones){
 const byId=new Map((walls||[]).map(w=>[w.id,w]));
 return (zones||[]).map(zone=>{
  if(!Array.isArray(zone.wallIds)||zone.wallIds.length<3)return zone;
  const linked=zone.wallIds.map(id=>byId.get(id));
  if(linked.some(w=>!w))return {...zone,wallIds:undefined};
  return {...zone,points:linked.map(w=>({x:w.x1,y:w.y1}))};
 });
}
function syncAnchoredMeasurements(walls,measurements){
 const byId=new Map((walls||[]).map(w=>[w.id,w]));
 return (measurements||[]).map(m=>{
  let next={...m};
  for(const i of [1,2]){
   const anchor=m["anchor"+i];
   if(!anchor?.wallId)continue;
   const wall=byId.get(anchor.wallId);
   if(!wall){delete next["anchor"+i];continue}
   next["x"+i]=anchor.end===1?wall.x1:wall.x2;
   next["y"+i]=anchor.end===1?wall.y1:wall.y2;
  }
  return next;
 });
}

function linkedRoomDiagnostics(walls){
 if(!Array.isArray(walls)||walls.length<3)return{closed:false,maxGap:0,diagonals:[],corners:[]};
 let maxGap=0;
 for(let i=0;i<walls.length;i++){
  const current=walls[i],next=walls[(i+1)%walls.length];
  maxGap=Math.max(maxGap,Math.hypot(current.x2-next.x1,current.y2-next.y1));
 }
 const points=walls.map(w=>({x:w.x1,y:w.y1})),diagonals=[];
 let signedArea=0;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];signedArea+=a.x*b.y-b.x*a.y}
 const orientation=signedArea>=0?1:-1;
 const corners=points.map((point,index)=>{
  const prev=points[(index-1+points.length)%points.length],next=points[(index+1)%points.length];
  const inX=point.x-prev.x,inY=point.y-prev.y,outX=next.x-point.x,outY=next.y-point.y;
  const turn=Math.atan2(inX*outY-inY*outX,inX*outX+inY*outY)*180/Math.PI;
  let interior=180-orientation*turn;while(interior<=0)interior+=360;while(interior>360)interior-=360;
  return Math.round(interior*10)/10;
 });
 if(points.length===4){
  diagonals.push(Math.round(Math.hypot(points[2].x-points[0].x,points[2].y-points[0].y)));
  diagonals.push(Math.round(Math.hypot(points[3].x-points[1].x,points[3].y-points[1].y)));
 }
 return{closed:maxGap<=10,maxGap:Math.round(maxGap),diagonals,corners};
}
function normalizeAngle(value){
 let n=Number(value);if(!Number.isFinite(n))return null;
 n=((n%360)+360)%360;
 return Math.round(n*10)/10;
}

function zoneSurveySignature(zone,walls,items){
 const ids=Array.isArray(zone?.wallIds)?zone.wallIds:[],byId=new Map((walls||[]).map(w=>[w.id,w])),linked=ids.map(id=>byId.get(id)).filter(Boolean);
 const round=n=>Math.round((Number(n)||0)*10)/10;
 if(linked.length<3)return JSON.stringify({points:(zone?.points||[]).map(p=>[round(p.x),round(p.y)]),h:round(zone?.ceilingHeight),d1:round(zone?.diagonal1Measured),d2:round(zone?.diagonal2Measured)});
 const valid=new Set(linked.map(w=>w.id));
 const openings=(items||[]).filter(item=>valid.has(item.wallId)).map(item=>[item.id,item.type,item.wallId,round(item.wallOffset),round(item.w),round(item.openingHeight),round(item.sillHeight),!!item.flip]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 return JSON.stringify({walls:linked.map(w=>[w.id,round(w.x1),round(w.y1),round(w.x2),round(w.y2),round(w.t),round(w.h)]),openings,h:round(zone?.ceilingHeight),d1:round(zone?.diagonal1Measured),d2:round(zone?.diagonal2Measured)});
}
function zoneSurveyState(zone,walls,items){
 const ids=Array.isArray(zone?.wallIds)?zone.wallIds:[],byId=new Map((walls||[]).map(w=>[w.id,w])),linked=ids.map(id=>byId.get(id)).filter(Boolean),signature=zoneSurveySignature(zone,walls,items);
 if(linked.length<3){
  const ready=Array.isArray(zone?.points)&&zone.points.length>=3,completed=!!zone?.surveyCompletedAt,finished=completed&&!!zone?.surveySignature&&zone.surveySignature===signature&&ready;
  return{linked:false,done:0,total:0,closed:ready,overlap:false,ready,signature,finished,stale:completed&&!finished};
 }
 const diagnostics=linkedRoomDiagnostics(linked),valid=new Set(linked.map(w=>w.id)),done=(zone.surveyedWallIds||[]).filter(id=>valid.has(id)).length;
 const overlap=linked.some(w=>wallOpeningLayout(w,items||[]).overlap),ready=diagnostics.closed&&done===linked.length&&!overlap,completed=!!zone?.surveyCompletedAt;
 const finished=completed&&!!zone?.surveySignature&&zone.surveySignature===signature&&ready;
 return{linked:true,done,total:linked.length,closed:diagnostics.closed,overlap,ready,signature,finished,stale:completed&&!finished};
}
function zoneSurveyStatusText(state){
 if(state.finished)return "Ferdig";
 if(state.stale&&state.ready)return "Må sjekkes etter endring";
 const parts=[];
 if(!state.closed)parts.push("åpen romkontur");
 if(state.done<state.total)parts.push((state.total-state.done)+" vegg(er) ikke målt");
 if(state.overlap)parts.push("åpninger overlapper");
 return parts.length?parts.join(" · "):state.ready?"klar for fullføring":"gjenstår";
}

const initial=()=>({id:uid(),name:"Ny tegning",orderId:"",projectId:"",customerUserId:"",customerVisible:false,customer:"",address:"",notes:"",visualizationNotes:"",walls:[],items:[],zones:[],measurements:[],snapSize:50,showGrid:true,scale:"1:50",zoom:1,defaultWallThickness:98,defaultWallHeight:2400});
const wallTypes=new Set(["door","sliding","window","opening","railing","screen","walllight","outlet","doubleoutlet","switch","dimmer","thermostat","customwall"]);
const openingTypes=new Set(["door","sliding","window","opening"]);
const openingDefaults=type=>type==="window"?{openingHeight:1200,sillHeight:900}:openingTypes.has(type)?{openingHeight:2100,sillHeight:0}:{};
function nearestWall(o,walls){
 let best=null;
 for(const w of walls){const dx=w.x2-w.x1,dy=w.y2-w.y1,L2=dx*dx+dy*dy;if(!L2)continue;let t=((o.x-w.x1)*dx+(o.y-w.y1)*dy)/L2;t=Math.max(0,Math.min(1,t));const x=w.x1+t*dx,y=w.y1+t*dy,dist=Math.hypot(o.x-x,o.y-y);if(!best||dist<best.dist)best={wall:w,x,y,dist,t};}
 return best;
}

export default function DrawingClient(){
 const [docs,setDocs]=useState([]),[doc,setDoc]=useState(initial),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[zoneDraft,setZoneDraft]=useState([]),[tool,setTool]=useState("select"),[drag,setDrag]=useState(null),[history,setHistory]=useState([]),[future,setFuture]=useState([]),[message,setMessage]=useState(""),[orders,setOrders]=useState([]),[projects,setProjects]=useState([]),[customers,setCustomers]=useState([]),[measureDraft,setMeasureDraft]=useState(null),[wallDrag,setWallDrag]=useState(null),[zoneDrag,setZoneDrag]=useState(null),[measureDrag,setMeasureDrag]=useState(null),[pan,setPan]=useState({x:0,y:0}),[panning,setPanning]=useState(null),[mobileEditOpen,setMobileEditOpen]=useState(false),[roomBuilder,setRoomBuilder]=useState(null),[quickAddOpen,setQuickAddOpen]=useState(false),[fieldMode,setFieldMode]=useState(false),[canvasAspect,setCanvasAspect]=useState(1),[wallBuilder,setWallBuilder]=useState(null),[snapHint,setSnapHint]=useState(null),[wallChain,setWallChain]=useState(null),[online,setOnline]=useState(true),[saveState,setSaveState]=useState("local"),[lastSavedAt,setLastSavedAt]=useState(null),[fieldReturnZoneId,setFieldReturnZoneId]=useState(null),[roomPickerOpen,setRoomPickerOpen]=useState(false),[deleteConfirmOpen,setDeleteConfirmOpen]=useState(false),[deleteBusy,setDeleteBusy]=useState(false),[printMode,setPrintMode]=useState(false),[quoteWarningOpen,setQuoteWarningOpen]=useState(false),[show3D,setShow3D]=useState(false),[elPlan,setElPlan]=useState(false),[wallViewId,setWallViewId]=useState(null),[furnitureBuilder,setFurnitureBuilder]=useState(null),[furnitureGapPick,setFurnitureGapPick]=useState(null),[focusView,setFocusView]=useState(false);
 const [camera3D,setCamera3D]=useState({yaw:42,pitch:34,zoom:1});
 const camera3DDrag=useRef(null);
 const svg=useRef(null);
 const leftPanel=useRef(null),rightPanel=useRef(null);
 const touchPointers=useRef(new Map()),pinchGesture=useRef(null),pendingCanvasTouch=useRef(null);
 const linkedOrderHandled=useRef(""),linkedLocalOrderHandled=useRef(""),printSelectionRef=useRef(null);
 const autosaveReady=useRef(false),docRef=useRef(doc),docsRef=useRef(docs),serverSyncInFlight=useRef(false),serverSyncQueued=useRef(false),serverSyncedSignature=useRef("");
 useEffect(()=>{docRef.current=doc},[doc]);
 useEffect(()=>{docsRef.current=docs},[docs]);
 useEffect(()=>{
  if(typeof window==="undefined"||!docs.length)return;
  const orderId=new URLSearchParams(window.location.search).get("orderId")||"";
  if(!orderId||linkedLocalOrderHandled.current===orderId)return;
  const candidates=docs.filter(item=>item.orderId===orderId).sort((a,b)=>(Number(b._localSavedAt)||0)-(Number(a._localSavedAt)||0));
  if(!candidates.length)return;
  const lastId=localStorage.getItem(LAST_STORE),chosen=candidates.find(item=>item.id===lastId)||candidates[0];
  linkedLocalOrderHandled.current=orderId;docRef.current=chosen;setDoc(chosen);setSelected(null);setHistory([]);setFuture([]);
  setSaveState(typeof navigator!=="undefined"&&!navigator.onLine?"offline":"local");
  setMessage(typeof navigator!=="undefined"&&!navigator.onLine?"Lokal oppdragstegning åpnet offline":"Lokal oppdragstegning åpnet");
  setTimeout(()=>setMessage(""),1800);
 },[docs]);
 useEffect(()=>{
  const update=()=>setOnline(navigator.onLine);
  update();window.addEventListener("online",update);window.addEventListener("offline",update);
  return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update)};
 },[]);
 useEffect(()=>{
  const finish=()=>{setPrintMode(false);if(printSelectionRef.current){setSelected(printSelectionRef.current);printSelectionRef.current=null}};
  const media=window.matchMedia?.("print"),onMedia=e=>{if(!e.matches)finish()};
  window.addEventListener("afterprint",finish);
  media?.addEventListener?.("change",onMedia);
  return()=>{window.removeEventListener("afterprint",finish);media?.removeEventListener?.("change",onMedia)};
 },[]);

 useEffect(()=>{const el=svg.current;if(!el||typeof ResizeObserver==="undefined")return;const update=()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setCanvasAspect(clamp(r.width/r.height,.35,2.8))};update();const observer=new ResizeObserver(update);observer.observe(el);window.addEventListener("orientationchange",update);return()=>{observer.disconnect();window.removeEventListener("orientationchange",update)}},[]);
 useEffect(()=>{try{const d=JSON.parse(localStorage.getItem(STORE)||"[]");if(d.length){const lastId=localStorage.getItem(LAST_STORE),active=d.find(item=>item.id===lastId)||d[0];setDocs(d);setDoc({...initial(),...active})}else{const old=JSON.parse(localStorage.getItem("aadlandDrawing")||"null");if(old)setDoc({...initial(),...old})}}catch{} Promise.all([
  fetch("/api/admin/orders").then(r=>r.ok?r.json():null).catch(()=>null),
  fetch("/api/admin/projects").then(r=>r.ok?r.json():null).catch(()=>null),
  fetch("/api/admin/customers").then(r=>r.ok?r.json():null).catch(()=>null)
 ]).then(([orderData,projectData,customerData])=>{
  setOrders((orderData?.orders||[]).filter(order=>order.orderType==="custom"&&!order.archivedAt));
  setProjects(projectData?.projects||[]);
  setCustomers(customerData?.customers||[]);
 }).catch(()=>{});},[]);
 useEffect(()=>{
  const readyTimer=setTimeout(()=>{autosaveReady.current=true},700);
  return()=>clearTimeout(readyTimer);
 },[]);
 const writeLocalSnapshot=(next=docRef.current,{silent=false}={})=>{
  try{
   const savedAt=Date.now(),storedNext={...next,_localSavedAt:savedAt},current=docsRef.current||[],list=[storedNext,...current.filter(x=>x.id!==next.id)];
   localStorage.setItem(STORE,JSON.stringify(list));localStorage.setItem(LAST_STORE,next.id);
   docsRef.current=list;
   if(!silent){
    setDocs(list);
    const synced=!!serverSyncedSignature.current&&(next.orderId||next.projectId||next.customerUserId)&&serverSignature(next)===serverSyncedSignature.current;
    setSaveState(typeof navigator!=="undefined"&&!navigator.onLine?"offline":synced?"server":"local");
    setLastSavedAt(savedAt);
   }
   return list;
  }catch{return null}
 };
 useEffect(()=>{
  if(!autosaveReady.current)return;
  const timer=setTimeout(()=>writeLocalSnapshot(doc),220);
  return()=>clearTimeout(timer);
 },[doc]);
 useEffect(()=>{
  const flush=()=>{if(autosaveReady.current)writeLocalSnapshot(docRef.current,{silent:true})};
  const onVisibility=()=>{if(document.visibilityState==="hidden")flush()};
  window.addEventListener("pagehide",flush);
  document.addEventListener("visibilitychange",onVisibility);
  return()=>{window.removeEventListener("pagehide",flush);document.removeEventListener("visibilitychange",onVisibility)};
 },[]);
 const persistLocal=next=>writeLocalSnapshot(next);
 const serverPayload=next=>{const {_localSavedAt,_serverUpdatedAt,serverId,...drawingData}=next;return {id:serverId,orderId:next.orderId||null,projectId:next.projectId||null,customerUserId:next.customerUserId||null,customerVisible:next.customerVisible===true,name:next.name,customer:next.customer,address:next.address,notes:next.notes,drawingData}};
 const serverSignature=next=>JSON.stringify(serverPayload(next));
 const syncServer=async(next=docRef.current,{quiet=false}={})=>{
  if(!next?.orderId&&!next?.projectId&&!next?.customerUserId)return false;
  if(typeof navigator!=="undefined"&&!navigator.onLine){setSaveState("offline");return false}
  const signature=serverSignature(next);
  if(quiet&&signature===serverSyncedSignature.current)return true;
  if(serverSyncInFlight.current){serverSyncQueued.current=true;return false}
  serverSyncInFlight.current=true;serverSyncQueued.current=false;if(!quiet)setMessage("Lagrer…");setSaveState("syncing");
  try{
   const r=await fetch("/api/admin/project-drawings",{method:next.serverId?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(serverPayload(next))}),x=await r.json();
   if(r.ok&&x.drawing){
    const serverSnapshot={...next,serverId:x.drawing.id},latest=docRef.current,saved=latest.id===next.id?{...latest,serverId:x.drawing.id}:serverSnapshot;
    serverSyncedSignature.current=serverSignature(serverSnapshot);docRef.current=saved;setDoc(saved);writeLocalSnapshot(saved);
    const fullySynced=serverSignature(saved)===serverSyncedSignature.current;
    setSaveState(fullySynced?"server":"local");setLastSavedAt(Date.now());
    if(!fullySynced)serverSyncQueued.current=true;
    if(!quiet){setMessage(fullySynced?"Lagret i oppdraget":"Lagret · synkroniserer siste endringer");setTimeout(()=>setMessage(""),1800)}
    return true;
   }
   setSaveState("local");
   if(!quiet){setMessage(x.setupRequired?"Lokalt lagret · database ikke aktivert":"Lokalt lagret · serverfeil");setTimeout(()=>setMessage(""),2600)}
  }catch{
   setSaveState(typeof navigator!=="undefined"&&!navigator.onLine?"offline":"local");
   if(!quiet){setMessage("Lokalt lagret · server utilgjengelig");setTimeout(()=>setMessage(""),2600)}
  }finally{
   serverSyncInFlight.current=false;
   if(serverSyncQueued.current){serverSyncQueued.current=false;setTimeout(()=>syncServer(docRef.current,{quiet:true}),0)}
  }
  return false;
 };
 useEffect(()=>{
  if(!autosaveReady.current||(!doc.orderId&&!doc.projectId&&!doc.customerUserId))return;
  const timer=setTimeout(()=>syncServer(docRef.current,{quiet:true}),8000);
  return()=>clearTimeout(timer);
 },[doc]);
 useEffect(()=>{
  if(!online)return;
  const current=docRef.current;
  if(current?.orderId||current?.projectId||current?.customerUserId){const timer=setTimeout(()=>syncServer(current,{quiet:true}),500);return()=>clearTimeout(timer)}
 },[online]);
 const persist=async(next=docRef.current)=>{writeLocalSnapshot(next);if(!next.orderId&&!next.projectId&&!next.customerUserId){setMessage("Lagret på enheten");setTimeout(()=>setMessage(""),1800);return}await syncServer(next,{quiet:false})};
 const checkpoint=()=>setHistory(h=>[...h.slice(-24),JSON.stringify(doc)]);
 const syncMounted=(walls,items,zones=[])=>items.map(o=>{if(!o.wallId)return o;const w=walls.find(x=>x.id===o.wallId);if(!w)return {...o,wallId:null,wallOffset:null};const {off,a,cx,cy}=mountedItemCenter(o,w,zones);return {...o,x:cx-o.w/2,y:cy-o.h/2,rot:a*180/Math.PI,wallOffset:off}});
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
 const magneticPoint=(p,walls=doc.walls,excludeWallId=null,ignoreNear=null)=>{
  const threshold=Math.max(55,220/(doc.zoom||1));
  let best=null;
  for(const wall of walls){
   if(wall.id===excludeWallId)continue;
   for(const [end,endpoint] of [[1,{x:wall.x1,y:wall.y1}],[2,{x:wall.x2,y:wall.y2}]]){
    if(ignoreNear&&Math.hypot(endpoint.x-ignoreNear.x,endpoint.y-ignoreNear.y)<8)continue;
    const dist=Math.hypot(p.x-endpoint.x,p.y-endpoint.y);
    if(dist<=threshold&&(!best||dist<best.dist))best={...endpoint,dist,wallId:wall.id,end};
   }
  }
  return best?{point:{x:best.x,y:best.y},snapped:true,anchor:{wallId:best.wallId,end:best.end}}:{point:{x:snapTo(p.x,doc.snapSize||50),y:snapTo(p.y,doc.snapSize||50)},snapped:false,anchor:null};
 };
 const wallMagneticPoint=(p,origin)=>{
  const endpoint=magneticPoint(p);
  if(endpoint.snapped)return {...endpoint,label:"Hjørne"};
  if(!origin)return endpoint;
  const dx=p.x-origin.x,dy=p.y-origin.y,L=Math.hypot(dx,dy);
  if(L<120)return endpoint;
  const raw=Math.atan2(dy,dx)*180/Math.PI,nearest=Math.round(raw/45)*45;
  const diff=Math.abs((((raw-nearest)+180)%360+360)%360-180);
  if(diff>7)return endpoint;
  const rad=nearest*Math.PI/180,point={x:clamp(origin.x+Math.cos(rad)*L,0,VIEW),y:clamp(origin.y+Math.sin(rad)*L,0,VIEW)};
  return {point,snapped:true,label:(((nearest%360)+360)%360)+"°"};
 };
 const clampPanForZoom=(value,zoom)=>{const dims=viewDimsFor(zoom);return{x:clamp(value.x,0,Math.max(0,VIEW-dims.w)),y:clamp(value.y,0,Math.max(0,VIEW-dims.h))}};
 const zoomBy=delta=>setDoc(d=>{const oldZoom=d.zoom||1,oldDims=viewDimsFor(oldZoom),zoom=clamp(oldZoom+delta,.5,5),nextDims=viewDimsFor(zoom);setPan(p=>clampPanForZoom({x:p.x+oldDims.w/2-nextDims.w/2,y:p.y+oldDims.h/2-nextDims.h/2},zoom));return {...d,zoom}});
 const fitView=()=>{const b=drawingBounds(),aspect=clamp(canvasAspect||1,.35,2.8),base=aspect>=1?{w:VIEW,h:VIEW/aspect}:{w:VIEW*aspect,h:VIEW},zoom=clamp(Math.min(base.w/Math.max(500,b.w*1.12),base.h/Math.max(500,b.h*1.12)),.5,5),nextDims=viewDimsFor(zoom);setPan(clampPanForZoom({x:b.x+b.w/2-nextDims.w/2,y:b.y+b.h/2-nextDims.h/2},zoom));setDoc(d=>({...d,zoom}))};
 const focusPoints=points=>{
  if(!Array.isArray(points)||!points.length)return;
  const xs=points.map(p=>Number(p.x)||0),ys=points.map(p=>Number(p.y)||0),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),w=Math.max(500,maxX-minX),h=Math.max(500,maxY-minY);
  const aspect=clamp(canvasAspect||1,.35,2.8),base=aspect>=1?{w:VIEW,h:VIEW/aspect}:{w:VIEW*aspect,h:VIEW},zoom=clamp(Math.min(base.w/(w*1.25),base.h/(h*1.25)),.5,5),dims=viewDimsFor(zoom);
  setPan(clampPanForZoom({x:(minX+maxX)/2-dims.w/2,y:(minY+maxY)/2-dims.h/2},zoom));setDoc(d=>({...d,zoom}));
 };
 const openRoomFromPicker=zone=>{setRoomPickerOpen(false);setQuickAddOpen(false);setSelected({kind:"zone",id:zone.id});setTool("select");setTimeout(()=>{setMobileEditOpen(true);focusPoints(zone.points)},0)};
 const capturePointer=e=>{try{svg.current?.setPointerCapture?.(e.pointerId)}catch{}};
 const releasePointer=e=>{try{if(svg.current?.hasPointerCapture?.(e.pointerId))svg.current.releasePointerCapture(e.pointerId)}catch{}};
 const scrollPanel=ref=>ref.current?.scrollIntoView?.({behavior:"smooth",block:"start"});
 const clearPendingCanvasTouch=()=>{if(pendingCanvasTouch.current){clearTimeout(pendingCanvasTouch.current);pendingCanvasTouch.current=null}};
 const rollbackGestureDrag=()=>{const start=drag?.start||wallDrag?.start||zoneDrag?.start||measureDrag?.start;if(start){try{setDoc(JSON.parse(start))}catch{}}setDrag(null);setWallDrag(null);setZoneDrag(null);setMeasureDrag(null);setPanning(null)};
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
 const newDoc=()=>{const d=initial();try{localStorage.setItem(LAST_STORE,d.id)}catch{}setDoc(d);setSelected(null);setHistory([]);setFuture([])};
 const openDoc=id=>{const d=docs.find(x=>x.id===id);if(d){try{localStorage.setItem(LAST_STORE,d.id)}catch{}setDoc(d);setSelected(null);setHistory([]);setFuture([])}};
 const chooseLocalOrServer=(local,incoming)=>{
  if(!local)return incoming;
  const localTime=Number(local._localSavedAt)||0,serverTime=Date.parse(incoming._serverUpdatedAt||"")||0,same=serverSignature(local)===serverSignature(incoming);
  return !same&&localTime>serverTime?local:incoming;
 };
 const mergeIncomingDrawings=incoming=>{if(!incoming.length)return;const merged=[...(docsRef.current||[])];let keptLocal=0;for(const drawing of incoming){const i=merged.findIndex(x=>x.serverId===drawing.serverId);if(i>=0){const chosen=chooseLocalOrServer(merged[i],drawing);if(chosen===merged[i])keptLocal++;merged[i]=chosen}else merged.push(drawing)}docsRef.current=merged;setDocs(merged);localStorage.setItem(STORE,JSON.stringify(merged));setMessage(keptLocal?"Nyere lokal tegning beholdt":incoming.length+" tegning(er) hentet");setTimeout(()=>setMessage(""),2200)};
 const loadOrderDrawings=async orderId=>{if(!orderId)return;try{const r=await fetch("/api/admin/project-drawings?orderId="+encodeURIComponent(orderId)),x=await r.json();if(!r.ok||x.setupRequired)return;const incoming=(x.drawings||[]).map(row=>({...initial(),...(row.drawingData||{}),serverId:row.id,orderId:row.orderId||orderId,projectId:row.projectId||"",customerUserId:row.customerUserId||"",customerVisible:row.customerVisible===true,name:row.name,customer:row.customer,address:row.address,notes:row.notes,_serverUpdatedAt:row.updatedAt||null}));mergeIncomingDrawings(incoming)}catch{}};
 const loadProjectDrawings=async projectId=>{if(!projectId)return;try{const r=await fetch("/api/admin/project-drawings?projectId="+encodeURIComponent(projectId)),x=await r.json();if(!r.ok||x.setupRequired)return;const incoming=(x.drawings||[]).map(row=>({...initial(),...(row.drawingData||{}),serverId:row.id,orderId:row.orderId||"",projectId:row.projectId,customerUserId:row.customerUserId||"",customerVisible:row.customerVisible===true,name:row.name,customer:row.customer,address:row.address,notes:row.notes,_serverUpdatedAt:row.updatedAt||null}));mergeIncomingDrawings(incoming)}catch{}};
 const changeOrder=e=>{const orderId=e.target.value,order=orders.find(item=>item.id===orderId),email=String(order?.customer?.email||"").trim().toLowerCase(),account=customers.find(c=>String(c.email||"").trim().toLowerCase()===email);setDoc(d=>({...d,orderId,projectId:orderId?"":d.projectId,customerUserId:orderId?(account?.id||d.customerUserId):d.customerUserId,customer:orderId?(order?.customerName||d.customer):d.customer,address:orderId?(order?.customer?.address||d.address):d.address,name:orderId&&d.name==="Ny tegning"?"Tegning – "+(order?.orderNumber||"oppdrag"):d.name}));if(orderId)loadOrderDrawings(orderId)};
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
   const localList=docsRef.current||[],lastId=localStorage.getItem(LAST_STORE),activeLocal=localList.find(item=>item.id===lastId&&item.orderId===orderId)||null;
   try{
    const r=await fetch("/api/admin/project-drawings?orderId="+encodeURIComponent(orderId)),x=await r.json();
    if(cancelled)return;
    if(r.ok&&!x.setupRequired&&Array.isArray(x.drawings)&&x.drawings.length){
     const incoming=x.drawings.map(row=>({...initial(),...(row.drawingData||{}),serverId:row.id,orderId:row.orderId||orderId,projectId:row.projectId||"",customerUserId:row.customerUserId||"",customerVisible:row.customerVisible===true,name:row.name,customer:row.customer,address:row.address,notes:row.notes,_serverUpdatedAt:row.updatedAt||null}));
     const latest=incoming[0],sameLocal=(docsRef.current||[]).find(item=>item.serverId===latest.serverId),serverChoice=chooseLocalOrServer(sameLocal,latest);
     let chosen=serverChoice;
     if(activeLocal&&!activeLocal.serverId){
      const localTime=Number(activeLocal._localSavedAt)||0,serverTime=Date.parse(latest._serverUpdatedAt||"")||0;
      if(localTime>serverTime)chosen=activeLocal;
     }
     mergeIncomingDrawings(incoming);
     docRef.current=chosen;setDoc(chosen);try{localStorage.setItem(LAST_STORE,chosen.id)}catch{}
     setSelected(null);setHistory([]);setFuture([]);
     if(chosen===latest){serverSyncedSignature.current=serverSignature(latest);setSaveState("server")}
     else setSaveState(typeof navigator!=="undefined"&&!navigator.onLine?"offline":"local");
     setMessage(chosen===latest?"Tegning hentet fra "+(order.orderNumber||"oppdraget"):"Nyere lokal befaringstegning beholdt");
     setTimeout(()=>setMessage(""),2400);
     return;
    }
   }catch{}
   if(cancelled)return;
   if(activeLocal){
    docRef.current=activeLocal;setDoc(activeLocal);setSelected(null);setHistory([]);setFuture([]);
    setSaveState(typeof navigator!=="undefined"&&!navigator.onLine?"offline":"local");
    setMessage("Lokal befaringstegning åpnet");
    setTimeout(()=>setMessage(""),2200);
    return;
   }
   const email=String(order.customer?.email||"").trim().toLowerCase(),account=customers.find(c=>String(c.email||"").trim().toLowerCase()===email);
   const next={...initial(),orderId,customerUserId:account?.id||"",customer:order.customerName||"",address:order.customer?.address||"",name:"Tegning – "+(order.orderNumber||"oppdrag")};
   docRef.current=next;setDoc(next);setSelected(null);setHistory([]);setFuture([]);
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
   const walls=pts.slice(0,-1).map((p,i)=>({id:uid(),x1:p[0],y1:p[1],x2:pts[i+1][0],y2:pts[i+1][1],t,h:H}));
   const points=walls.map(wall=>({x:wall.x1,y:wall.y1})),zone={id:uid(),name,points,wallIds:walls.map(wall=>wall.id),ceilingHeight:H,floorFinish:"",notes:""};
   mutate(d=>({...d,walls:[...d.walls,...walls],zones:[...(d.zones||[]),zone]}));
   setSelected({kind:"zone",id:zone.id});
  }else{
   const walls=[{id:uid(),x1:x,y1:y,x2:x+w,y2:y,t,h:H},{id:uid(),x1:x+w,y1:y,x2:x+w,y2:y+h,t,h:H},{id:uid(),x1:x+w,y1:y+h,x2:x,y2:y+h,t,h:H},{id:uid(),x1:x,y1:y+h,x2:x,y2:y,t,h:H}];
   const points=walls.map(wall=>({x:wall.x1,y:wall.y1})),zone={id:uid(),name,points,wallIds:walls.map(wall=>wall.id),ceilingHeight:H,floorFinish:"",notes:""};
   mutate(d=>({...d,walls:[...d.walls,...walls],zones:[...(d.zones||[]),zone]}));
   setSelected({kind:"zone",id:zone.id});
  }
  const focusZoom=clamp(VIEW/Math.max(500,Math.max(w,h)*1.18),.5,5),focusView=VIEW/focusZoom;
  setPan(clampPanForZoom({x:x+w/2-focusView/2,y:y+h/2-focusView/2},focusZoom));
  setDoc(d=>({...d,zoom:focusZoom}));
  setRoomBuilder(null);setTool("select");
 };
 const makeRoom=()=>openRoomBuilder("rect");
 const makeLRoom=()=>openRoomBuilder("l");
 const wallForView=wallViewId?doc.walls.find(w=>w.id===wallViewId)||null:null;
 const wallSelectedItem=wallForView&&selected?.kind==="item"?doc.items.find(item=>item.id===selected.id&&item.wallId===wallForView.id)||null:null;
 const updateWallVerticalItem=(itemId,key,value)=>{
  const n=Number(value);if(!Number.isFinite(n))return;
  const item=doc.items.find(o=>o.id===itemId),wall=item?.wallId?doc.walls.find(w=>w.id===item.wallId):null;if(!item||!wall)return;
  const H=Math.max(300,Number(wall.h)||Number(doc.defaultWallHeight)||2400),next={...item};
  if(key==="mountHeight")next.mountHeight=clamp(n,0,H);
  else if(key==="sillHeight"){const opening=Math.max(100,Number(item.openingHeight)||1200);next.sillHeight=clamp(n,0,Math.max(0,H-opening))}
  else if(key==="openingHeight"){const sill=item.type==="window"?Math.max(0,Number(item.sillHeight)||0):0;next.openingHeight=clamp(n,100,Math.max(100,H-sill))}
  else if(key==="elevation"){const height=Math.max(50,modelHeight(item));next.elevation=clamp(n,0,Math.max(0,H-height))}
  else if(key==="modelHeight"){const elevation=Math.max(0,Number(item.elevation)||0);next.modelHeight=clamp(n,50,Math.max(50,H-elevation))}
  else return;
  mutate(d=>({...d,items:d.items.map(o=>o.id===itemId?next:o)}));
 };
 const start3DOrbit=e=>{camera3DDrag.current={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:camera3D.yaw,pitch:camera3D.pitch};e.currentTarget.setPointerCapture?.(e.pointerId)};
 const move3DOrbit=e=>{const d=camera3DDrag.current;if(!d||d.id!==e.pointerId)return;setCamera3D(c=>({...c,yaw:d.yaw+(e.clientX-d.x)*.35,pitch:clamp(d.pitch-(e.clientY-d.y)*.22,8,78)}))};
 const end3DOrbit=e=>{if(camera3DDrag.current?.id===e.pointerId)camera3DDrag.current=null;try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}};
 const openWallView=(wallId=null)=>{
  const id=wallId||(selected?.kind==="wall"?selected.id:null)||doc.walls[0]?.id;
  if(!id){setMessage("Tegn minst én vegg først");setTimeout(()=>setMessage(""),1800);return}
  setWallViewId(id);setSelected({kind:"wall",id});setShow3D(false);
 };
 const cycleWallView=direction=>{
  if(!doc.walls.length)return;
  const current=Math.max(0,doc.walls.findIndex(w=>w.id===wallViewId)),index=(current+direction+doc.walls.length)%doc.walls.length;
  openWallView(doc.walls[index].id);
 };
 const openFurnitureBuilder=(wallId=null,templateId="custom")=>{
  const template=furnitureTemplates.find(x=>x.id===templateId)||furnitureTemplates.at(-1);
  const resolvedWall=wallId?doc.walls.find(w=>w.id===wallId):selected?.kind==="wall"?doc.walls.find(w=>w.id===selected.id):wallForView;
  const mount=resolvedWall?"wall":template.mount;
  setFurnitureBuilder({
   templateId:template.id,name:template.name,width:String(template.width),depth:String(template.depth),height:String(template.height),
   elevation:String(template.elevation),mount:resolvedWall&&mount==="wall"?"wall":mount,wallId:resolvedWall?.id||"",
   start:"",sectionsX:String(template.sectionsX),sectionsY:String(template.sectionsY)
  });
 };
 const applyFurnitureTemplate=templateId=>{
  const template=furnitureTemplates.find(x=>x.id===templateId)||furnitureTemplates.at(-1);
  setFurnitureBuilder(v=>v?{...v,templateId:template.id,name:template.name,width:String(template.width),depth:String(template.depth),height:String(template.height),elevation:String(template.elevation),mount:template.mount,sectionsX:String(template.sectionsX),sectionsY:String(template.sectionsY)}:v);
 };
 const placeCustomFurniture=(builder,fitGap=null)=>{
  if(!builder)return;
  const width=fitGap?Number(fitGap.width):Number(builder.width),depth=Number(builder.depth),height=Number(builder.height),elevation=Number(builder.elevation)||0,sectionsX=clamp(Math.round(Number(builder.sectionsX)||1),1,8),sectionsY=clamp(Math.round(Number(builder.sectionsY)||1),1,6),name=String(builder.name||"").trim()||"Eget møbel";
  if(!Number.isFinite(width)||!Number.isFinite(depth)||!Number.isFinite(height)||width<100||depth<50||height<50||width>6000||depth>2000||height>5000||elevation<0||elevation>5000){setMessage("Sjekk møbelmålene");setTimeout(()=>setMessage(""),2000);return}
  const id=uid();
  if(builder.mount==="wall"||fitGap){
   const wall=doc.walls.find(w=>w.id===builder.wallId)||wallForView||(selected?.kind==="wall"?doc.walls.find(w=>w.id===selected.id):null);
   if(!wall){setMessage("Velg en vegg for veggmontert møbel");setTimeout(()=>setMessage(""),2000);return}
   const L=len(wall),wallHeight=Math.max(300,Number(wall.h)||Number(doc.defaultWallHeight)||2400);if(width>L){setMessage("Møbelet er bredere enn veggen");setTimeout(()=>setMessage(""),2000);return}if(elevation+height>wallHeight){setMessage("Møbelet går over veggens høyde");setTimeout(()=>setMessage(""),2200);return}
   const rawStart=fitGap?Number(fitGap.start):(String(builder.start||"").trim()===""?(L-width)/2:Number(builder.start));
   const start=clamp(Number.isFinite(rawStart)?rawStart:(L-width)/2,0,Math.max(0,L-width)),off=start+width/2,base={id,type:"customwall",customName:name,x:0,y:0,w:width,h:depth,rot:0,wallId:wall.id,wallOffset:off,modelHeight:height,elevation,sectionsX,sectionsY},placed=mountedItemCenter(base,wall,doc.zones||[]);
   mutate(d=>({...d,items:[...d.items,{...base,x:placed.cx-width/2,y:placed.cy-depth/2,rot:placed.a*180/Math.PI,wallOffset:placed.off}]}));
   setWallViewId(wall.id);setSelected({kind:"item",id});
   if(fitGap){setMessage("Møbelet ble tilpasset mellomrommet automatisk · "+Math.round(width)+" mm");setTimeout(()=>setMessage(""),2600)}
  }else{
   const zone=selected?.kind==="zone"?(doc.zones||[]).find(z=>z.id===selected.id):null,center=zone?polygonCentroid(zone.points):{x:pan.x+viewWidth/2,y:pan.y+viewHeight/2};
   mutate(d=>{
    const proposed={id,type:"customfloor",customName:name,x:center.x-width/2,y:center.y-depth/2,w:width,h:depth,rot:0,modelHeight:height,elevation,sectionsX,sectionsY};
    const placed=constrainFreeItemStrict(proposed,roomPlacementZones(d.zones,d.walls,d.defaultWallThickness),{fallbackItem:proposed,fallbackCenter:center,snapDistance:0});
    return {...d,items:[...d.items,placed]};
   });
   setSelected({kind:"item",id});
  }
  setFurnitureBuilder(null);setFurnitureGapPick(null);setTool("select");
 };
 const createCustomFurniture=()=>placeCustomFurniture(furnitureBuilder);
 const startFurnitureGapPick=()=>{
  if(!furnitureBuilder)return;
  const wallId=furnitureBuilder.wallId||wallForView?.id||(selected?.kind==="wall"?selected.id:"")||doc.walls[0]?.id||"";
  if(!wallId){setMessage("Tegn en vegg først");setTimeout(()=>setMessage(""),1800);return}
  const wall=doc.walls.find(w=>w.id===wallId),gaps=wallFurnitureGaps(wall,doc.items);
  if(!gaps.length){setMessage("Fant ikke et ledig mellomrom på denne veggen");setTimeout(()=>setMessage(""),2200);return}
  setFurnitureGapPick({...furnitureBuilder,mount:"wall",wallId});setFurnitureBuilder(null);setWallViewId(wallId);setSelected({kind:"wall",id:wallId});setShow3D(false);
  setMessage("Trykk på mellomrommet der møbelet skal stå");setTimeout(()=>setMessage(""),3200);
 };
 const chooseFurnitureGap=gap=>{if(furnitureGapPick)placeCustomFurniture(furnitureGapPick,gap)};
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
 const openingCollision=(wall,itemId,start,width,items=doc.items)=>{
  const end=start+width;
  return wallOpeningLayout(wall,items).rows.some(row=>row.item.id!==itemId&&start<row.gaps.start+Number(row.item.w||0)&&end>row.gaps.start);
 };
 const findOpeningStart=(wall,width,items=doc.items,excludeId=null,preferredValue=null)=>{
  const W=Math.max(0,Number(width)||0),filtered=(items||[]).filter(item=>item.id!==excludeId),layout=wallOpeningLayout(wall,filtered),preferred=preferredValue==null?Math.max(0,(layout.L-W)/2):clamp(Number(preferredValue)||0,0,Math.max(0,layout.L-W));
  const intervals=layout.rows.map(row=>({start:row.gaps.start,end:row.gaps.start+Number(row.item.w||0)}));
  const candidates=[preferred,0,...intervals.flatMap(x=>[x.end,Math.max(0,x.start-W)])].filter(value=>value>=0&&value+W<=layout.L).sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
  return candidates.find(start=>!intervals.some(x=>start<x.end&&start+W>x.start))??null;
 };
 const addItemToWall=(type,w,h,wallId=null,returnZoneId=null)=>{
  const id=uid();
  let selectedWall=wallId?doc.walls.find(wall=>wall.id===wallId):selected?.kind==="wall"?doc.walls.find(wall=>wall.id===selected.id):null;
  if(!selectedWall&&wallElectricalTypes.has(type)){
   if(!doc.walls.length){setMessage("Tegn en vegg først for å plassere "+labelFor(type).toLowerCase());setTimeout(()=>setMessage(""),2200);return}
   const viewCenter={x:pan.x+viewWidth/2,y:pan.y+viewHeight/2};
   selectedWall=nearestWall(viewCenter,doc.walls)?.wall||doc.walls[0];
  }
  if(selectedWall&&wallTypes.has(type)){
   const start=openingTypes.has(type)?findOpeningStart(selectedWall,w):Math.max(0,(len(selectedWall)-w)/2);
   if(start==null){setMessage("Ikke nok ledig plass på veggen");setTimeout(()=>setMessage(""),2200);return}
   const off=start+w/2,a=Math.atan2(selectedWall.y2-selectedWall.y1,selectedWall.x2-selectedWall.x1),cx=selectedWall.x1+Math.cos(a)*off,cy=selectedWall.y1+Math.sin(a)*off;
   mutate(d=>({...d,items:[...d.items,{id,type,x:cx-w/2,y:cy-h/2,w,h,rot:a*180/Math.PI,wallId:selectedWall.id,wallOffset:off,...openingDefaults(type),...itemDefaults(type,d)}]}));
  }else{
   const cx=pan.x+viewWidth/2,cy=pan.y+viewHeight/2,x=snapTo(cx-w/2,doc.snapSize||50),y=snapTo(cy-h/2,doc.snapSize||50);
   mutate(d=>{
    const proposed={id,type,x:clamp(x,0,VIEW-w),y:clamp(y,0,VIEW-h),w,h,rot:0,...openingDefaults(type),...itemDefaults(type,d)};
    const placementZones=roomPlacementZones(d.zones,d.walls,d.defaultWallThickness);
    const placed=constrainFreeItemStrict(proposed,placementZones,{fallbackItem:proposed,fallbackCenter:{x:cx,y:cy},snapDistance:0});
    return {...d,items:[...d.items,placed]};
   });
  }
  setFieldReturnZoneId(returnZoneId||null);setSelected({kind:"item",id});setTool("select");setQuickAddOpen(false);setTimeout(()=>setMobileEditOpen(true),0);
 };
 const addItem=(type,w,h)=>addItemToWall(type,w,h);
 const addWallWorkspaceItem=(type,w,h)=>{if(!wallForView)return;addItemToWall(type,w,h,wallForView.id);setTimeout(()=>setMobileEditOpen(false),0)};
 const sel=useMemo(()=>selected?.kind==="wall"?doc.walls.find(x=>x.id===selected.id):selected?.kind==="item"?doc.items.find(x=>x.id===selected.id):selected?.kind==="zone"?(doc.zones||[]).find(x=>x.id===selected.id):selected?.kind==="measurement"?(doc.measurements||[]).find(x=>x.id===selected.id):null,[selected,doc]);
 const selectedZoneWalls=useMemo(()=>selected?.kind==="zone"&&Array.isArray(sel?.wallIds)?sel.wallIds.map(id=>doc.walls.find(w=>w.id===id)).filter(Boolean):[],[selected,sel,doc.walls]);
 const selectedRoomDiagnostics=useMemo(()=>linkedRoomDiagnostics(selectedZoneWalls),[selectedZoneWalls]);
 const selectedSurveyProgress=useMemo(()=>{const valid=new Set(selectedZoneWalls.map(w=>w.id)),done=(sel?.surveyedWallIds||[]).filter(id=>valid.has(id));return {done:done.length,total:selectedZoneWalls.length,complete:selectedZoneWalls.length>0&&done.length===selectedZoneWalls.length}},[sel?.surveyedWallIds,selectedZoneWalls]);
 const selectedSurveyState=useMemo(()=>selected?.kind==="zone"?zoneSurveyState(sel,doc.walls,doc.items):{ready:false,overlap:false,closed:false,done:0,total:0},[selected,sel,doc.walls,doc.items]);
 const selectedRoomQuantity=useMemo(()=>{
  if(selected?.kind!=="zone"||!sel)return null;
  const ids=new Set(selectedZoneWalls.map(w=>w.id)),perimeter=polygonPerimeterM(sel.points),height=(Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400)/1000;
  const openings=doc.items.filter(o=>ids.has(o.wallId)&&openingTypes.has(o.type));
  const grossWallM2=selectedZoneWalls.length?selectedZoneWalls.reduce((sum,w)=>sum+len(w)*(Number(w.h)||Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400),0)/1000000:perimeter*height;
  const openingM2=openings.reduce((sum,o)=>{const wall=doc.walls.find(w=>w.id===o.wallId),wallHeight=Number(wall?.h)||Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400,openingHeight=Math.min(wallHeight,Number(o.openingHeight)||openingDefaults(o.type).openingHeight||0);return sum+(Number(o.w)||0)*openingHeight/1000000},0);
  const floorBreakM=openings.filter(o=>["door","sliding","opening"].includes(o.type)).reduce((sum,o)=>sum+(Number(o.w)||0)/1000,0);
  return {grossWallM2,openingM2,netWallM2:Math.max(0,grossWallM2-openingM2),grossSkirtingM:perimeter,netSkirtingM:Math.max(0,perimeter-floorBreakM)};
 },[selected,sel,selectedZoneWalls,doc.items,doc.walls,doc.defaultWallHeight]);
 const overallSurveyProgress=useMemo(()=>{const zones=doc.zones||[],states=zones.map(zone=>zoneSurveyState(zone,doc.walls,doc.items)),done=states.filter(state=>state.finished).length,stale=states.filter(state=>state.stale).length;return {done,stale,total:zones.length,remaining:Math.max(0,zones.length-done),complete:zones.length>0&&done===zones.length}},[doc.zones,doc.walls,doc.items]);
 const surveyReportRooms=useMemo(()=>{const byId=new Map(doc.walls.map(w=>[w.id,w]));return (doc.zones||[]).map((zone,zoneIndex)=>{
  const walls=(zone.wallIds||[]).map(id=>byId.get(id)).filter(Boolean),state=zoneSurveyState(zone,doc.walls,doc.items),diagnostics=linkedRoomDiagnostics(walls);
  const wallRows=walls.map((wall,index)=>{const layout=wallOpeningLayout(wall,doc.items),openings=layout.rows.map(({item,gaps})=>({id:item.id,label:labelFor(item.type),width:Math.round(Number(item.w)||0),start:gaps.start,end:gaps.end,openingHeight:Math.round(Number(item.openingHeight)||openingDefaults(item.type).openingHeight||0),sillHeight:item.type==="window"?Math.round(Number(item.sillHeight)||0):null,flip:!!item.flip}));return {id:wall.id,index:index+1,length:len(wall),angle:angle(wall),height:Math.round(Number(wall.h)||0),thickness:Math.round(Number(wall.t)||0),corner:diagnostics.corners[index],surveyed:(zone.surveyedWallIds||[]).includes(wall.id),openings}}); 
  const d1=Number(zone.diagonal1Measured),d2=Number(zone.diagonal2Measured);
  const perimeter=polygonPerimeterM(zone.points),roomOpenings=doc.items.filter(item=>walls.some(w=>w.id===item.wallId)&&openingTypes.has(item.type)),grossWallM2=walls.length?walls.reduce((sum,w)=>sum+len(w)*(Number(w.h)||Number(zone.ceilingHeight)||Number(doc.defaultWallHeight)||2400),0)/1000000:perimeter*((Number(zone.ceilingHeight)||Number(doc.defaultWallHeight)||2400)/1000),openingM2=roomOpenings.reduce((sum,item)=>{const wall=walls.find(w=>w.id===item.wallId),wallHeight=Number(wall?.h)||Number(zone.ceilingHeight)||Number(doc.defaultWallHeight)||2400,openingHeight=Math.min(wallHeight,Number(item.openingHeight)||openingDefaults(item.type).openingHeight||0);return sum+(Number(item.w)||0)*openingHeight/1000000},0),floorBreakM=roomOpenings.filter(item=>["door","sliding","opening"].includes(item.type)).reduce((sum,item)=>sum+(Number(item.w)||0)/1000,0);
  return {id:zone.id,index:zoneIndex+1,name:zone.name||"Rom "+(zoneIndex+1),area:polygonAreaM2(zone.points),perimeter,ceilingHeight:Math.round(Number(zone.ceilingHeight)||Number(doc.defaultWallHeight)||2400),grossWallM2,openingM2,netWallM2:Math.max(0,grossWallM2-openingM2),netSkirtingM:Math.max(0,perimeter-floorBreakM),state,wallRows,diagonals:diagnostics.diagonals,measuredDiagonals:[Number.isFinite(d1)&&d1>0?Math.round(d1):null,Number.isFinite(d2)&&d2>0?Math.round(d2):null],surveyNotes:zone.roomSurveyNotes||"",zoneNotes:zone.notes||"",floorFinish:zone.floorFinish||""};
 })},[doc.zones,doc.walls,doc.items,doc.defaultWallHeight]);
 const surveyReportMeasurements=useMemo(()=>(doc.measurements||[]).map((m,index)=>({id:m.id,index:index+1,label:m.label||"Mål "+(index+1),distance:Math.round(Math.hypot(m.x2-m.x1,m.y2-m.y1))})),[doc.measurements]);

 const openNextSurveyIssue=()=>{
  const target=(doc.zones||[]).find(zone=>!zoneSurveyState(zone,doc.walls,doc.items).finished);
  if(target)openRoomFromPicker(target);
 };
 const finishSurveySession=async()=>{
  if(!overallSurveyProgress.complete){openNextSurveyIssue();return}
  await persist(docRef.current);setRoomPickerOpen(false);setQuickAddOpen(false);setMobileEditOpen(false);setFieldMode(false);
 };

 useEffect(()=>{setMobileEditOpen(false)},[selected?.kind,selected?.id]);
 const applyWallValue=(d,wallId,key,n)=>{
  const target=d.walls.find(w=>w.id===wallId);if(!target)return d;
  let nextTarget={...target},moveStart=null,moveEnd=null;
  if(key==="len"||key==="angle"){
   const L=key==="len"?n:len(target),A=(key==="angle"?n:angle(target))*Math.PI/180;
   moveEnd={from:{x:target.x2,y:target.y2},to:{x:target.x1+L*Math.cos(A),y:target.y1+L*Math.sin(A)}};
   nextTarget={...target,x2:moveEnd.to.x,y2:moveEnd.to.y};
  }else if(key==="x1"||key==="y1"){
   const dx=key==="x1"?n-target.x1:0,dy=key==="y1"?n-target.y1:0;
   moveStart={from:{x:target.x1,y:target.y1},to:{x:target.x1+dx,y:target.y1+dy}};
   moveEnd={from:{x:target.x2,y:target.y2},to:{x:target.x2+dx,y:target.y2+dy}};
   nextTarget={...target,x1:moveStart.to.x,y1:moveStart.to.y,x2:moveEnd.to.x,y2:moveEnd.to.y};
  }else nextTarget={...target,[key]:n};
  const walls=d.walls.map(w=>{if(w.id===target.id)return nextTarget;let out={...w};for(const change of [moveStart,moveEnd].filter(Boolean)){if(Math.hypot(w.x1-change.from.x,w.y1-change.from.y)<5){out.x1=change.to.x;out.y1=change.to.y}if(Math.hypot(w.x2-change.from.x,w.y2-change.from.y)<5){out.x2=change.to.x;out.y2=change.to.y}}return out});
  return {...d,walls,zones:syncLinkedZones(walls,d.zones),measurements:syncAnchoredMeasurements(walls,d.measurements),items:syncMounted(walls,d.items,d.zones)};
 };
 const updateWallById=(wallId,key,value)=>{
  let n=Number(value);if(!Number.isFinite(n))return;
  if(key==="len"&&(n<100||n>12000)){setMessage("Vegglengde må være 100–12000 mm");setTimeout(()=>setMessage(""),1800);return}
  if(key==="angle"){n=normalizeAngle(n);if(n==null)return}
  mutate(d=>applyWallValue(d,wallId,key,n))
 };
 const updateRoomWalls=(key,value)=>{
  let n=Number(value);if(!Number.isFinite(n)||!selectedZoneWalls.length)return;
  if(key==="t"&&(n<40||n>600)){setMessage("Veggtykkelse må være 40–600 mm");setTimeout(()=>setMessage(""),1800);return}
  if(key==="h"&&(n<300||n>6000)){setMessage("Vegghøyde må være 300–6000 mm");setTimeout(()=>setMessage(""),1800);return}
  const ids=new Set(selectedZoneWalls.map(w=>w.id));
  mutate(d=>({...d,walls:d.walls.map(w=>ids.has(w.id)?{...w,[key]:n}:w)}));
 };
 const updateWallItemById=(itemId,key,value)=>{
  const n=Number(value);if(!Number.isFinite(n))return;
  const item=doc.items.find(o=>o.id===itemId),wall=item?.wallId?doc.walls.find(w=>w.id===item.wallId):null;
  if(!item)return;
  if(!wall){mutate(d=>({...d,items:d.items.map(o=>o.id===itemId?{...o,[key]:n}:o)}));return}
  const current=wallEdgeOffsets(item,wall),width=key==="w"?n:Number(item.w)||0,maxGap=Math.max(0,current.L-width),startGap=key==="wallStartGap"?n:key==="wallEndGap"?current.L-n-width:current.start;
  if(width<100||width>12000){setMessage("Bredde må være 100–12000 mm");setTimeout(()=>setMessage(""),1800);return}
  if(width>current.L){setMessage("Åpningen kan ikke være bredere enn veggen");setTimeout(()=>setMessage(""),2000);return}
  if(startGap<0||startGap>maxGap){setMessage("Plasseringen går utenfor veggen");setTimeout(()=>setMessage(""),1800);return}
  if(openingTypes.has(item.type)&&openingCollision(wall,item.id,startGap,width)){setMessage("Åpningen overlapper en annen åpning");setTimeout(()=>setMessage(""),2200);return}
  mutate(d=>{
   const live=d.items.find(o=>o.id===itemId),liveWall=live?.wallId?d.walls.find(w=>w.id===live.wallId):null;if(!live||!liveWall)return d;
   const center=startGap+width/2,nextBase={...live,w:width,wallOffset:center},placed=mountedItemCenter(nextBase,liveWall,d.zones||[]);
   const updated={...nextBase,x:placed.cx-width/2,y:placed.cy-live.h/2,rot:placed.a*180/Math.PI,wallOffset:placed.off};
   return {...d,items:d.items.map(o=>o.id===itemId?updated:o)};
  });
 };
 const updateOpeningGapBefore=(itemId,value)=>{
  const gap=Number(value);if(!Number.isFinite(gap)||gap<0){setMessage("Mellomrom må være 0 mm eller mer");setTimeout(()=>setMessage(""),1600);return}
  const item=doc.items.find(o=>o.id===itemId),wall=item?.wallId?doc.walls.find(w=>w.id===item.wallId):null;if(!item||!wall)return;
  const layout=wallOpeningLayout(wall,doc.items),index=layout.rows.findIndex(row=>row.item.id===itemId);if(index<0)return;
  const previousEnd=index===0?0:layout.rows[index-1].gaps.start+Number(layout.rows[index-1].item.w||0);
  updateWallItemById(itemId,"wallStartGap",previousEnd+gap);
 };
 const update=(key,value)=>{
  const n=Number(value);
  if(!Number.isFinite(n))return;
  if(selected?.kind==="item"&&sel?.wallId&&(openingTypes.has(sel.type)||sel.type==="customwall")&&["w","wallStartGap","wallEndGap"].includes(key)){
   updateWallItemById(sel.id,key,n);
   return;
  }
  mutate(d=>{
   if(selected?.kind==="item"){
    return {...d,items:d.items.map(o=>{
     if(o.id!==selected.id)return o;
     if((key==="wallOffset"||key==="wallStartGap"||key==="wallEndGap")&&o.wallId){
      const w=d.walls.find(x=>x.id===o.wallId);if(!w)return o;
      const limits=mountedLimits(o,w),half=Math.max(0,Number(o.w)||0)/2;
      let desired=n;
      if(key==="wallStartGap")desired=n+half;
      if(key==="wallEndGap")desired=limits.L-n-half;
      const off=clamp(desired,limits.min,limits.max),a=Math.atan2(w.y2-w.y1,w.x2-w.x1),cx=w.x1+Math.cos(a)*off,cy=w.y1+Math.sin(a)*off;
      return {...o,x:cx-o.w/2,y:cy-o.h/2,rot:a*180/Math.PI,wallOffset:off};
     }
     const changed={...o,[key]:n};
     return wallTypes.has(o.type)?changed:constrainFreeItemStrict(changed,roomPlacementZones(d.zones,d.walls,d.defaultWallThickness),{fallbackItem:o,fallbackCenter:itemCenter(o),snapDistance:0});
    })};
   }
   return applyWallValue(d,selected?.id,key,n);
  });
 };
 const updateItemText=(key,value)=>{if(selected?.kind!=="item"||!sel)return;mutate(d=>({...d,items:d.items.map(o=>o.id===sel.id?{...o,[key]:String(value)}:o)}))};
 const remove=()=>{checkpoint();setFuture([]);setDoc(d=>selected?.kind==="wall"?(()=>{const walls=d.walls.filter(x=>x.id!==selected.id);return {...d,walls,zones:syncLinkedZones(walls,d.zones),measurements:syncAnchoredMeasurements(walls,d.measurements),items:d.items.map(o=>o.wallId===selected.id?{...o,wallId:null,wallOffset:null}:o)}})():selected?.kind==="zone"?{...d,zones:(d.zones||[]).filter(x=>x.id!==selected.id)}:selected?.kind==="measurement"?{...d,measurements:(d.measurements||[]).filter(x=>x.id!==selected.id)}:{...d,items:d.items.filter(x=>x.id!==selected.id)});setSelected(null)};
 const flipDoor=()=>{if(selected?.kind!=="item"||!sel||sel.type!=="door")return;mutate(d=>({...d,items:d.items.map(o=>o.id===sel.id?{...o,flip:!o.flip}:o)}))};
 const detach=()=>{if(selected?.kind!=="item"||!sel)return;mutate(d=>({...d,items:d.items.map(o=>o.id===sel.id?{...o,type:o.type==="customwall"?"customfloor":o.type,wallId:null,wallOffset:null}:o)}))};
 const duplicate=()=>{if(selected?.kind!=="item"||!sel)return;
  if(sel.wallId&&openingTypes.has(sel.type)){
   const wall=doc.walls.find(w=>w.id===sel.wallId);if(!wall)return;
   const current=wallEdgeOffsets(sel,wall),start=findOpeningStart(wall,Number(sel.w)||0,doc.items,null,current.start+Number(sel.w||0)+100);
   if(start==null){setMessage("Ikke ledig plass til kopi på veggen");setTimeout(()=>setMessage(""),2000);return}
   const id=uid(),a=Math.atan2(wall.y2-wall.y1,wall.x2-wall.x1),center=start+sel.w/2,cx=wall.x1+Math.cos(a)*center,cy=wall.y1+Math.sin(a)*center;
   mutate(d=>({...d,items:[...d.items,{...sel,id,x:cx-sel.w/2,y:cy-sel.h/2,wallOffset:center,rot:a*180/Math.PI}]}));setSelected({kind:"item",id});return;
  }
  mutate(d=>{const copy={...sel,id:uid(),x:sel.x+200,y:sel.y+200};return {...d,items:[...d.items,constrainFreeItemStrict(copy,roomPlacementZones(d.zones,d.walls,d.defaultWallThickness),{fallbackItem:{...sel,id:copy.id},fallbackCenter:itemCenter(sel),snapDistance:0})]}})
 };
 const applySizePreset=value=>{if(selected?.kind!=="item"||!sel||!value)return;const [w,h]=value.split("x").map(Number);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;
  if(sel.wallId&&openingTypes.has(sel.type)){updateWallItemById(sel.id,"w",w);return}
  mutate(d=>{const items=d.items.map(o=>{if(o.id!==sel.id)return o;const changed={...o,x:o.x+(o.w-w)/2,y:o.y+(o.h-h)/2,w,h};return o.wallId?changed:constrainFreeItemStrict(changed,roomPlacementZones(d.zones,d.walls,d.defaultWallThickness),{fallbackItem:o,fallbackCenter:itemCenter(o),snapDistance:0})});return {...d,items:syncMounted(d.walls,items,d.zones)}})
 };
 const applyWallPreset=value=>{if(selected?.kind!=="wall"||!sel||!value)return;const [t,h]=value.split("x").map(Number);if(!Number.isFinite(t)||!Number.isFinite(h)||t<=0||h<=0)return;mutate(d=>({...d,walls:d.walls.map(w=>w.id!==sel.id?w:{...w,t,h})}))};
 const finishZone=()=>{if(zoneDraft.length<3){setMessage("Romsonen trenger minst 3 punkter");setTimeout(()=>setMessage(""),1800);return}const zone={id:uid(),name:"Rom "+((doc.zones||[]).length+1),points:zoneDraft,ceilingHeight:Number(doc.defaultWallHeight)||2400,floorFinish:"",notes:""};mutate(d=>({...d,zones:[...(d.zones||[]),zone]}));setZoneDraft([]);setTool("select");setSelected({kind:"zone",id:zone.id})};
 const cancelZone=()=>{setZoneDraft([]);setTool("select")};
 const updateZoneField=(key,value,numeric=false)=>{if(selected?.kind!=="zone"||!sel)return;const next=numeric?Number(value):String(value);if(numeric&&!Number.isFinite(next))return;
  if(key==="ceilingHeight"&&numeric&&(next<300||next>6000)){setMessage("Takhøyde må være 300–6000 mm");setTimeout(()=>setMessage(""),1800);return}
  mutate(d=>{
   const zones=(d.zones||[]).map(z=>z.id===sel.id?{...z,[key]:next}:z);
   if(key==="ceilingHeight"&&Array.isArray(sel.wallIds)){const ids=new Set(sel.wallIds);return {...d,zones,walls:d.walls.map(w=>ids.has(w.id)?{...w,h:next}:w)}}
   return {...d,zones};
  })
 };
 const toggleSurveyedWall=wallId=>{if(selected?.kind!=="zone"||!sel)return;mutate(d=>({...d,zones:(d.zones||[]).map(z=>{if(z.id!==sel.id)return z;const current=new Set(z.surveyedWallIds||[]);if(current.has(wallId))current.delete(wallId);else current.add(wallId);return {...z,surveyedWallIds:[...current]}})}))};
 const completeRoomSurvey=()=>{
  if(selected?.kind!=="zone"||!sel)return;
  const state=zoneSurveyState(sel,doc.walls,doc.items);
  if(!state.ready){
   const reasons=[];if(!state.closed)reasons.push("romkonturen er ikke lukket");if(state.done<state.total)reasons.push((state.total-state.done)+" vegg(er) gjenstår");if(state.overlap)reasons.push("åpninger overlapper");
   setMessage("Kan ikke fullføre: "+reasons.join(", "));setTimeout(()=>setMessage(""),2800);return;
  }
  const completedAt=new Date().toISOString();
  mutate(d=>({...d,zones:(d.zones||[]).map(z=>z.id===sel.id?{...z,surveyCompletedAt:completedAt,surveySignature:zoneSurveySignature(z,d.walls,d.items)}:z)}));
  setMessage(state.stale?"Rom kontrollert og godkjent på nytt":"Rom markert ferdig");setTimeout(()=>setMessage(""),1800);
 };
 const reopenRoomSurvey=()=>{if(selected?.kind!=="zone"||!sel)return;mutate(d=>({...d,zones:(d.zones||[]).map(z=>z.id===sel.id?{...z,surveyCompletedAt:"",surveySignature:""}:z)}))};
 const nextSurveyRoom=()=>{
  if(selected?.kind!=="zone"||!(doc.zones||[]).length)return;
  const zones=doc.zones||[],start=Math.max(0,zones.findIndex(z=>z.id===sel.id)),ordered=[...zones.slice(start+1),...zones.slice(0,start+1)];
  const next=ordered.find(zone=>!zoneSurveyState(zone,doc.walls,doc.items).finished)||ordered[0];
  if(next)openRoomFromPicker(next);
 };

 const updateMeasurementField=(key,value)=>{if(selected?.kind!=="measurement"||!sel)return;mutate(d=>({...d,measurements:(d.measurements||[]).map(m=>m.id===sel.id?{...m,[key]:String(value)}:m)}))};
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
 const moveWallEnd=e=>{if(!wallDrag)return;const targetNow=doc.walls.find(w=>w.id===wallDrag.id);if(!targetNow)return;const origin=wallDrag.end===1?{x:targetNow.x1,y:targetNow.y1}:{x:targetNow.x2,y:targetNow.y2},p=point(e),magnet=magneticPoint(p,doc.walls,wallDrag.id,origin),q=magnet.point;setSnapHint(magnet.snapped?{...q,label:"Hjørne"}:null);setDoc(d=>{const target=d.walls.find(w=>w.id===wallDrag.id);if(!target)return d;const ox=wallDrag.end===1?target.x1:target.x2,oy=wallDrag.end===1?target.y1:target.y2;const walls=d.walls.map(w=>{let n={...w};if(w.id===wallDrag.id){if(wallDrag.end===1){n.x1=q.x;n.y1=q.y}else{n.x2=q.x;n.y2=q.y}}else{if(Math.hypot(w.x1-ox,w.y1-oy)<5){n.x1=q.x;n.y1=q.y}if(Math.hypot(w.x2-ox,w.y2-oy)<5){n.x2=q.x;n.y2=q.y}}return n});return {...d,walls,zones:syncLinkedZones(walls,d.zones),measurements:syncAnchoredMeasurements(walls,d.measurements),items:syncMounted(walls,d.items,d.zones)}})};
 const endWallDrag=()=>{if(!wallDrag)return;setSnapHint(null);setHistory(h=>[...h.slice(-24),wallDrag.start]);setFuture([]);setWallDrag(null)};
 const downZonePoint=(e,z,index)=>{e.stopPropagation();capturePointer(e);setTool("select");setSelected({kind:"zone",id:z.id});setZoneDrag({id:z.id,index,wallIds:Array.isArray(z.wallIds)?z.wallIds:null,start:JSON.stringify(doc)})};
 const moveZonePoint=e=>{if(!zoneDrag)return;const p=point(e),magnet=magneticPoint(p),q=magnet.point;setSnapHint(magnet.snapped?{...q,label:"Hjørne"}:null);setDoc(d=>{
  if(Array.isArray(zoneDrag.wallIds)&&zoneDrag.wallIds.length>=3){
   const ids=zoneDrag.wallIds,index=zoneDrag.index,currentId=ids[index],prevId=ids[(index-1+ids.length)%ids.length];
   const walls=d.walls.map(w=>w.id===currentId?{...w,x1:q.x,y1:q.y}:w.id===prevId?{...w,x2:q.x,y2:q.y}:w);
   return {...d,walls,zones:syncLinkedZones(walls,d.zones),measurements:syncAnchoredMeasurements(walls,d.measurements),items:syncMounted(walls,d.items,d.zones)};
  }
  return {...d,zones:(d.zones||[]).map(z=>z.id!==zoneDrag.id?z:{...z,points:z.points.map((pt,i)=>i===zoneDrag.index?q:pt)})};
 })};
 const endZoneDrag=()=>{if(!zoneDrag)return;setSnapHint(null);setHistory(h=>[...h.slice(-24),zoneDrag.start]);setFuture([]);setZoneDrag(null)};
 const downMeasurementEnd=(e,m,end)=>{e.stopPropagation();capturePointer(e);setTool("select");setSelected({kind:"measurement",id:m.id});setMeasureDrag({id:m.id,end,start:JSON.stringify(doc)})};
 const moveMeasurementEnd=e=>{if(!measureDrag)return;const p=point(e),magnet=magneticPoint(p),q=magnet.point;setSnapHint(magnet.snapped?{...q,label:"Hjørne"}:null);setDoc(d=>({...d,measurements:(d.measurements||[]).map(m=>m.id!==measureDrag.id?m:measureDrag.end===1?{...m,x1:q.x,y1:q.y,anchor1:magnet.anchor||null}:{...m,x2:q.x,y2:q.y,anchor2:magnet.anchor||null})}))};
 const endMeasurementDrag=()=>{if(!measureDrag)return;setSnapHint(null);setHistory(h=>[...h.slice(-24),measureDrag.start]);setFuture([]);setMeasureDrag(null)};
 const downItem=(e,o)=>{if(["wall","measure","zone"].includes(tool)){e.stopPropagation();drawingPointDown(e);return}e.stopPropagation();capturePointer(e);setTool("select");setSelected({kind:"item",id:o.id});const p=point(e);setDrag({id:o.id,dx:p.x-o.x,dy:p.y-o.y,start:JSON.stringify(doc),startCenter:itemCenter(o)})};
 const move=e=>{if(panning){movePan(e);return}if(wallDrag){moveWallEnd(e);return}if(zoneDrag){moveZonePoint(e);return}if(measureDrag){moveMeasurementEnd(e);return}if(!drag)return;const p=point(e);setDoc(d=>({...d,items:d.items.map(o=>{if(o.id!==drag.id)return o;const proposed={...o,x:snapTo(p.x-drag.dx,d.snapSize||50),y:snapTo(p.y-drag.dy,d.snapSize||50)};return wallTypes.has(o.type)?proposed:constrainFreeItemStrict(proposed,roomPlacementZones(d.zones,d.walls,d.defaultWallThickness),{fallbackItem:o,fallbackCenter:drag.startCenter,snapDistance:150})})}))};
 const up=e=>{if(e)releasePointer(e);if(panning){setPanning(null);return}if(wallDrag){endWallDrag();return}if(zoneDrag){endZoneDrag();return}if(measureDrag){endMeasurementDrag();return}if(!drag)return;setHistory(h=>[...h.slice(-24),drag.start]);setFuture([]);setDoc(d=>{const o=d.items.find(x=>x.id===drag.id);if(!o||!wallTypes.has(o.type))return d;const n=nearestWall({x:o.x+o.w/2,y:o.y+o.h/2},d.walls);if(!n||n.dist>450)return wallElectricalTypes.has(o.type)||o.type==="customwall"?JSON.parse(drag.start):{...d,items:d.items.map(x=>x.id!==o.id?x:{...x,wallId:null,wallOffset:null})};const a=Math.atan2(n.wall.y2-n.wall.y1,n.wall.x2-n.wall.x1)*180/Math.PI,limits=mountedLimits(o,n.wall),preferred=clamp(Math.round(n.t*limits.L)-o.w/2,0,Math.max(0,limits.L-o.w)),safeStart=openingTypes.has(o.type)?findOpeningStart(n.wall,o.w,d.items,o.id,preferred):preferred;if(safeStart==null)return JSON.parse(drag.start);const off=safeStart+o.w/2,base={...o,wallId:n.wall.id,wallOffset:off,rot:a},placed=mountedItemCenter(base,n.wall,d.zones||[]);return {...d,items:d.items.map(x=>x.id!==o.id?x:{...x,x:placed.cx-o.w/2,y:placed.cy-o.h/2,rot:placed.a*180/Math.PI,wallId:n.wall.id,wallOffset:placed.off})}});setDrag(null)};
 const applyCanvasPoint=p=>{
  setSelected(null);
  const magnet=tool==="wall"&&draft?wallMagneticPoint(p,draft):magneticPoint(p),q=magnet.point;
  setSnapHint(magnet.snapped?{...q,label:magnet.label||"Hjørne"}:null);
  if(tool==="zone"){setZoneDraft(points=>[...points,q]);setTimeout(()=>setSnapHint(null),350);return}
  if(tool==="measure"){if(!measureDraft)setMeasureDraft({...q,anchor:magnet.anchor||null});else{const id=uid();mutate(d=>({...d,measurements:[...(d.measurements||[]),{id,label:"",x1:measureDraft.x,y1:measureDraft.y,x2:q.x,y2:q.y,anchor1:measureDraft.anchor||null,anchor2:magnet.anchor||null}]}));setMeasureDraft(null);setTool("select");setSelected({kind:"measurement",id})}setTimeout(()=>setSnapHint(null),350);return}
  if(tool!=="wall")return;
  if(!draft){
   setDraft(q);setWallChain({start:q,count:0,points:[q],wallIds:[]});setTimeout(()=>setSnapHint(null),350);return;
  }
  const nextCount=(wallChain?.count||0)+1,closing=wallChain?.start&&nextCount>=3&&Math.hypot(q.x-wallChain.start.x,q.y-wallChain.start.y)<2;
  const chainPoints=[...(wallChain?.points||[draft]),q],zonePoints=closing?chainPoints.slice(0,-1):null,zoneId=closing?uid():null,wallId=uid();
  mutate(d=>{
   const wall={id:wallId,x1:draft.x,y1:draft.y,x2:q.x,y2:q.y,t:Number(d.defaultWallThickness)||98,h:Number(d.defaultWallHeight)||2400};
   if(!closing)return {...d,walls:[...d.walls,wall]};
   const wallIds=[...(wallChain?.wallIds||[]),wallId],zone={id:zoneId,name:"Rom "+((d.zones||[]).length+1),points:zonePoints,wallIds,ceilingHeight:Number(d.defaultWallHeight)||2400,floorFinish:"",notes:""};
   return {...d,walls:[...d.walls,wall],zones:[...(d.zones||[]),zone]};
  });
  if(closing){setDraft(null);setWallChain(null);setTool("select");setSnapHint(null);setSelected({kind:"zone",id:zoneId});setMessage("Rom lukket · areal beregnet");setTimeout(()=>setMessage(""),1800)}
  else{setDraft(q);setWallChain(chain=>({...chain,start:chain?.start||draft,count:nextCount,points:[...(chain?.points||[draft]),q],wallIds:[...(chain?.wallIds||[]),wallId]}));setTimeout(()=>setSnapHint(null),350)}
 };
 const drawingPointDown=e=>{
  capturePointer(e);
  const p=point(e);
  if(e.pointerType==="touch"&&["wall","zone","measure"].includes(tool)){
   clearPendingCanvasTouch();
   const x=p.x,y=p.y;
   pendingCanvasTouch.current=setTimeout(()=>{pendingCanvasTouch.current=null;if(!pinchGesture.current&&touchPointers.current.size<=1)applyCanvasPoint({x,y})},130);
   return;
  }
  applyCanvasPoint(p);
 };
 const canvasDown=e=>{
  if(e.target.dataset?.canvas!=="yes")return;
  if(tool==="pan"){startPan(e);return}
  if(tool==="select"){setSelected(null);return}
  drawingPointDown(e);
 };
 const summary=useMemo(()=>{
  const wallM=doc.walls.reduce((s,w)=>s+len(w),0)/1000,wallM2=doc.walls.reduce((s,w)=>s+len(w)*(w.h||2400),0)/1000000,deckM2=doc.items.filter(o=>o.type==="deck").reduce((s,o)=>s+o.w*o.h,0)/1000000,floorM2=closedWallAreaM2(doc.walls);
  const wallsById=new Map(doc.walls.map(w=>[w.id,w])),openingArea=o=>{const wall=wallsById.get(o.wallId),wallHeight=Number(wall?.h)||Number(doc.defaultWallHeight)||2400,openingHeight=Math.min(wallHeight,Number(o.openingHeight)||openingDefaults(o.type).openingHeight||0);return (Number(o.w)||0)*openingHeight/1000000};
  const openingM2=doc.items.filter(o=>o.wallId&&openingTypes.has(o.type)).reduce((s,o)=>s+openingArea(o),0),netWallM2=Math.max(0,wallM2-openingM2);
  const zoneRows=(doc.zones||[]).map(z=>{
   const area=polygonAreaM2(z.points),perimeter=polygonPerimeterM(z.points),height=(Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400)/1000,linkedWalls=(z.wallIds||[]).map(id=>wallsById.get(id)).filter(Boolean),linkedIds=new Set(linkedWalls.map(w=>w.id));
   const roomOpenings=linkedWalls.length?doc.items.filter(o=>linkedIds.has(o.wallId)&&openingTypes.has(o.type)):[];
   const grossWallArea=linkedWalls.length?linkedWalls.reduce((s,w)=>s+len(w)*(Number(w.h)||Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400),0)/1000000:perimeter*height;
   const roomOpeningM2=roomOpenings.reduce((s,o)=>s+openingArea(o),0),netRoomWallM2=Math.max(0,grossWallArea-roomOpeningM2);
   const floorBreakM=roomOpenings.filter(o=>["door","sliding","opening"].includes(o.type)).reduce((s,o)=>s+(Number(o.w)||0)/1000,0),netSkirtingM=Math.max(0,perimeter-floorBreakM);
   return {...z,area,perimeter,wallArea:grossWallArea,openingM2:roomOpeningM2,netWallM2:netRoomWallM2,netSkirtingM,openingCount:roomOpenings.length};
  });
  const zonedFloorM2=zoneRows.reduce((s,z)=>s+z.area,0),zonePerimeterM=zoneRows.reduce((s,z)=>s+z.perimeter,0),zoneWallM2=zoneRows.reduce((s,z)=>s+z.wallArea,0),zoneOpeningM2=zoneRows.reduce((s,z)=>s+z.openingM2,0),zoneNetWallM2=zoneRows.reduce((s,z)=>s+z.netWallM2,0),zoneNetSkirtingM=zoneRows.reduce((s,z)=>s+z.netSkirtingM,0);
  const count=t=>doc.items.filter(o=>o.type===t).length;
  const ledM=doc.items.filter(o=>o.type==="ledstrip").reduce((sum,o)=>sum+(Number(o.w)||0)/1000,0);
  return {wallM,wallM2,openingM2,netWallM2,deckM2,floorM2,zoneRows,zonedFloorM2,zonePerimeterM,zoneWallM2,zoneOpeningM2,zoneNetWallM2,zoneNetSkirtingM,objects:doc.items.length,electrical:doc.items.filter(o=>electricalTypes.has(o.type)).length,ledM,doors:count("door")+count("sliding"),windows:count("window"),posts:count("post")}
 },[doc]);
 const selectedOrder=orders.find(order=>order.id===doc.orderId);
 const selectedProject=projects.find(p=>p.id===doc.projectId);
 const projectLabel=selectedOrder
  ?[selectedOrder.orderNumber,selectedOrder.customerName].filter(Boolean).join(" · ")
  :selectedProject?.title
   ?selectedProject.title+" (eldre prosjektkobling)"
   :"Ikke koblet til oppdrag";
 const saveStatusText=()=>!online?"Offline · lagret på telefonen":saveState==="syncing"?"Synkroniserer…":saveState==="server"?"Synkronisert med oppdrag":lastSavedAt?"Lokalt lagret":"Autolagres lokalt";
 const clearMeasures=()=>mutate(d=>({...d,measurements:[]}));
 const importJson=e=>{const file=e.target.files?.[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(String(r.result));if(!Array.isArray(x.walls)||!Array.isArray(x.items))throw new Error();const next={...initial(),...x,id:uid(),name:(x.name||"Importert tegning")+" – kopi"};setDoc(next);setSelected(null);setHistory([]);setMessage("Importert – trykk Lagre")}catch{setMessage("Ugyldig Aadland-tegning");setTimeout(()=>setMessage(""),2600)}};r.readAsText(file);e.target.value=""};
 const deleteDoc=async()=>{
  if(deleteBusy)return;setDeleteBusy(true);
  try{
   if(doc.serverId){try{const r=await fetch("/api/admin/project-drawings",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:doc.serverId})});const x=await r.json();if(!r.ok&&!x.setupRequired){setMessage("Kunne ikke slette fra oppdraget");return}}catch{setMessage("Server utilgjengelig");return}}
   const list=docs.filter(x=>x.id!==doc.id),next=list[0]||initial();setDocs(list);docsRef.current=list;localStorage.setItem(STORE,JSON.stringify(list));localStorage.setItem(LAST_STORE,next.id);docRef.current=next;setDoc(next);setSelected(null);setHistory([]);setFuture([]);setDeleteConfirmOpen(false);setMessage("Tegning slettet");setTimeout(()=>setMessage(""),1600);
  }finally{setDeleteBusy(false)}
 };
 const exportJson=()=>{const blob=new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(doc.name||"tegning").replace(/[^a-z0-9æøå]+/gi,"-")+".json";a.click();URL.revokeObjectURL(a.href)};
 const quantityText=()=>{
  const lines=["Mengdegrunnlag fra tegning: "+(doc.name||"Tegning"),overallSurveyProgress.total?"Befaring: "+(overallSurveyProgress.complete?"ferdig":"ikke ferdig")+" · "+overallSurveyProgress.done+"/"+overallSurveyProgress.total+" rom godkjent":"",""];
  if(summary.zoneRows.length){for(const z of summary.zoneRows){
   lines.push((z.name||"Rom")+": "+z.area.toFixed(2)+" m² gulv/tak · "+z.perimeter.toFixed(2)+" lm brutto list · "+z.netSkirtingM.toFixed(2)+" lm netto list · "+z.wallArea.toFixed(2)+" m² brutto vegg · "+z.openingM2.toFixed(2)+" m² åpninger · "+z.netWallM2.toFixed(2)+" m² netto vegg"+(z.floorFinish?" · "+z.floorFinish:""));
   if(z.roomSurveyNotes)lines.push("  Befaringsnotat: "+z.roomSurveyNotes);
  }}else{lines.push("Gulvareal lukket rom: "+(summary.floorM2==null?"ikke beregnet":summary.floorM2.toFixed(2)+" m²"));lines.push("Netto veggflate: "+summary.netWallM2.toFixed(2)+" m²")}
  lines.push("Åpningsareal totalt: "+summary.openingM2.toFixed(2)+" m²","Dører/skyvedører: "+summary.doors+" · Vinduer: "+summary.windows);
  if(doc.notes)lines.push("","Tegningsnotat: "+doc.notes);
  return lines.filter(Boolean).join("\n")
 };
 const quoteLinesFromDrawing=()=>{const rows=[];if(summary.zoneRows.length){for(const z of summary.zoneRows){const name=z.name||"Rom",finish=z.floorFinish?" · "+z.floorFinish:"";rows.push({type:"other",description:"Gulvareal – "+name+finish,quantity:Number(z.area.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});rows.push({type:"other",description:"Takareal – "+name,quantity:Number(z.area.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});if(z.netSkirtingM>0)rows.push({type:"other",description:"Gulvlister, netto – "+name,quantity:Number(z.netSkirtingM.toFixed(2)),unit:"lm",unitPriceOre:"",vatRate:25});if(z.netWallM2>0)rows.push({type:"other",description:"Veggflate, netto – "+name,quantity:Number(z.netWallM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});}}else{if(summary.floorM2!=null&&summary.floorM2>0){rows.push({type:"other",description:"Gulvareal fra tegning",quantity:Number(summary.floorM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});rows.push({type:"other",description:"Takareal fra tegning",quantity:Number(summary.floorM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});}if(summary.netWallM2>0)rows.push({type:"other",description:"Netto veggflate fra tegning",quantity:Number(summary.netWallM2.toFixed(2)),unit:"m²",unitPriceOre:"",vatRate:25});}return rows};
 const launchQuoteFromDrawing=()=>{try{const lines=quoteLinesFromDrawing();sessionStorage.setItem("aadlandQuoteDraftFromDrawing",JSON.stringify({title:"Tilbud – "+(doc.name||"tegning"),customer:{name:doc.customer||"",address:doc.address||""},notes:quantityText(),lineItems:lines}));window.location.href="/admin/tilbud/ny"+(doc.orderId?"?orderId="+encodeURIComponent(doc.orderId):"")}catch{setMessage("Kunne ikke åpne tilbudskladd");setTimeout(()=>setMessage(""),1800)}};
 const newQuoteFromDrawing=()=>{if(overallSurveyProgress.total>0&&!overallSurveyProgress.complete){setQuoteWarningOpen(true);return}launchQuoteFromDrawing()};
 const openMaterialCalculator=()=>{
  const lines=[
   "Tegning: "+(doc.name||"Tegning"),
   doc.customer?"Kunde: "+doc.customer:"",
   doc.address?"Adresse: "+doc.address:"",
   overallSurveyProgress.total?"Befaring: "+(overallSurveyProgress.complete?"ferdig":"ikke ferdig")+" · "+overallSurveyProgress.done+"/"+overallSurveyProgress.total+" rom godkjent":"",
   ""
  ];
  if(summary.zoneRows.length){
   for(const z of summary.zoneRows){
    lines.push((z.name||"Rom")+": "+z.area.toFixed(2)+" m² gulv/tak, "+z.perimeter.toFixed(2)+" lm omkrets, "+(Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400)+" mm takhøyde, "+z.netSkirtingM.toFixed(2)+" lm netto gulvlist, "+z.netWallM2.toFixed(2)+" m² netto veggflate, "+z.openingM2.toFixed(2)+" m² åpninger.");
    if(z.floorFinish)lines.push("Overflate/gulv: "+z.floorFinish+".");
    if(z.roomSurveyNotes)lines.push("Befaringsnotat: "+z.roomSurveyNotes);
   }
  }
  if(doc.notes)lines.push("","Tegningsnotat: "+doc.notes);
  const hasZones=summary.zoneRows.length>0;
  const basis={
   wallNetM2:Number((hasZones?summary.zoneNetWallM2:summary.netWallM2).toFixed(3)),
   wallGrossM2:Number((hasZones?summary.zoneWallM2:summary.wallM2).toFixed(3)),
   floorM2:Number(((hasZones?summary.zonedFloorM2:summary.floorM2)||0).toFixed(3)),
   ceilingM2:Number(((hasZones?summary.zonedFloorM2:summary.floorM2)||0).toFixed(3)),
   skirtingNetM:Number((hasZones?summary.zoneNetSkirtingM:summary.wallM).toFixed(3)),
   perimeterM:Number((hasZones?summary.zonePerimeterM:summary.wallM).toFixed(3)),
   wallLengthM:Number(summary.wallM.toFixed(3)),
   wallCount:doc.walls.length,
   roomCount:(doc.zones||[]).length
  };
  const rooms=summary.zoneRows.map(z=>{
   const ids=new Set(z.wallIds||[]),roomWalls=doc.walls.filter(w=>ids.has(w.id)),wallLengthM=roomWalls.reduce((sum,w)=>sum+len(w),0)/1000;
   return {id:z.id,name:z.name||"Rom",basis:{
    wallNetM2:Number(z.netWallM2.toFixed(3)),wallGrossM2:Number(z.wallArea.toFixed(3)),
    floorM2:Number(z.area.toFixed(3)),ceilingM2:Number(z.area.toFixed(3)),
    skirtingNetM:Number(z.netSkirtingM.toFixed(3)),perimeterM:Number(z.perimeter.toFixed(3)),
    wallLengthM:Number(wallLengthM.toFixed(3)),wallCount:roomWalls.length,roomCount:1
   }}
  });
  try{
   sessionStorage.setItem("aadlandMaterialCalcFromDrawing",JSON.stringify({project:doc.name||"",facts:lines.filter(Boolean).join("\n"),basis,rooms}));
   window.location.href="/admin/material-ai"
  }catch{setMessage("Kunne ikke åpne materialkalkulator");setTimeout(()=>setMessage(""),1800)}
 };
 const drawingBounds=()=>{const xs=[],ys=[];for(const w of doc.walls){xs.push(w.x1,w.x2);ys.push(w.y1,w.y2)}for(const o of doc.items){xs.push(o.x,o.x+o.w);ys.push(o.y,o.y+o.h)}for(const z of doc.zones||[]){for(const p of z.points||[]){xs.push(p.x);ys.push(p.y)}}if(!xs.length)return{x:0,y:0,w:VIEW,h:VIEW};const pad=350,minX=Math.max(0,Math.min(...xs)-pad),minY=Math.max(0,Math.min(...ys)-pad),maxX=Math.min(VIEW,Math.max(...xs)+pad),maxY=Math.min(VIEW,Math.max(...ys)+pad);return{x:minX,y:minY,w:Math.max(500,maxX-minX),h:Math.max(500,maxY-minY)}};
 const runPrint=()=>{
  printSelectionRef.current=selected;setSelected(null);setPrintMode(true);
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
 };
 const printBounds=printMode?drawingBounds():null;

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
    if(wallElectricalTypes.has(o.type))extra.push("monteringshøyde "+Math.round(Number(o.mountHeight)||0)+" mm");
    if(ceilingElectricalTypes.has(o.type))extra.push("takpunkt "+itemCeilingHeight(o,doc)+" mm");
    if(electricalTypes.has(o.type)&&o.circuit)extra.push("kurs/gruppe "+o.circuit);
    if(electricalTypes.has(o.type)&&o.itemNote)extra.push("EL-notat: "+o.itemNote);
    if(!electricalTypes.has(o.type)&&!openingTypes.has(o.type)){extra.push("3D-høyde "+modelHeight(o)+" mm");if(Number(o.elevation)>0)extra.push("høyde over gulv "+Math.round(Number(o.elevation))+" mm")}
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
 return <main className={styles.shell+(fieldMode?" "+styles.fieldMode:"")+(focusView?" "+styles.focusView:"")}>
  <header className={styles.top}><Link href="/admin">← Backoffice</Link><strong>Tegning & visualisering</strong><input className={styles.name} value={doc.name} onChange={e=>setDoc(d=>({...d,name:e.target.value}))}/><span className={styles.saved}>{message||saveStatusText()}</span>{overallSurveyProgress.total>0&&<button type="button" className={overallSurveyProgress.complete?styles.surveyBadgeDone:overallSurveyProgress.stale?styles.surveyBadgeStale:styles.surveyBadge} onClick={()=>{const zones=doc.zones||[],target=zones.find(zone=>!zoneSurveyState(zone,doc.walls,doc.items).finished)||zones[0];if(target){setSelected({kind:"zone",id:target.id});setTimeout(()=>scrollPanel(rightPanel),0)}}}>{overallSurveyProgress.complete?"✓ Befaring ferdig":"Befaring "+overallSurveyProgress.done+"/"+overallSurveyProgress.total+(overallSurveyProgress.stale?" · sjekk "+overallSurveyProgress.stale:"")}</button>}<button className={styles.btn} onClick={()=>persist()}>Lagre på oppdrag</button><button className={styles.btn} onClick={undo} disabled={!history.length}>Angre</button><button className={styles.btn} onClick={redo} disabled={!future.length}>Gjør om</button><button className={styles.btn} onClick={()=>zoomBy(-.25)}>−</button><span className={styles.zoom}>{Math.round((doc.zoom||1)*100)}%</span><button className={styles.btn} onClick={()=>zoomBy(.25)}>+</button><details className={styles.moreMenu}><summary aria-label="Flere verktøy" title="Flere verktøy">☰</summary><div className={styles.moreMenuPanel} onClick={e=>{if(e.target.closest("button"))e.currentTarget.parentElement.open=false}}><button className={styles.btn} onClick={fitView}>◎ Sentrer alt</button><button className={focusView?styles.activeBtn:styles.btn} onClick={()=>{setFocusView(value=>!value);setTimeout(fitView,60)}}>{focusView?"Vis paneler":"Fokus tegning"}</button><button className={tool==="pan"?styles.activeBtn:styles.btn} onClick={()=>{setTool(tool==="pan"?"select":"pan");setDraft(null);setMeasureDraft(null)}}>Flytt visning</button><button className={elPlan?styles.activeBtn:styles.btn} onClick={()=>setElPlan(value=>!value)}>EL-tegning</button><button className={styles.btn} onClick={()=>setShow3D(true)}>3D-visning</button><button className={styles.btn} onClick={()=>openWallView()}>Veggvisning</button><button className={styles.btn} onClick={()=>openFurnitureBuilder(selected?.kind==="wall"?selected.id:null)}>Bygg møbel</button><button className={styles.btn} onClick={runPrint}>PDF / rapport</button><button className={styles.btn} onClick={openMaterialCalculator}>Materialkalkulator</button><button className={styles.btn} onClick={newQuoteFromDrawing}>Nytt tilbud fra tegning</button></div></details></header>
  <nav className={styles.mobileTools} aria-label="Tegneverktøy mobil">
   <button type="button" className={tool==="select"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("select");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Velg</button>
   <button type="button" className={tool==="wall"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("wall");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Vegg</button>
   <button type="button" className={tool==="pan"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("pan");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Flytt</button>
   <button type="button" className={tool==="measure"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("measure");setDraft(null);setWallChain(null);setSnapHint(null);setZoneDraft([]);setMeasureDraft(null)}}>Mål</button>
   <button type="button" className={tool==="zone"?styles.mobileActive:styles.mobileTool} onClick={()=>{setTool("zone");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Romsone</button>
   <button type="button" className={quickAddOpen?styles.mobileActive:styles.mobileTool} onClick={()=>{setMobileEditOpen(false);setRoomPickerOpen(false);setQuickAddOpen(value=>!value)}}>+ Legg til</button><button type="button" className={roomPickerOpen?styles.mobileActive:overallSurveyProgress.complete?styles.mobileSurveyDone:styles.mobileTool} onClick={()=>{setMobileEditOpen(false);setQuickAddOpen(false);setRoomPickerOpen(value=>!value)}}>{overallSurveyProgress.total?overallSurveyProgress.complete?"✓ Rom":"Rom "+overallSurveyProgress.done+"/"+overallSurveyProgress.total:"Rom"}</button><button type="button" className={fieldMode?styles.mobileActive:styles.mobileTool} onClick={()=>{if(fieldMode)persist(docRef.current);setFieldMode(value=>!value);setQuickAddOpen(false);setRoomPickerOpen(false);setMobileEditOpen(false)}}>{fieldMode?"Avslutt befaring":"Befaring"}</button>
   {(draft||measureDraft||zoneDraft.length>0)&&<button type="button" className={styles.mobileDone} onClick={()=>{if(tool==="zone"&&zoneDraft.length>=3)finishZone();else{setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([]);setTool("select")}}}>{tool==="zone"&&zoneDraft.length>=3?"Lukk sone":"Ferdig"}</button>}
   <button type="button" className={elPlan?styles.mobileActive:styles.mobileTool} onClick={()=>setElPlan(value=>!value)}>EL</button><button type="button" className={styles.mobileTool} onClick={()=>setShow3D(true)}>3D</button><button type="button" className={styles.mobileTool} onClick={()=>openWallView()}>Veggvisning</button><button type="button" className={styles.mobileTool} onClick={()=>openFurnitureBuilder(selected?.kind==="wall"?selected.id:null)}>Møbel</button><button type="button" className={focusView?styles.mobileActive:styles.mobileTool} onClick={()=>{setFocusView(value=>!value);setTimeout(fitView,60)}}>Fokus</button><span className={styles.mobileDivider}/>
   <button type="button" className={styles.mobileTool} onClick={undo} disabled={!history.length}>↶</button>
   <button type="button" className={styles.mobileTool} onClick={redo} disabled={!future.length}>↷</button>
   <button type="button" className={styles.mobileTool} onClick={()=>zoomBy(-.25)}>−</button>
   <span className={styles.mobileZoom}>{Math.round((doc.zoom||1)*100)}%</span>
   <button type="button" className={styles.mobileTool} onClick={()=>zoomBy(.25)}>+</button>
   <button type="button" className={styles.mobileTool} onClick={fitView}>Sentrer alt</button>
   <span className={styles.mobileDivider}/>
   <button type="button" className={styles.mobileTool} onClick={()=>scrollPanel(leftPanel)}>Objekter</button>
   <button type="button" className={styles.mobileTool} onClick={()=>scrollPanel(rightPanel)}>Egenskaper</button>
   <button type="button" className={styles.mobileTool} onClick={runPrint}>Rapport/PDF</button>
   <button type="button" className={styles.mobileTool} onClick={openMaterialCalculator}>Materialkalkulator</button>
   <span className={styles.mobileSyncStatus} data-state={online?saveState:"offline"}>{!online?"Offline":saveState==="syncing"?"Synk…":saveState==="server"?"Synket":"Lokalt"}</span>
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
   <button type="button" onClick={()=>addItem("ceilinglight",180,180)}>⊗ Lyspunkt tak</button>
   <button type="button" onClick={()=>addItem("downlight",120,120)}>⊙ Downlight</button>
   <button type="button" onClick={()=>addItem("ledstrip",2000,50)}>━ LED-stripe tak</button>
   <button type="button" onClick={()=>addItem("walllight",180,100)}>◐ Lyspunkt vegg</button>
   <button type="button" onClick={()=>addItem("outlet",180,100)}>◫ Stikk</button>
   <button type="button" onClick={()=>addItem("doubleoutlet",220,100)}>▣ Dobbel stikk</button>
   <button type="button" onClick={()=>addItem("switch",120,100)}>S Bryter</button>
   <button type="button" onClick={()=>addItem("dimmer",120,100)}>D Dimmer</button>
   <button type="button" onClick={()=>openFurnitureBuilder(selected?.kind==="wall"?selected.id:null)}>▦ Bygg eget møbel</button>
  </div>}
  {roomPickerOpen&&<div className={styles.mobileRoomPicker}>
   <div className={styles.mobileRoomPickerHead}><div><strong>Befaringsstatus</strong><small>{overallSurveyProgress.done}/{overallSurveyProgress.total} rom ferdig{overallSurveyProgress.stale?" · "+overallSurveyProgress.stale+" må sjekkes":""}</small></div><div><button type="button" onClick={()=>{setRoomPickerOpen(false);makeRoom()}}>+ Rom</button><button type="button" onClick={()=>{setRoomPickerOpen(false);makeLRoom()}}>+ L-rom</button></div></div>
   {overallSurveyProgress.total>0&&<div className={overallSurveyProgress.complete?styles.mobileSurveyAllDone:styles.mobileSurveySummary}><div><span>{overallSurveyProgress.complete?"✓ Hele befaringen er ferdig":overallSurveyProgress.remaining+" rom gjenstår"}</span><strong>{overallSurveyProgress.complete?"Alle rom er kontrollert":"Neste rom åpnes direkte for kontroll"}</strong></div><button type="button" className={overallSurveyProgress.complete?styles.mobileSurveyFinish:styles.mobileSurveyNext} onClick={overallSurveyProgress.complete?finishSurveySession:openNextSurveyIssue}>{overallSurveyProgress.complete?"Lagre og avslutt":"Åpne neste →"}</button></div>}
   {(doc.zones||[]).length? <div className={styles.mobileRoomPickerList}>{(doc.zones||[]).map(zone=>{const state=zoneSurveyState(zone,doc.walls,doc.items),active=selected?.kind==="zone"&&selected.id===zone.id,status=state.finished?"✓ Ferdig":state.stale?"↻ Må sjekkes":"Gjenstår";return <button type="button" key={zone.id} className={active?styles.mobileRoomPickerActive:styles.mobileRoomPickerItem} onClick={()=>openRoomFromPicker(zone)}><span><b>{zone.name||"Rom"}</b><small>{polygonAreaM2(zone.points).toFixed(2)} m² · {state.linked?state.done+"/"+state.total+" målt":"fri sone"}<br/>{zoneSurveyStatusText(state)}</small></span><strong className={state.finished?styles.mobileRoomDone:state.stale?styles.mobileRoomStale:styles.mobileRoomPending}>{status}</strong></button>})}</div>:<p className={styles.mobileRoomPickerEmpty}>Ingen rom ennå. Opprett et rektangulært rom, L-rom eller tegn en lukket veggkontur.</p>}
  </div>}
  {sel&&!quickAddOpen&&!roomPickerOpen&&<div className={styles.mobileSelection}>
   <div><span>VALGT</span><strong>{selected.kind==="wall"?"Vegg · "+len(sel)+" mm · "+angle(sel)+"°":selected.kind==="zone"?(sel.name||"Romsone")+" · "+polygonAreaM2(sel.points).toFixed(2)+" m²":selected.kind==="measurement"?(sel.label?sel.label+" · ":"Mål · ")+Math.round(Math.hypot(sel.x2-sel.x1,sel.y2-sel.y1))+" mm":labelFor(sel.type)+" · "+Math.round(sel.w)+" × "+Math.round(sel.h)+" mm"}</strong></div>
   <button type="button" onClick={()=>setMobileEditOpen(value=>!value)}>{mobileEditOpen?"Lukk":"Rediger mål"}</button>
  </div>}
  {sel&&!quickAddOpen&&!roomPickerOpen&&mobileEditOpen&&<div className={styles.mobileInspector}>
   {selected.kind==="wall"?<>
    <label>Lengde (mm)<input key={"ml-"+sel.id+"-"+len(sel)} type="number" inputMode="numeric" defaultValue={len(sel)} onBlur={e=>update("len",e.target.value)}/></label>
    <label>Vinkel (°)<input key={"ma-"+sel.id+"-"+angle(sel)} type="number" inputMode="decimal" defaultValue={angle(sel)} onBlur={e=>update("angle",e.target.value)}/></label>
    <label>Høyde (mm)<input key={"mh-"+sel.id+"-"+sel.h} type="number" inputMode="numeric" defaultValue={Math.round(sel.h||2400)} onBlur={e=>update("h",e.target.value)}/></label>
    <label>Tykkelse (mm)<input key={"mt-"+sel.id+"-"+sel.t} type="number" inputMode="numeric" defaultValue={Math.round(sel.t||98)} onBlur={e=>update("t",e.target.value)}/></label>
    <div className={styles.mobileAngles}>{[0,90,180,270].map(value=><button type="button" key={value} onClick={()=>update("angle",value)}>{value}°</button>)}</div>
   </>:selected.kind==="zone"?<>
    <label>Romnavn<input key={"zn-"+sel.id+"-"+sel.name} defaultValue={sel.name||""} onBlur={e=>updateZoneField("name",e.target.value)}/></label>
    <label>Takhøyde (mm)<input key={"zh-"+sel.id+"-"+sel.ceilingHeight} type="number" inputMode="numeric" defaultValue={Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400} onBlur={e=>updateZoneField("ceilingHeight",e.target.value,true)}/></label>
    <div className={styles.mobileRoomMetrics}>
     <span><small>Gulv/tak</small><strong>{polygonAreaM2(sel.points).toFixed(2)} m²</strong></span>
     <span><small>Omkrets</small><strong>{polygonPerimeterM(sel.points).toFixed(2)} m</strong></span>
     {selectedRoomQuantity&&<><span><small>Netto list</small><strong>{selectedRoomQuantity.netSkirtingM.toFixed(2)} lm</strong></span><span><small>Brutto vegg</small><strong>{selectedRoomQuantity.grossWallM2.toFixed(2)} m²</strong></span><span><small>Åpninger</small><strong>{selectedRoomQuantity.openingM2.toFixed(2)} m²</strong></span><span><small>Netto vegg</small><strong>{selectedRoomQuantity.netWallM2.toFixed(2)} m²</strong></span></>}
     <span className={selectedRoomDiagnostics.closed?styles.metricOk:styles.metricWarn}><small>Geometri</small><strong>{selectedRoomDiagnostics.closed?"Lukket":"Åpen "+selectedRoomDiagnostics.maxGap+" mm"}</strong></span>
     <span className={selectedSurveyProgress.complete?styles.metricOk:""}><small>Befaring</small><strong>{selectedSurveyProgress.done}/{selectedSurveyProgress.total} vegger målt</strong></span>
     {selectedRoomDiagnostics.diagonals.length===2&&<span><small>Diagonaler</small><strong>{selectedRoomDiagnostics.diagonals[0]} / {selectedRoomDiagnostics.diagonals[1]} mm</strong></span>}
    </div>
    {selectedZoneWalls.length>0&&<div className={styles.mobileRoomConstruction}>
     <label><span>Vegghøyde mm</span><input type="number" inputMode="numeric" min="300" max="6000" defaultValue={Math.round(selectedZoneWalls[0]?.h||sel.ceilingHeight||2400)} onBlur={e=>updateZoneField("ceilingHeight",e.target.value,true)}/></label>
     <label><span>Veggtykkelse mm</span><input type="number" inputMode="numeric" min="40" max="600" defaultValue={Math.round(selectedZoneWalls[0]?.t||98)} onBlur={e=>updateRoomWalls("t",e.target.value)}/></label>
     <div className={styles.mobileCornerAngles}><strong>Hjørnevinkler</strong>{selectedRoomDiagnostics.corners.map((value,index)=><span key={index}><b>{index+1}</b>{value}°</span>)}</div>
    </div>}
    <div className={styles.mobileRoomSurveyCard} data-ready={selectedSurveyState.ready?"true":"false"} data-stale={selectedSurveyState.stale?"true":"false"}>
     <div><strong>{selectedSurveyState.finished?"✓ Rom ferdig":selectedSurveyState.stale?"↻ Rommet må kontrolleres igjen":selectedSurveyState.ready?"Klar for fullføring":"Befaring pågår"}</strong><small>{selectedSurveyState.finished?"Ingen relevante mål er endret etter siste godkjenning.":selectedSurveyState.stale&&selectedSurveyState.ready?"Mål eller åpninger er endret etter at rommet ble godkjent. Kontroller og fullfør rommet på nytt.":selectedSurveyState.ready?(selectedSurveyState.total?"Alle vegger er målt, geometrien er lukket og åpningene er gyldige.":"Romsonen er klar for fullføring.") :zoneSurveyStatusText(selectedSurveyState)}</small></div>
     <label>Romnotat<textarea key={"rn-"+sel.id+"-"+(sel.roomSurveyNotes||"")} defaultValue={sel.roomSurveyNotes||""} placeholder="F.eks. skjev vegg, fuktmerke, kundeønske, rivearbeid…" onBlur={e=>updateZoneField("roomSurveyNotes",e.target.value)}/></label>
     <div className={styles.mobileRoomSurveyActions}>{selectedSurveyState.finished?<button type="button" onClick={reopenRoomSurvey}>Åpne rom igjen</button>:<button type="button" className={styles.mobileRoomComplete} disabled={!selectedSurveyState.ready} onClick={completeRoomSurvey}>{selectedSurveyState.stale?"✓ Godkjenn på nytt":"✓ Fullfør rom"}</button>}<button type="button" onClick={nextSurveyRoom}>Neste rom →</button></div>
    </div>
    {selectedRoomDiagnostics.diagonals.length===2&&<div className={styles.mobileDiagonalCheck}>
     <div className={styles.mobileDiagonalHead}><strong>Diagonalkontroll</strong><small>Mål hjørne til hjørne i rommet</small></div>
     {[0,1].map(index=>{const key=index===0?"diagonal1Measured":"diagonal2Measured",measured=Number(sel[key]),calculated=selectedRoomDiagnostics.diagonals[index],has=Number.isFinite(measured)&&measured>0,diff=has?Math.round(measured-calculated):null;return <label key={key}><span>Diagonal {index===0?"A":"B"} · beregnet {calculated} mm</span><input type="number" inputMode="numeric" min="100" placeholder={String(calculated)} defaultValue={has?Math.round(measured):""} onBlur={e=>updateZoneField(key,e.target.value,true)}/>{has&&<small className={Math.abs(diff)<=20?styles.diagOk:styles.diagWarn}>{diff===0?"Treffer nøyaktig":(diff>0?"+":"")+diff+" mm avvik"}</small>}</label>})}
    </div>}
    {selectedZoneWalls.length>0&&<div className={styles.mobileRoomWalls}>
     <div className={styles.mobileRoomWallsHead}><div><strong>Veggmål</strong><small>Mål rundt rommet i rekkefølge</small></div><span>{selectedZoneWalls.length} vegger</span></div>
     {selectedZoneWalls.map((wall,index)=><div className={styles.mobileRoomWallRow} key={wall.id}>
      <button type="button" className={styles.mobileWallSelect} onClick={()=>{setSelected({kind:"wall",id:wall.id});setMobileEditOpen(false)}}><b>{index+1}</b><span>Vegg {index+1}<small>{angle(wall)}° · hjørne {selectedRoomDiagnostics.corners[index]??"–"}°</small></span></button>
      <label><span>Lengde mm</span><input key={"zw-"+wall.id+"-"+len(wall)} type="number" inputMode="numeric" min="100" max="12000" defaultValue={len(wall)} onBlur={e=>updateWallById(wall.id,"len",e.target.value)}/></label>
      <label className={styles.mobileWallAngle}><span>Retning °</span><input key={"za-"+wall.id+"-"+angle(wall)} type="number" inputMode="decimal" step="0.1" defaultValue={angle(wall)} onBlur={e=>updateWallById(wall.id,"angle",e.target.value)}/></label>
      <div className={styles.mobileWallAnglePresets}>{[0,45,90,135,180,225,270,315].map(value=><button type="button" key={value} onClick={()=>updateWallById(wall.id,"angle",value)}>{value}°</button>)}</div>
      <div className={styles.mobileWallMeta}><span>H {Math.round(Number(wall.h)||0)} mm</span><span>T {Math.round(Number(wall.t)||0)} mm</span><span>Hjørne {selectedRoomDiagnostics.corners[index]??"–"}°</span><button type="button" className={(sel.surveyedWallIds||[]).includes(wall.id)?styles.mobileWallChecked:styles.mobileWallCheck} onClick={()=>toggleSurveyedWall(wall.id)}>{(sel.surveyedWallIds||[]).includes(wall.id)?"✓ Målt":"○ Ikke målt"}</button></div>
      <div className={styles.mobileWallOpenings}><button type="button" onClick={()=>addItemToWall("door",900,100,wall.id,sel.id)}>+ Dør</button><button type="button" onClick={()=>addItemToWall("window",1200,100,wall.id,sel.id)}>+ Vindu</button><button type="button" onClick={()=>addItemToWall("opening",1000,100,wall.id,sel.id)}>+ Åpning</button></div>
      {(()=>{const layout=wallOpeningLayout(wall,doc.items);return layout.rows.length>0?<><div className={styles.mobileWallChain} data-overlap={layout.overlap?"true":"false"}><strong>Målkjede</strong><div>{layout.parts.map((part,i)=><span key={part.item.id}>{part.gap>0&&<em>{part.gap}</em>}<b>{labelFor(part.item.type)} {Math.round(part.item.w)}</b></span>)}{layout.endGap>0&&<em>{layout.endGap}</em>}</div>{layout.overlap&&<small>⚠ Åpninger overlapper – korriger plasseringen.</small>}</div><div className={styles.mobileExistingOpenings}>{layout.parts.map((part,index)=>{const {item,gaps}=part;return <div className={styles.mobileOpeningCard} key={item.id}><button type="button" className={styles.mobileOpeningTitle} onClick={()=>{setFieldReturnZoneId(sel.id);setSelected({kind:"item",id:item.id});setTimeout(()=>setMobileEditOpen(true),0)}}><span>{labelFor(item.type)}</span><b>Rediger</b></button><label><span>Bredde</span><input key={"ow-"+item.id+"-"+item.w} type="number" inputMode="numeric" min="100" max={gaps.L} defaultValue={Math.round(item.w)} onBlur={e=>updateWallItemById(item.id,"w",e.target.value)}/></label><label><span>{index===0?"Fra hjørne":"Fra forrige"}</span><input key={"og-"+item.id+"-"+part.gap} type="number" inputMode="numeric" min="0" defaultValue={part.gap} onBlur={e=>updateOpeningGapBefore(item.id,e.target.value)}/></label><small>Fra start: {gaps.start} mm · Til slutt: {gaps.end} mm</small></div>})}</div></>:null})()}
     </div>)}
     <p>Nummer og pil i tegningen viser måleretningen. «Fra start» måles fra hjørnet bak pilen. Endring av en vegg flytter neste hjørne; kontroller siste vegg når hele rommet er målt.</p>
    </div>}
   </>:selected.kind==="measurement"?<>
    <label className={styles.mobileWide}>Navn på mål<input key={"mn-"+sel.id+"-"+sel.label} defaultValue={sel.label||""} placeholder="F.eks. vegg til vindu" onBlur={e=>updateMeasurementField("label",e.target.value)}/></label>
    <div className={styles.mobileMeasureReadout}><span>Målt avstand</span><strong>{Math.round(Math.hypot(sel.x2-sel.x1,sel.y2-sel.y1))} mm</strong></div>
   </>:<>
    <label>Bredde (mm)<input key={"iw-"+sel.id+"-"+sel.w} type="number" inputMode="numeric" defaultValue={Math.round(sel.w)} onBlur={e=>update("w",e.target.value)}/></label>
    <label>Dybde/lengde (mm)<input key={"ih-"+sel.id+"-"+sel.h} type="number" inputMode="numeric" defaultValue={Math.round(sel.h)} onBlur={e=>update("h",e.target.value)}/></label>
    <label>Rotasjon (°)<input key={"ir-"+sel.id+"-"+sel.rot} type="number" inputMode="decimal" defaultValue={Math.round(Number(sel.rot)||0)} onBlur={e=>update("rot",e.target.value)}/></label>
    {sel.wallId&&doc.walls.find(w=>w.id===sel.wallId)&&(()=>{const wall=doc.walls.find(w=>w.id===sel.wallId),gaps=wallEdgeOffsets(sel,wall);return <><label>Fra veggstart (mm)<input key={"igs-"+sel.id+"-"+gaps.start} type="number" inputMode="numeric" min="0" max={Math.max(0,gaps.L-sel.w)} defaultValue={gaps.start} onBlur={e=>update("wallStartGap",e.target.value)}/></label><label>Til veggslutt (mm)<input key={"ige-"+sel.id+"-"+gaps.end} type="number" inputMode="numeric" min="0" max={Math.max(0,gaps.L-sel.w)} defaultValue={gaps.end} onBlur={e=>update("wallEndGap",e.target.value)}/></label></>})()}
    {openingTypes.has(sel.type)&&<label>{sel.type==="window"?"Vindushøyde (mm)":"Åpningshøyde (mm)"}<input key={"io-"+sel.id+"-"+sel.openingHeight} type="number" inputMode="numeric" defaultValue={Math.round(Number(sel.openingHeight)||openingDefaults(sel.type).openingHeight||2100)} onBlur={e=>update("openingHeight",e.target.value)}/></label>}
    {sel.type==="window"&&<label>Brystning (mm)<input key={"is-"+sel.id+"-"+sel.sillHeight} type="number" inputMode="numeric" defaultValue={Math.round(Number(sel.sillHeight)||0)} onBlur={e=>update("sillHeight",e.target.value)}/></label>}
    {wallElectricalTypes.has(sel.type)&&<label>Monteringshøyde (mm)<input key={"imh-"+sel.id+"-"+sel.mountHeight} type="number" inputMode="numeric" min="0" max="5000" defaultValue={Math.round(Number(sel.mountHeight)||0)} onBlur={e=>update("mountHeight",e.target.value)}/></label>}
    {ceilingElectricalTypes.has(sel.type)&&<div className={styles.mobileMeasureReadout}><span>Plassering</span><strong>Tak · {itemCeilingHeight(sel,doc)} mm</strong></div>}
    {electricalTypes.has(sel.type)&&<><label>Kurs / gruppe<input key={"ic-"+sel.id+"-"+(sel.circuit||"")} defaultValue={sel.circuit||""} placeholder="F.eks. Kurs 10 / Lys stue" onBlur={e=>updateItemText("circuit",e.target.value)}/></label><label className={styles.mobileWide}>EL-notat<textarea key={"in-"+sel.id+"-"+(sel.itemNote||"")} defaultValue={sel.itemNote||""} placeholder="F.eks. dimbar, dobbel stikk, høyde fra gulv…" onBlur={e=>updateItemText("itemNote",e.target.value)}/></label></>}
    {["customwall","customfloor"].includes(sel.type)&&<><label className={styles.mobileWide}>Møbelnavn<input key={"icn-"+sel.id+"-"+(sel.customName||"")} defaultValue={sel.customName||"Eget møbel"} onBlur={e=>updateItemText("customName",e.target.value)}/></label><label>Felt bortover<input type="number" min="1" max="8" defaultValue={Math.round(Number(sel.sectionsX)||1)} onBlur={e=>update("sectionsX",e.target.value)}/></label><label>Felt i høyden<input type="number" min="1" max="6" defaultValue={Math.round(Number(sel.sectionsY)||1)} onBlur={e=>update("sectionsY",e.target.value)}/></label></>}{!electricalTypes.has(sel.type)&&!openingTypes.has(sel.type)&&<><label>3D-høyde (mm)<input key={"i3h-"+sel.id+"-"+sel.modelHeight} type="number" inputMode="numeric" min="50" max="5000" defaultValue={Math.round(modelHeight(sel))} onBlur={e=>update("modelHeight",e.target.value)}/></label><label>Høyde over gulv (mm)<input key={"i3e-"+sel.id+"-"+sel.elevation} type="number" inputMode="numeric" min="0" max="5000" defaultValue={Math.round(Number(sel.elevation)||0)} onBlur={e=>update("elevation",e.target.value)}/></label></>}
   </>}
   <div className={styles.mobileObjectActions}>
    {selected.kind==="item"&&fieldReturnZoneId&&(doc.zones||[]).some(z=>z.id===fieldReturnZoneId)&&<button type="button" onClick={()=>{const id=fieldReturnZoneId;setFieldReturnZoneId(null);setSelected({kind:"zone",id});setTimeout(()=>setMobileEditOpen(true),0)}}>← Til rom</button>}
    {selected.kind==="measurement"&&<button type="button" onClick={()=>{setSelected(null);setMobileEditOpen(false);setTool("measure");setMeasureDraft(null);setSnapHint(null)}}>+ Nytt mål</button>}
    {selected.kind==="item"&&sel.type==="door"&&<button type="button" onClick={flipDoor}>Speil dør</button>}
    {selected.kind==="item"&&sel.wallId&&!wallElectricalTypes.has(sel.type)&&<button type="button" onClick={detach}>Løsne</button>}
    {selected.kind==="item"&&<button type="button" onClick={duplicate}>Dupliser</button>}
    <button type="button" className={styles.mobileDanger} onClick={remove}>Slett valgt</button>
   </div>
   <button type="button" className={styles.mobileAllProps} onClick={()=>scrollPanel(rightPanel)}>Vis alle egenskaper</button>
  </div>}
  {wallForView&&<div className={styles.wallViewBackdrop} role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget){if(furnitureGapPick){setFurnitureBuilder(furnitureGapPick);setFurnitureGapPick(null)}setWallViewId(null)}}}>
   <section className={styles.wallViewModal} role="dialog" aria-modal="true" aria-label="Veggvisning og veggtegning">
    <header>
     <div><span>VEGGTEGNING</span><h2>Vegg {Math.max(1,doc.walls.findIndex(w=>w.id===wallForView.id)+1)} · {len(wallForView)} × {Math.round(Number(wallForView.h)||2400)} mm</h2><p>Arbeid rett på veggen. Alt som hører til veggen vises med faktisk bredde og høyde, slik at du kan bygge opp veggen før du går tilbake til plantegningen.</p></div>
     <button type="button" onClick={()=>setWallViewId(null)} aria-label="Lukk veggtegning">×</button>
    </header>
    <div className={styles.wallStrip}>{doc.walls.map((wall,index)=><button type="button" key={wall.id} data-active={wall.id===wallForView.id?"true":"false"} onClick={()=>openWallView(wall.id)}><b>Vegg {index+1}</b><small>{len(wall)} × {Math.round(Number(wall.h)||2400)} mm</small></button>)}</div>
    <div className={styles.wallViewToolbar}><button type="button" onClick={()=>cycleWallView(-1)}>← Forrige</button><button type="button" className={styles.wallViewBuild} onClick={()=>openFurnitureBuilder(wallForView.id)}>+ Bygg eget møbel</button>{furnitureGapPick&&<button type="button" className={styles.wallGapCancel} onClick={()=>{setFurnitureBuilder(furnitureGapPick);setFurnitureGapPick(null)}}>Avbryt mellomrom</button>}<button type="button" onClick={()=>cycleWallView(1)}>Neste →</button></div>
    <div className={styles.wallWorkspaceTools}>
     <button type="button" onClick={()=>openFurnitureBuilder(wallForView.id)}>+ Eget møbel</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("door",900,100)}>+ Dør</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("sliding",1800,100)}>+ Skyvedør</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("window",1200,100)}>+ Vindu</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("opening",1000,100)}>+ Åpning</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("outlet",180,100)}>+ Stikk</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("doubleoutlet",220,100)}>+ Dobbel stikk</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("switch",120,100)}>+ Bryter</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("dimmer",120,100)}>+ Dimmer</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("thermostat",140,100)}>+ Termostat</button>
     <button type="button" onClick={()=>addWallWorkspaceItem("walllight",180,100)}>+ Vegglampe</button>
    </div>
    <div className={styles.wallViewCanvas+(furnitureGapPick?" "+styles.wallGapPickCanvas:"")}>{furnitureGapPick?<FurnitureGapPlanPreview doc={doc} wall={wallForView} onSelectGap={chooseFurnitureGap}/>:<WallElevationPreview wall={wallForView} items={doc.items} selectedItemId={selected?.kind==="item"?selected.id:null} onSelectItem={item=>setSelected({kind:"item",id:item.id})}/>}</div>
    {wallSelectedItem&&(()=>{const gaps=wallEdgeOffsets(wallSelectedItem,wallForView),isOpening=openingTypes.has(wallSelectedItem.type),isElectrical=wallElectricalTypes.has(wallSelectedItem.type),isCustom=wallSelectedItem.type==="customwall";return <div className={styles.wallInlineEditor}>
     <div><strong>{wallSelectedItem.customName||labelFor(wallSelectedItem.type)}</strong><small>Valgt på vegg {Math.max(1,doc.walls.findIndex(w=>w.id===wallForView.id)+1)}</small></div>
     <label>Fra venstre (mm)<input type="number" min="0" max={Math.max(0,gaps.L-Number(wallSelectedItem.w||0))} value={gaps.start} onChange={e=>updateWallItemById(wallSelectedItem.id,"wallStartGap",e.target.value)}/></label>
     <label>Bredde (mm)<input type="number" min="100" max={gaps.L} value={Math.round(Number(wallSelectedItem.w)||0)} onChange={e=>updateWallItemById(wallSelectedItem.id,"w",e.target.value)}/></label>
     {isOpening&&<label>Åpningshøyde (mm)<input type="number" min="100" max={Math.round(Number(wallForView.h)||2400)} value={Math.round(Number(wallSelectedItem.openingHeight)||openingDefaults(wallSelectedItem.type).openingHeight||2100)} onChange={e=>updateWallVerticalItem(wallSelectedItem.id,"openingHeight",e.target.value)}/></label>}
     {wallSelectedItem.type==="window"&&<label>Brystning (mm)<input type="number" min="0" value={Math.round(Number(wallSelectedItem.sillHeight)||0)} onChange={e=>updateWallVerticalItem(wallSelectedItem.id,"sillHeight",e.target.value)}/></label>}
     {isElectrical&&<label>Høyde fra gulv (mm)<input type="number" min="0" max={Math.round(Number(wallForView.h)||2400)} value={Math.round(Number(wallSelectedItem.mountHeight)||0)} onChange={e=>updateWallVerticalItem(wallSelectedItem.id,"mountHeight",e.target.value)}/></label>}
     {isCustom&&<><label>Møbelhøyde (mm)<input type="number" min="50" value={Math.round(modelHeight(wallSelectedItem))} onChange={e=>updateWallVerticalItem(wallSelectedItem.id,"modelHeight",e.target.value)}/></label><label>Fra gulv (mm)<input type="number" min="0" value={Math.round(Number(wallSelectedItem.elevation)||0)} onChange={e=>updateWallVerticalItem(wallSelectedItem.id,"elevation",e.target.value)}/></label></>}
     <div className={styles.wallInlineActions}><button type="button" onClick={duplicate}>Dupliser</button><button type="button" onClick={remove}>Slett</button></div>
    </div>})()}
    <div className={styles.wallViewHint}>{furnitureGapPick?<><b>Velg mellomrom i plantegningen:</b> du ser nå rommet slik du tegnet det, med seng, skap, kommode og resten av møblene på riktig plass. Grønne felt ligger langs den valgte veggen mellom møblenes projiserte kanter. Trykk på feltet du vil fylle, så får møbelet automatisk akkurat den bredden.</>:<>Klikk et objekt på veggen for å redigere det uten å forlate veggvisningen. Rutenettet er 100 mm. Vegglengde, vegghøyde, åpninger, EL-punkter og egne møbler vises i samme frontvisning.</>}</div>
    <footer><span>Vegg: <b>{len(wallForView)} × {Math.round(Number(wallForView.h)||2400)} × {Math.round(Number(wallForView.t)||98)} mm</b></span><span>Objekter: <b>{doc.items.filter(item=>item.wallId===wallForView.id).length}</b></span><button type="button" onClick={()=>setWallViewId(null)}>Tilbake til plantegning →</button></footer>
   </section>
  </div>}
  {furnitureBuilder&&<div className={styles.furnitureBuilderBackdrop} role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)setFurnitureBuilder(null)}}>
   <section className={styles.furnitureBuilderModal} role="dialog" aria-modal="true" aria-label="Bygg eget møbel">
    <div className={styles.roomModalHead}><div><span>EGET MØBEL</span><h2>Bygg møbel med egne mål</h2></div><button type="button" onClick={()=>setFurnitureBuilder(null)} aria-label="Lukk">×</button></div>
    <div className={styles.furnitureTemplates}>{furnitureTemplates.map(template=><button type="button" key={template.id} className={furnitureBuilder.templateId===template.id?styles.furnitureTemplateActive:""} onClick={()=>applyFurnitureTemplate(template.id)}><b>{template.label}</b><small>{template.width} × {template.depth} × {template.height} mm</small></button>)}</div>
    <div className={styles.furnitureBuilderGrid}>
     <label className={styles.furnitureWide}>Navn<input value={furnitureBuilder.name} onChange={e=>setFurnitureBuilder(v=>({...v,name:e.target.value}))}/></label>
     <label>Bredde (mm)<input type="number" min="100" max="6000" value={furnitureBuilder.width} onChange={e=>setFurnitureBuilder(v=>({...v,width:e.target.value}))}/></label>
     <label>Dybde (mm)<input type="number" min="50" max="2000" value={furnitureBuilder.depth} onChange={e=>setFurnitureBuilder(v=>({...v,depth:e.target.value}))}/></label>
     <label>Høyde (mm)<input type="number" min="50" max="5000" value={furnitureBuilder.height} onChange={e=>setFurnitureBuilder(v=>({...v,height:e.target.value}))}/></label>
     <label>Fra gulv (mm)<input type="number" min="0" max="5000" value={furnitureBuilder.elevation} onChange={e=>setFurnitureBuilder(v=>({...v,elevation:e.target.value}))}/></label>
     <label>Felt bortover<input type="number" min="1" max="8" value={furnitureBuilder.sectionsX} onChange={e=>setFurnitureBuilder(v=>({...v,sectionsX:e.target.value}))}/></label>
     <label>Felt i høyden<input type="number" min="1" max="6" value={furnitureBuilder.sectionsY} onChange={e=>setFurnitureBuilder(v=>({...v,sectionsY:e.target.value}))}/></label>
     <label className={styles.furnitureWide}>Plassering<select value={furnitureBuilder.mount} onChange={e=>setFurnitureBuilder(v=>({...v,mount:e.target.value}))}><option value="floor">På gulv / fritt i rom</option><option value="wall">På vegg</option></select></label>
     {furnitureBuilder.mount==="wall"&&<><label className={styles.furnitureWide}>Vegg<select value={furnitureBuilder.wallId||""} onChange={e=>setFurnitureBuilder(v=>({...v,wallId:e.target.value}))}><option value="">Velg vegg…</option>{doc.walls.map((wall,index)=><option value={wall.id} key={wall.id}>Vegg {index+1} · {len(wall)} mm</option>)}</select></label><label className={styles.furnitureWide}>Fra veggens start (mm)<input type="number" min="0" placeholder="Tomt = sentrert" value={furnitureBuilder.start} onChange={e=>setFurnitureBuilder(v=>({...v,start:e.target.value}))}/><small>Lar du feltet stå tomt, sentreres møbelet på veggen.</small></label></>}
    </div>
    <div className={styles.furniturePreview}>
     <div style={{aspectRatio:Math.max(.35,Math.min(3,Number(furnitureBuilder.width||1)/Math.max(1,Number(furnitureBuilder.height)||1)))}}>{Array.from({length:Math.max(1,Math.min(8,Math.round(Number(furnitureBuilder.sectionsX)||1)))*Math.max(1,Math.min(6,Math.round(Number(furnitureBuilder.sectionsY)||1)))},(_,i)=><span key={i}/>)}</div>
     <p>{furnitureBuilder.name||"Eget møbel"} · {furnitureBuilder.width||0} × {furnitureBuilder.depth||0} × {furnitureBuilder.height||0} mm</p>
    </div>
    <div className={styles.furnitureSmartActions}>{furnitureBuilder.mount==="wall"&&<><button type="button" onClick={()=>setFurnitureBuilder(v=>{const wall=doc.walls.find(w=>w.id===v?.wallId)||wallForView;if(!v||!wall)return v;const width=Math.min(Math.max(100,Number(v.width)||100),len(wall));return {...v,width:String(Math.round(width)),start:String(Math.round((len(wall)-width)/2))}})}>Sentrer på veggen</button><button type="button" className={styles.smartGapButton} onClick={startFurnitureGapPick}>↔ Velg mellomrom – tilpass automatisk</button></>}</div>
    <div className={styles.roomModalActions}><button type="button" onClick={()=>setFurnitureBuilder(null)}>Avbryt</button><button type="button" onClick={createCustomFurniture}>Legg inn møbel</button></div>
   </section>
  </div>}
  {show3D&&<div className={styles.preview3DBackdrop} role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)setShow3D(false)}}>
   <section className={styles.preview3DModal} role="dialog" aria-modal="true" aria-label="3D-visning">
    <header><div><span>3D-VISNING</span><h2>{doc.name||"Tegning"}</h2><p>Dra visningen med finger eller mus for å gå rundt rommet. Klikk møbler for å velge dem, eller klikk en vegg for full veggtegning.</p></div><button type="button" onClick={()=>setShow3D(false)} aria-label="Lukk 3D-visning">×</button></header>
    <div className={styles.preview3DControls}>
     <button type="button" onClick={()=>setCamera3D(c=>({...c,yaw:c.yaw-20}))}>↺ Venstre</button>
     <button type="button" onClick={()=>setCamera3D(c=>({...c,yaw:c.yaw+20}))}>Høyre ↻</button>
     <button type="button" onClick={()=>setCamera3D(c=>({...c,pitch:clamp(c.pitch+8,8,78)}))}>Se ovenfra</button>
     <button type="button" onClick={()=>setCamera3D(c=>({...c,pitch:clamp(c.pitch-8,8,78)}))}>Se lavere</button>
     <button type="button" onClick={()=>setCamera3D(c=>({...c,zoom:clamp(c.zoom+.12,.55,2.5)}))}>Zoom +</button>
     <button type="button" onClick={()=>setCamera3D(c=>({...c,zoom:clamp(c.zoom-.12,.55,2.5)}))}>Zoom −</button>
     <button type="button" onClick={()=>setCamera3D({yaw:42,pitch:34,zoom:1})}>Nullstill</button>
    </div>
    <div className={styles.preview3DAdd}>
     <b>Legg til mens du ser i 3D:</b>
     <button type="button" onClick={()=>addItem("bed",1800,2000)}>Seng</button>
     <button type="button" onClick={()=>addItem("nightstand",500,450)}>Nattbord</button>
     <button type="button" onClick={()=>addItem("dresser",1200,450)}>Kommode</button>
     <button type="button" onClick={()=>addItem("wardrobe",1200,600)}>Garderobe</button>
     <button type="button" onClick={()=>addItem("desk",1200,600)}>Skrivebord</button>
     <button type="button" onClick={()=>addItem("bookshelf",900,350)}>Bokhylle</button>
     <button type="button" onClick={()=>openFurnitureBuilder(null)}>Eget møbel</button>
    </div>
    <div className={styles.preview3DCanvas+" "+styles.preview3DOrbit} onPointerDown={start3DOrbit} onPointerMove={move3DOrbit} onPointerUp={end3DOrbit} onPointerCancel={end3DOrbit}>
     <Drawing3DPreview doc={doc} camera={camera3D} onWallSelect={wall=>openWallView(wall.id)} onItemSelect={item=>setSelected({kind:"item",id:item.id})}/>
    </div>
    {selected?.kind==="item"&&doc.items.find(item=>item.id===selected.id)&&<div className={styles.preview3DSelection}><span>Valgt: <b>{doc.items.find(item=>item.id===selected.id)?.customName||labelFor(doc.items.find(item=>item.id===selected.id)?.type)}</b></span><button type="button" onClick={()=>{setShow3D(false);setTimeout(()=>scrollPanel(rightPanel),0)}}>Rediger mål og plassering →</button></div>}
    <div className={styles.previewWallStrip}>{doc.walls.map((wall,index)=><button type="button" key={wall.id} onClick={()=>openWallView(wall.id)}>Vegg {index+1}<small>{len(wall)} × {Math.round(Number(wall.h)||2400)} × {Math.round(Number(wall.t)||98)} mm</small></button>)}</div>
    <footer><span><b>Dra:</b> roter 3D-visningen</span><span><b>Vegger:</b> klikk for frontvisning</span><span><b>Møbler:</b> klikk for å velge</span><span><b>Kunde:</b> delt tegning får samme dreibare 3D-visning</span></footer>
   </section>
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
  {quoteWarningOpen&&<div className={styles.roomModalBackdrop} onPointerDown={e=>{if(e.target===e.currentTarget)setQuoteWarningOpen(false)}}>
   <section className={styles.quoteWarningModal} role="dialog" aria-modal="true" aria-labelledby="quote-warning-title">
    <div className={styles.roomModalHead}><div><span>TILBUDSGRUNNLAG</span><h2 id="quote-warning-title">Befaringen er ikke ferdig</h2></div><button type="button" onClick={()=>setQuoteWarningOpen(false)}>×</button></div>
    <p>{overallSurveyProgress.done}/{overallSurveyProgress.total} rom er godkjent{overallSurveyProgress.stale?" og "+overallSurveyProgress.stale+" rom må sjekkes på nytt":""}. Netto vegg- og listemengder kan derfor fortsatt endre seg.</p>
    <div className={styles.quoteWarningStats}><span><small>Rom ferdig</small><b>{overallSurveyProgress.done}/{overallSurveyProgress.total}</b></span><span><small>Må sjekkes</small><b>{overallSurveyProgress.stale}</b></span><span><small>Gjenstår</small><b>{overallSurveyProgress.remaining}</b></span></div>
    <div className={styles.quoteWarningActions}><button type="button" onClick={()=>{setQuoteWarningOpen(false);openNextSurveyIssue()}}>Kontroller neste rom</button><button type="button" onClick={()=>{setQuoteWarningOpen(false);launchQuoteFromDrawing()}}>Opprett utkast likevel</button></div>
    <small>Oppretter du utkast likevel, merkes mengdegrunnlaget i notatet som «befaring ikke ferdig».</small>
   </section>
  </div>}
  {deleteConfirmOpen&&<div className={styles.roomModalBackdrop} onPointerDown={e=>{if(e.target===e.currentTarget&&!deleteBusy)setDeleteConfirmOpen(false)}}>
   <section className={styles.deleteModal} role="dialog" aria-modal="true" aria-labelledby="delete-drawing-title">
    <div className={styles.roomModalHead}><div><span>SLETT TEGNING</span><h2 id="delete-drawing-title">Slette «{doc.name||"denne tegningen"}»?</h2></div><button type="button" disabled={deleteBusy} onClick={()=>setDeleteConfirmOpen(false)}>×</button></div>
    <p>Dette fjerner tegningen fra denne enheten{doc.serverId?" og fra oppdraget":""}. Handlingen kan ikke angres etter sletting.</p>
    <div className={styles.deleteModalActions}><button type="button" disabled={deleteBusy} onClick={()=>setDeleteConfirmOpen(false)}>Behold</button><button type="button" disabled={deleteBusy} onClick={deleteDoc}>{deleteBusy?"Sletter…":"Slett tegning"}</button></div>
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
    <div className={styles.group}><h2>Tegninger</h2><div className={styles.row}><button className={styles.btn} onClick={newDoc}>+ Ny</button><button className={styles.btn} onClick={exportJson}>Eksporter</button><label className={styles.btn}>Importer<input className={styles.hiddenFile} type="file" accept="application/json,.json" onChange={importJson}/></label><button className={styles.btn+" "+styles.danger} onClick={()=>setDeleteConfirmOpen(true)}>Slett</button></div>{docs.length>0&&<select className={styles.select} value={doc.id} onChange={e=>openDoc(e.target.value)}>{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}<div className={styles.field}><label>Koble til oppdrag</label><select className={styles.select} value={doc.orderId||""} onChange={changeOrder}><option value="">Ikke koblet</option>{orders.map(order=><option key={order.id} value={order.id}>{order.orderNumber} · {order.customerName||"Uten kundenavn"}</option>)}</select><small className={styles.muted}>Velger du et oppdrag, hentes kunde og arbeidsadresse automatisk og tegningen lagres på oppdraget.</small></div><div className={styles.field}><label>Kundekonto / Min side</label><select className={styles.select} value={doc.customerUserId||""} onChange={e=>setDoc(d=>({...d,customerUserId:e.target.value,customerVisible:e.target.value?d.customerVisible:false}))}><option value="">Ikke knyttet til kundekonto</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name||customer.email} · {customer.email}</option>)}</select><small className={styles.muted}>Kunden må ha kundekonto for å kunne se tegningen på Min side.</small></div><label className={styles.check}><input type="checkbox" checked={doc.customerVisible===true} disabled={!doc.customerUserId} onChange={e=>setDoc(d=>({...d,customerVisible:e.target.checked}))}/> Vis denne tegningen på kundens Min side</label>{doc.projectId&&<div className={styles.field}><label>Eldre prosjektkobling</label><select className={styles.select} value={doc.projectId||""} onChange={changeProject}><option value="">Fjern eldre kobling</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div>}<div className={styles.field}><label>Kunde</label><input value={doc.customer||""} onChange={e=>setDoc(d=>({...d,customer:e.target.value}))}/></div><div className={styles.field}><label>Adresse</label><input value={doc.address||""} onChange={e=>setDoc(d=>({...d,address:e.target.value}))}/></div><div className={styles.field}><label>Notater</label><textarea className={styles.textarea} value={doc.notes||""} onChange={e=>setDoc(d=>({...d,notes:e.target.value}))}/></div></div>
    <div className={styles.group}><h2>Innstillinger</h2><div className={styles.field}><label>Snap/rutenett</label><select className={styles.select} value={doc.snapSize||50} onChange={e=>setDoc(d=>({...d,snapSize:Number(e.target.value)}))}><option value="10">10 mm</option><option value="25">25 mm</option><option value="50">50 mm</option><option value="100">100 mm</option></select></div><div className={styles.field}><label>Standard veggtykkelse</label><select className={styles.select} value={doc.defaultWallThickness||98} onChange={e=>setDoc(d=>({...d,defaultWallThickness:Number(e.target.value)}))}><option value="70">70 mm</option><option value="98">98 mm</option><option value="120">120 mm</option><option value="198">198 mm</option><option value="248">248 mm</option></select></div><div className={styles.field}><label>Standard vegghøyde</label><select className={styles.select} value={doc.defaultWallHeight||2400} onChange={e=>setDoc(d=>({...d,defaultWallHeight:Number(e.target.value)}))}><option value="2200">2200 mm</option><option value="2400">2400 mm</option><option value="2500">2500 mm</option><option value="2600">2600 mm</option><option value="2700">2700 mm</option></select></div><div className={styles.field}><label>PDF-målestokk</label><select className={styles.select} value={doc.scale||"1:50"} onChange={e=>setDoc(d=>({...d,scale:e.target.value}))}><option>1:20</option><option>1:25</option><option>1:50</option><option>1:100</option></select></div><label className={styles.check}><input type="checkbox" checked={doc.showGrid!==false} onChange={e=>setDoc(d=>({...d,showGrid:e.target.checked}))}/> Vis rutenett</label></div><div className={styles.group}><h2>Rom og vegger</h2><div className={styles.row}><button className={tool==="wall"?styles.activeBtn:styles.btn} onClick={()=>{setTool("wall");setDraft(null);setWallChain(null);setSnapHint(null)}}>Tegn vegg</button><button className={styles.btn} onClick={makeRoom}>Rektangulært rom</button><button className={styles.btn} onClick={makeLRoom}>L-formet rom</button><button className={tool==="zone"?styles.activeBtn:styles.btn} onClick={()=>{setTool("zone");setDraft(null);setWallChain(null);setSnapHint(null);setMeasureDraft(null);setZoneDraft([])}}>Tegn romsone</button>{tool==="zone"&&<><button className={styles.btn} onClick={finishZone} disabled={zoneDraft.length<3}>Lukk romsone</button><button className={styles.btn} onClick={cancelZone}>Avbryt sone</button></>}<button className={tool==="measure"?styles.activeBtn:styles.btn} onClick={()=>{setTool("measure");setDraft(null);setWallChain(null);setSnapHint(null);setZoneDraft([]);setMeasureDraft(null)}}>Mål avstand</button><button className={styles.btn} onClick={clearMeasures}>Fjern mål</button></div><p className={styles.muted}>Nye vegger bruker standard tykkelse og høyde over. Med «Tegn romsone» klikker du rundt innsiden av et rom og avslutter med «Lukk romsone». Da beregnes gulv/tak, brutto listelengde og veggflate per rom.</p></div>
    {catalog.map(g=><div className={styles.group} key={g.group}><h2>{g.group}</h2><div className={styles.library}>{g.items.map(([t,l,w,h])=><button key={t} onClick={()=>addItem(t,w,h)}>{l}<small>{w} × {h} mm</small></button>)}</div></div>)}
   </aside>
   <section className={styles.workspace}><div className={styles.printHead}><h1>{doc.name}</h1><p>{[doc.customer,doc.address].filter(Boolean).join(" · ")}</p><p>Oppdrag: {projectLabel}</p><p>Målestokk: {doc.scale||"1:50"} · Alle mål i mm · Aadland Service</p></div><div className={styles.printSummary}><div><span>Vegger</span><b>{summary.wallM.toFixed(2)} lm</b></div><div><span>Gulvareal</span><b>{summary.floorM2==null?"—":summary.floorM2.toFixed(2)+" m²"}</b></div><div><span>Brutto veggflate</span><b>{summary.wallM2.toFixed(2)} m²</b></div><div><span>Åpningsareal</span><b>{summary.openingM2.toFixed(2)} m²</b></div><div><span>Netto veggflate</span><b>{summary.netWallM2.toFixed(2)} m²</b></div><div><span>Dører / vinduer</span><b>{summary.doors} / {summary.windows}</b></div><div><span>EL-punkter</span><b>{summary.electrical}</b></div><div><span>LED-stripe</span><b>{summary.ledM.toFixed(2)} lm</b></div>{summary.zoneRows.length>0&&<><div><span>Romsone gulv/tak</span><b>{summary.zonedFloorM2.toFixed(2)} m²</b></div><div><span>Brutto listelengde</span><b>{summary.zonePerimeterM.toFixed(2)} lm</b></div><div><span>Netto listelengde</span><b>{summary.zoneNetSkirtingM.toFixed(2)} lm</b></div><div><span>Brutto rom-veggflate</span><b>{summary.zoneWallM2.toFixed(2)} m²</b></div><div><span>Rom-åpningsareal</span><b>{summary.zoneOpeningM2.toFixed(2)} m²</b></div><div><span>Netto rom-veggflate</span><b>{summary.zoneNetWallM2.toFixed(2)} m²</b></div></>}{overallSurveyProgress.total>0&&<div><span>Befaring</span><b>{overallSurveyProgress.complete?"Ferdig – "+overallSurveyProgress.done+"/"+overallSurveyProgress.total+" rom":"Ikke ferdig – "+overallSurveyProgress.done+"/"+overallSurveyProgress.total+" rom"+(overallSurveyProgress.stale?" · "+overallSurveyProgress.stale+" må sjekkes":"")}</b></div>}{doc.notes&&<div className={styles.printNotes}><span>Notater</span><b>{doc.notes}</b></div>}</div><div className={styles.canvasWrap}><div className={styles.mobileCanvasHint}>Én finger: tegn/velg · To fingre: zoom og flytt</div><svg ref={svg} className={styles.canvas} viewBox={printBounds?printBounds.x+" "+printBounds.y+" "+printBounds.w+" "+printBounds.h:pan.x+" "+pan.y+" "+viewWidth+" "+viewHeight} onPointerDownCapture={pointerDownCapture} onPointerMoveCapture={pointerMoveCapture} onPointerUpCapture={pointerUpCapture} onPointerCancelCapture={pointerUpCapture} onPointerDown={canvasDown} onPointerMove={move} onPointerUp={up} onPointerLeave={e=>{if(e.pointerType!=="touch")up(e)}} onWheel={e=>{e.preventDefault();zoomBy(e.deltaY<0?.15:-.15)}}>
    <defs><pattern id="minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={"M "+GRID+" 0 L 0 0 0 "+GRID} fill="none" stroke="#ece9e1" strokeWidth="6"/></pattern><pattern id="major" width="1000" height="1000" patternUnits="userSpaceOnUse"><rect width="1000" height="1000" fill="url(#minor)"/><path d="M1000 0L0 0 0 1000" fill="none" stroke="#d9d5ca" strokeWidth="12"/></pattern></defs>
    <rect data-canvas="yes" width={VIEW} height={VIEW} fill={doc.showGrid===false?"#fff":"url(#major)"}/>
    {(doc.zones||[]).map(z=>{const c=polygonCentroid(z.points),active=selected?.kind==="zone"&&selected.id===z.id;return <g key={z.id} onPointerDown={e=>{if(["wall","measure","zone"].includes(tool)){e.stopPropagation();drawingPointDown(e);return}e.stopPropagation();setTool("select");setSelected({kind:"zone",id:z.id})}} style={{pointerEvents:tool==="zone"?"none":"auto",cursor:"pointer"}}><polygon points={z.points.map(p=>p.x+","+p.y).join(" ")} fill={active?"rgba(207,161,83,.28)":"rgba(50,106,118,.10)"} stroke={active?"#9b7a39":"#326a76"} strokeWidth={active?28:18} strokeDasharray="45 22"/><text x={c.x} y={c.y-35} textAnchor="middle" fontSize="120" fontWeight="700" fill="#274e57">{z.name||"Rom"}</text><text x={c.x} y={c.y+95} textAnchor="middle" fontSize="90" fill="#326a76">{polygonAreaM2(z.points).toFixed(2)} m²</text>{active&&z.points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="190" fill="transparent" onPointerDown={e=>downZonePoint(e,z,i)}/><circle cx={p.x} cy={p.y} r="55" fill="#fff" stroke="#9b7a39" strokeWidth="20" pointerEvents="none"/></g>)}</g>})}
    {zoneDraft.length>0&&<g style={{pointerEvents:"none"}}><polyline points={zoneDraft.map(p=>p.x+","+p.y).join(" ")} fill="rgba(207,161,83,.12)" stroke="#9b7a39" strokeWidth="24" strokeDasharray="45 22"/>{zoneDraft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="38" fill="#9b7a39"/>)}</g>}
    {doc.walls.map(w=><g key={w.id} onPointerDown={e=>{if(["wall","measure","zone"].includes(tool)){e.stopPropagation();drawingPointDown(e);return}e.stopPropagation();setTool("select");setSelected({kind:"wall",id:w.id})}} className={styles.pick}><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="transparent" strokeWidth="260" strokeLinecap="round"/><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={selected?.id===w.id?"#9b7a39":"#222"} strokeWidth={Math.max(35,w.t)} strokeLinecap="square"/>{selected?.kind==="wall"&&selected.id===w.id&&<><circle cx={w.x1} cy={w.y1} r="190" fill="transparent" onPointerDown={e=>downWallEnd(e,w,1)}/><circle cx={w.x2} cy={w.y2} r="190" fill="transparent" onPointerDown={e=>downWallEnd(e,w,2)}/><circle cx={w.x1} cy={w.y1} r="70" fill="#fff" stroke="#9b7a39" strokeWidth="22" pointerEvents="none"/><circle cx={w.x2} cy={w.y2} r="70" fill="#fff" stroke="#9b7a39" strokeWidth="22" pointerEvents="none"/></>}{(()=>{const d=dim(w);return <><line x1={d.ax} y1={d.ay} x2={d.bx} y2={d.by} stroke="#777" strokeWidth="10"/><line x1={d.ax-d.nx*60} y1={d.ay-d.ny*60} x2={d.ax+d.nx*60} y2={d.ay+d.ny*60} stroke="#777" strokeWidth="10"/><line x1={d.bx-d.nx*60} y1={d.by-d.ny*60} x2={d.bx+d.nx*60} y2={d.by+d.ny*60} stroke="#777" strokeWidth="10"/><text x={d.mx} y={d.my} textAnchor="middle" fontSize="105">{len(w)} mm · {angle(w)}°</text></>})()}</g>)}
    {selected?.kind==="zone"&&selectedZoneWalls.length>0&&selectedZoneWalls.map((wall,index)=>{const x=(wall.x1+wall.x2)/2,y=(wall.y1+wall.y2)/2,dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,tip={x:x+ux*205,y:y+uy*205},base={x:x+ux*118,y:y+uy*118};return <g key={"room-wall-"+wall.id} pointerEvents="none"><circle cx={x} cy={y} r="118" fill="#252622" stroke="#fff" strokeWidth="18"/><text x={x} y={y+34} textAnchor="middle" fontSize="105" fontWeight="800" fill="#fff">{index+1}</text><polygon points={tip.x+","+tip.y+" "+(base.x+nx*52)+","+(base.y+ny*52)+" "+(base.x-nx*52)+","+(base.y-ny*52)} fill="#d7a74e" stroke="#fff" strokeWidth="12"/></g>})}
    {selected?.kind==="zone"&&selectedZoneWalls.length>0&&selectedZoneWalls.map((wall,index)=>{const value=selectedRoomDiagnostics.corners[index];return value==null?null:<g key={"corner-angle-"+wall.id} pointerEvents="none"><circle cx={wall.x1} cy={wall.y1} r="84" fill="#fff" stroke="#9b7a39" strokeWidth="14"/><text x={wall.x1} y={wall.y1+24} textAnchor="middle" fontSize="65" fontWeight="800" fill="#6e5426">{Math.round(value)}°</text></g>})}
    {doc.items.map(o=><g key={o.id} opacity={elPlan&&!electricalTypes.has(o.type)&&!openingTypes.has(o.type)?0.16:1} transform={"translate("+o.x+" "+o.y+") rotate("+o.rot+" "+o.w/2+" "+o.h/2+")"} onPointerDown={e=>downItem(e,o)} className={styles.pick}>
     <rect x="-140" y="-140" width={o.w+280} height={Math.max(o.h,100)+280} fill="transparent"/>
     <PlanItemGlyph item={o} active={selected?.id===o.id}/>
     {!electricalTypes.has(o.type)&&<><text x={o.w/2} y={o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize="100">{o.customName||labelFor(o.type)}</text><text x={o.w/2} y={o.h/2+125} textAnchor="middle" fontSize="75">{o.w} × {o.h}</text></>}
     {electricalTypes.has(o.type)&&<><text x={o.w/2} y={o.h+95} textAnchor="middle" fontSize="70" fontWeight="800" fill="#765a20">{o.customName||labelFor(o.type)}</text>{o.circuit&&<text x={o.w/2} y={o.h+170} textAnchor="middle" fontSize="58" fill="#765a20">{o.circuit}</text>}</>}
    </g>)}
    {selected?.kind==="item"&&sel?.wallId&&openingTypes.has(sel.type)&&doc.walls.find(w=>w.id===sel.wallId)&&(()=>{const wall=doc.walls.find(w=>w.id===sel.wallId),g=wallEdgeOffsets(sel,wall),dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,off=360,sx=wall.x1+ux*g.start,sy=wall.y1+uy*g.start,ex=sx+ux*sel.w,ey=sy+uy*sel.w,a1={x:wall.x1+nx*off,y:wall.y1+ny*off},a2={x:sx+nx*off,y:sy+ny*off},a3={x:ex+nx*off,y:ey+ny*off},a4={x:wall.x2+nx*off,y:wall.y2+ny*off};return <g pointerEvents="none"><line x1={a1.x} y1={a1.y} x2={a4.x} y2={a4.y} stroke="#315c64" strokeWidth="12"/>{[a1,a2,a3,a4].map((p,i)=><line key={i} x1={p.x-nx*58} y1={p.y-ny*58} x2={p.x+nx*58} y2={p.y+ny*58} stroke="#315c64" strokeWidth="12"/>)}<text x={(a1.x+a2.x)/2} y={(a1.y+a2.y)/2-55} textAnchor="middle" fontSize="76" fontWeight="700" fill="#315c64">{g.start} mm</text><text x={(a2.x+a3.x)/2} y={(a2.y+a3.y)/2-55} textAnchor="middle" fontSize="82" fontWeight="800" fill="#9b7a39">{Math.round(sel.w)} mm</text><text x={(a3.x+a4.x)/2} y={(a3.y+a4.y)/2-55} textAnchor="middle" fontSize="76" fontWeight="700" fill="#315c64">{g.end} mm</text></g>})()}
    {(doc.measurements||[]).map(m=>{const active=selected?.kind==="measurement"&&selected.id===m.id,distance=Math.round(Math.hypot(m.x2-m.x1,m.y2-m.y1));return <g key={m.id} className={styles.pick} onPointerDown={e=>{if(["wall","measure","zone"].includes(tool)){e.stopPropagation();drawingPointDown(e);return}e.stopPropagation();setTool("select");setSelected({kind:"measurement",id:m.id})}}><line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="transparent" strokeWidth="180"/><line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={active?"#9b7a39":"#326a76"} strokeWidth={active?20:12} strokeDasharray="35 22"/>{active&&<><circle cx={m.x1} cy={m.y1} r="170" fill="transparent" onPointerDown={e=>downMeasurementEnd(e,m,1)}/><circle cx={m.x2} cy={m.y2} r="170" fill="transparent" onPointerDown={e=>downMeasurementEnd(e,m,2)}/></>}<circle cx={m.x1} cy={m.y1} r={active?40:28} fill={active?"#9b7a39":"#326a76"} pointerEvents="none"/><circle cx={m.x2} cy={m.y2} r={active?40:28} fill={active?"#9b7a39":"#326a76"} pointerEvents="none"/><text x={(m.x1+m.x2)/2} y={(m.y1+m.y2)/2-70} textAnchor="middle" fontSize="90" fontWeight={active?"700":"400"} fill={active?"#8a6729":"#326a76"}>{m.label?m.label+" · ":""}{distance} mm</text></g>})}{snapHint&&<g pointerEvents="none"><circle cx={snapHint.x} cy={snapHint.y} r="105" fill="rgba(215,167,78,.18)" stroke="#d7a74e" strokeWidth="26"/><circle cx={snapHint.x} cy={snapHint.y} r="24" fill="#d7a74e"/><text x={snapHint.x+130} y={snapHint.y-105} fontSize="82" fontWeight="700" fill="#8a6729">{snapHint.label||"Snap"}</text></g>}{draft&&<><circle cx={draft.x} cy={draft.y} r="55" fill="#9b7a39"/><text x={draft.x+90} y={draft.y-80} fontSize="90">Neste veggpunkt</text></>}{measureDraft&&<><circle cx={measureDraft.x} cy={measureDraft.y} r="45" fill="#326a76"/><text x={measureDraft.x+80} y={measureDraft.y-60} fontSize="85" fill="#326a76">Velg endepunkt</text></>}
   </svg></div>
    {surveyReportRooms.length>0&&<section className={styles.printRoomReport}>
     <div className={styles.printReportTitle}><div><span>BEFARINGSRAPPORT</span><h2>Rom-for-rom målegrunnlag</h2></div><b>{overallSurveyProgress.done}/{overallSurveyProgress.total} rom ferdig</b></div>
     {surveyReportRooms.map(room=><article className={styles.printRoomCard} key={room.id}>
      <header><div><span>ROM {room.index}</span><h3>{room.name}</h3></div><strong className={room.state.finished?styles.printStatusDone:room.state.stale?styles.printStatusStale:styles.printStatusPending}>{room.state.finished?"FERDIG":room.state.stale?"MÅ SJEKKES":"GJENSTÅR"}</strong></header>
      <div className={styles.printRoomFacts}><span><small>Gulv/tak</small><b>{room.area.toFixed(2)} m²</b></span><span><small>Omkrets</small><b>{room.perimeter.toFixed(2)} m</b></span><span><small>Takhøyde</small><b>{room.ceilingHeight} mm</b></span><span><small>Netto list</small><b>{room.netSkirtingM.toFixed(2)} lm</b></span><span><small>Brutto vegg</small><b>{room.grossWallM2.toFixed(2)} m²</b></span><span><small>Åpninger</small><b>{room.openingM2.toFixed(2)} m²</b></span><span><small>Netto vegg</small><b>{room.netWallM2.toFixed(2)} m²</b></span><span><small>Kontroll</small><b>{zoneSurveyStatusText(room.state)}</b></span>{room.floorFinish&&<span><small>Gulv/overflate</small><b>{room.floorFinish}</b></span>}</div>
      {room.diagonals.length===2&&<div className={styles.printDiagonals}><strong>Diagonaler</strong><span>A: beregnet {room.diagonals[0]} mm{room.measuredDiagonals[0]?" · målt "+room.measuredDiagonals[0]+" mm · avvik "+(room.measuredDiagonals[0]-room.diagonals[0])+" mm":""}</span><span>B: beregnet {room.diagonals[1]} mm{room.measuredDiagonals[1]?" · målt "+room.measuredDiagonals[1]+" mm · avvik "+(room.measuredDiagonals[1]-room.diagonals[1])+" mm":""}</span></div>}
      {room.wallRows.length>0&&<table className={styles.printWallTable}><thead><tr><th>Vegg</th><th>Lengde</th><th>Retning</th><th>Hjørne</th><th>H / T</th><th>Målt</th><th>Åpninger / plassering</th></tr></thead><tbody>{room.wallRows.map(wall=><tr key={wall.id}><td>{wall.index}</td><td>{wall.length} mm</td><td>{wall.angle}°</td><td>{wall.corner==null?"—":wall.corner+"°"}</td><td>{wall.height} / {wall.thickness} mm</td><td>{wall.surveyed?"Ja":"Nei"}</td><td>{wall.openings.length?wall.openings.map(opening=><div key={opening.id}><b>{opening.label} {opening.width} mm</b> · start {opening.start} · slutt {opening.end}{opening.openingHeight?" · høyde "+opening.openingHeight:""}{opening.sillHeight!=null?" · brystning "+opening.sillHeight:""}{opening.flip?" · speilet":""}</div>):"—"}</td></tr>)}</tbody></table>}
      {(room.zoneNotes||room.surveyNotes)&&<div className={styles.printRoomNotes}>{room.zoneNotes&&<><strong>Romnotat</strong><p>{room.zoneNotes}</p></>}{room.surveyNotes&&<><strong>Befaringsnotat</strong><p>{room.surveyNotes}</p></>}</div>}
     </article>)}
     {surveyReportMeasurements.length>0&&<section className={styles.printLooseMeasures}><h3>Frie mål</h3><div>{surveyReportMeasurements.map(m=><span key={m.id}><b>{m.label}</b><strong>{m.distance} mm</strong></span>)}</div></section>}
    </section>}
   </section>
   <aside ref={rightPanel} className={styles.panel+" "+styles.right}><h2>Egenskaper</h2>{!sel?<p className={styles.muted}>Velg et objekt, en vegg eller en romsone. Møbler og innredning holdes automatisk innenfor romkonturen og kan slippes helt inntil vegg/hjørne. Dører, vinduer og veggmonterte EL-punkter fester seg til vegg.</p>:selected.kind==="zone"?<><h3>{sel.name||"Romsone"}</h3><div className={styles.field}><label>Romnavn</label><input value={sel.name||""} onChange={e=>updateZoneField("name",e.target.value)}/></div><div className={styles.field}><label>Takhøyde (mm)</label><input type="number" min="300" value={Number(sel.ceilingHeight)||Number(doc.defaultWallHeight)||2400} onChange={e=>updateZoneField("ceilingHeight",e.target.value,true)}/></div><div className={styles.field}><label>Gulv / overflate</label><input value={sel.floorFinish||""} onChange={e=>updateZoneField("floorFinish",e.target.value)} placeholder="F.eks. flis, parkett, vinyl"/></div><div className={styles.field}><label>Romnotat</label><textarea className={styles.textarea} value={sel.notes||""} onChange={e=>updateZoneField("notes",e.target.value)}/></div><p className={styles.muted}>Gulv/tak: <b>{polygonAreaM2(sel.points).toFixed(2)} m²</b><br/>Brutto listelengde: <b>{polygonPerimeterM(sel.points).toFixed(2)} lm</b>{selectedRoomQuantity&&<><br/>Netto listelengde: <b>{selectedRoomQuantity.netSkirtingM.toFixed(2)} lm</b><br/>Brutto veggflate: <b>{selectedRoomQuantity.grossWallM2.toFixed(2)} m²</b><br/>Åpningsareal: <b>{selectedRoomQuantity.openingM2.toFixed(2)} m²</b><br/>Netto veggflate: <b>{selectedRoomQuantity.netWallM2.toFixed(2)} m²</b></>}<br/>Geometri: <b>{selectedRoomDiagnostics.closed?"Lukket":"Åpen "+selectedRoomDiagnostics.maxGap+" mm"}</b><br/>Befaring: <b>{selectedSurveyProgress.done}/{selectedSurveyProgress.total} vegger målt</b>{selectedRoomDiagnostics.diagonals.length===2&&<><br/>Diagonaler: <b>{selectedRoomDiagnostics.diagonals[0]} / {selectedRoomDiagnostics.diagonals[1]} mm</b></>}</p><div className={styles.roomSurveyEditor} data-ready={selectedSurveyState.ready?"true":"false"} data-stale={selectedSurveyState.stale?"true":"false"}><h4>{selectedSurveyState.finished?"✓ Rom ferdig":selectedSurveyState.stale?"↻ Må kontrolleres igjen":selectedSurveyState.ready?"Klar for fullføring":"Befaring pågår"}</h4><small>{selectedSurveyState.finished?"Ingen relevante mål er endret etter siste godkjenning.":zoneSurveyStatusText(selectedSurveyState)}</small><textarea defaultValue={sel.roomSurveyNotes||""} placeholder="Romnotat fra befaring…" onBlur={e=>updateZoneField("roomSurveyNotes",e.target.value)}/><div><button type="button" disabled={!selectedSurveyState.ready} onClick={selectedSurveyState.finished?reopenRoomSurvey:completeRoomSurvey}>{selectedSurveyState.finished?"Åpne igjen":selectedSurveyState.stale?"Godkjenn på nytt":"Fullfør rom"}</button><button type="button" onClick={nextSurveyRoom}>Neste rom →</button></div></div>{selectedRoomDiagnostics.diagonals.length===2&&<div className={styles.diagonalEditor}><h4>Diagonalkontroll</h4>{[0,1].map(index=>{const key=index===0?"diagonal1Measured":"diagonal2Measured",measured=Number(sel[key]),calculated=selectedRoomDiagnostics.diagonals[index],has=Number.isFinite(measured)&&measured>0,diff=has?Math.round(measured-calculated):null;return <label key={key}><span>Diagonal {index===0?"A":"B"} · beregnet {calculated} mm</span><input type="number" min="100" placeholder={String(calculated)} defaultValue={has?Math.round(measured):""} onBlur={e=>updateZoneField(key,e.target.value,true)}/>{has&&<small className={Math.abs(diff)<=20?styles.diagOk:styles.diagWarn}>{diff===0?"Treffer nøyaktig":(diff>0?"+":"")+diff+" mm avvik"}</small>}</label>})}</div>}{selectedZoneWalls.length>0&&<div className={styles.roomConstructionEditor}><h4>Romkonstruksjon</h4><label>Vegghøyde<input type="number" min="300" max="6000" defaultValue={Math.round(selectedZoneWalls[0]?.h||sel.ceilingHeight||2400)} onBlur={e=>updateZoneField("ceilingHeight",e.target.value,true)}/></label><label>Veggtykkelse<input type="number" min="40" max="600" defaultValue={Math.round(selectedZoneWalls[0]?.t||98)} onBlur={e=>updateRoomWalls("t",e.target.value)}/></label><div className={styles.roomCornerList}>{selectedRoomDiagnostics.corners.map((value,index)=><span key={index}><b>{index+1}</b>{value}°</span>)}</div></div>}{selectedZoneWalls.length>0&&<div className={styles.roomWallEditor}><h4>Veggmål i rommet</h4>{selectedZoneWalls.map((wall,index)=><div className={styles.roomWallEditorRow} key={wall.id}><button type="button" onClick={()=>setSelected({kind:"wall",id:wall.id})}>{index+1}</button><span>Vegg {index+1}<small>{angle(wall)}° · hjørne {selectedRoomDiagnostics.corners[index]??"–"}°</small></span><input key={"dw-"+wall.id+"-"+len(wall)} type="number" min="100" max="12000" defaultValue={len(wall)} onBlur={e=>updateWallById(wall.id,"len",e.target.value)}/><input className={styles.roomWallAngleInput} key={"da-"+wall.id+"-"+angle(wall)} type="number" step="0.1" defaultValue={angle(wall)} onBlur={e=>updateWallById(wall.id,"angle",e.target.value)}/><button type="button" className={(sel.surveyedWallIds||[]).includes(wall.id)?styles.roomWallChecked:styles.roomWallCheck} onClick={()=>toggleSurveyedWall(wall.id)}>{(sel.surveyedWallIds||[]).includes(wall.id)?"✓":"○"}</button>{(()=>{const layout=wallOpeningLayout(wall,doc.items);return layout.rows.length?<div className={styles.roomWallOpeningList} data-overlap={layout.overlap?"true":"false"}><div className={styles.roomWallChain}>{layout.parts.map(part=><span key={part.item.id}>{part.gap>0&&<em>{part.gap}</em>}<b>{labelFor(part.item.type)} {Math.round(part.item.w)}</b></span>)}{layout.endGap>0&&<em>{layout.endGap}</em>}</div>{layout.rows.map(({item,gaps})=><button type="button" key={item.id} onClick={()=>setSelected({kind:"item",id:item.id})}><span>{labelFor(item.type)} · {Math.round(item.w)} mm</span><b>{gaps.start} mm fra start</b></button>)}{layout.overlap&&<small>⚠ Overlapp må korrigeres</small>}</div>:null})()}</div>)}<small className={styles.muted}>Nummer + pil i tegningen viser måleretningen. Åpningsmål «fra start» følger denne retningen. Endring flytter neste hjørne; kontroller siste vegg til slutt.</small></div>}<p className={styles.muted}>De markerte hjørnepunktene i tegningen kan dras for å finjustere sonen etter befaringen.</p></>:selected.kind==="measurement"?<><h3>Mål</h3><div className={styles.field}><label>Navn / notat</label><input value={sel.label||""} onChange={e=>updateMeasurementField("label",e.target.value)} placeholder="F.eks. vegg til vindu"/></div><p className={styles.muted}>Avstand: <b>{Math.round(Math.hypot(sel.x2-sel.x1,sel.y2-sel.y1))} mm</b></p><p className={styles.muted}>Målelinjen kan slettes uten å fjerne de andre målene.</p></>:selected.kind==="wall"?<><h3>Vegg</h3><div className={styles.field}><label>Standard veggtype</label><select className={styles.select} value="" onChange={e=>applyWallPreset(e.target.value)}><option value="">Velg veggtype…</option>{wallPresets.map(([label,t,h])=><option key={label} value={t+"x"+h}>{label}</option>)}</select></div><div className={styles.field}><label>Startpunkt X (mm)</label><input type="number" value={Math.round(sel.x1)} onChange={e=>update("x1",e.target.value)}/></div><div className={styles.field}><label>Startpunkt Y (mm)</label><input type="number" value={Math.round(sel.y1)} onChange={e=>update("y1",e.target.value)}/></div>{[["Lengde (mm)","len",len(sel)],["Vinkel (grader)","angle",angle(sel)],["Tykkelse (mm)","t",sel.t],["Høyde (mm)","h",sel.h]].map(([l,k,v])=><div className={styles.field} key={k}><label>{l}</label><input type="number" value={v} onChange={e=>update(k,e.target.value)}/></div>)}<div className={styles.field}><label>Hurtigvinkel</label><div className={styles.row}>{[0,90,180,270].map(value=><button type="button" key={value} className={Math.abs(angle(sel)-value)<.1?styles.activeBtn:styles.btn} onClick={()=>update("angle",value)}>{value}°</button>)}</div><small className={styles.muted}>Startpunktet beholdes når lengde eller vinkel endres. Dører, vinduer og veggmonterte objekter følger med.</small><div className={styles.row}><button type="button" className={styles.activeBtn} onClick={()=>openWallView(sel.id)}>Veggvisning</button><button type="button" className={styles.btn} onClick={()=>openFurnitureBuilder(sel.id)}>+ Bygg møbel</button></div></div></>:<><h3>{sel.customName||labelFor(sel.type)}</h3>{sizePresets[sel.type]?.length>0&&<div className={styles.field}><label>Standardmål</label><select className={styles.select} value="" onChange={e=>applySizePreset(e.target.value)}><option value="">Velg standardmål…</option>{sizePresets[sel.type].map(([label,w,h])=><option key={label+"-"+w+"-"+h} value={w+"x"+h}>{label}</option>)}</select><small className={styles.muted}>Standardmålet beholder objektets senterpunkt. Du kan fortsatt finjustere målene under.</small></div>}{openingTypes.has(sel.type)&&<><div className={styles.field}><label>{sel.type==="window"?"Vindushøyde (mm)":"Åpningshøyde (mm)"}</label><input type="number" min="100" value={Math.round(Number(sel.openingHeight)||openingDefaults(sel.type).openingHeight||2100)} onChange={e=>update("openingHeight",e.target.value)}/></div>{sel.type==="window"&&<div className={styles.field}><label>Brystningshøyde (mm)</label><input type="number" min="0" value={Math.round(Number(sel.sillHeight)||0)} onChange={e=>update("sillHeight",e.target.value)}/><small className={styles.muted}>Avstand fra ferdig gulv til underkant vindu.</small></div>}</>}{wallElectricalTypes.has(sel.type)&&<div className={styles.field}><label>Monteringshøyde (mm)</label><input type="number" min="0" max="5000" value={Math.round(Number(sel.mountHeight)||0)} onChange={e=>update("mountHeight",e.target.value)}/><small className={styles.muted}>Høyde fra ferdig gulv til punktet.</small></div>}{ceilingElectricalTypes.has(sel.type)&&<div className={styles.field}><label>Plassering</label><p className={styles.muted}><b>Takpunkt · {itemCeilingHeight(sel,doc)} mm</b><br/>Høyden følger rommets takhøyde.</p></div>}{electricalTypes.has(sel.type)&&<><div className={styles.field}><label>Kurs / gruppe</label><input value={sel.circuit||""} onChange={e=>updateItemText("circuit",e.target.value)} placeholder="F.eks. Kurs 10 / Lys stue"/></div><div className={styles.field}><label>EL-notat</label><textarea className={styles.textarea} value={sel.itemNote||""} onChange={e=>updateItemText("itemNote",e.target.value)} placeholder="F.eks. dimbar, styres fra to steder, dobbel stikk…"/></div></>}{["customwall","customfloor"].includes(sel.type)&&<><div className={styles.field}><label>Møbelnavn</label><input value={sel.customName||"Eget møbel"} onChange={e=>updateItemText("customName",e.target.value)}/></div><div className={styles.field}><label>Inndeling</label><div className={styles.row}><input type="number" min="1" max="8" value={Math.round(Number(sel.sectionsX)||1)} onChange={e=>update("sectionsX",e.target.value)} title="Felt bortover"/><input type="number" min="1" max="6" value={Math.round(Number(sel.sectionsY)||1)} onChange={e=>update("sectionsY",e.target.value)} title="Felt i høyden"/></div><small className={styles.muted}>Første felt er antall seksjoner bortover, andre er antall i høyden.</small></div></>}{!electricalTypes.has(sel.type)&&!openingTypes.has(sel.type)&&<><div className={styles.field}><label>3D-høyde (mm)</label><input type="number" min="50" max="5000" value={Math.round(modelHeight(sel))} onChange={e=>update("modelHeight",e.target.value)}/></div><div className={styles.field}><label>Høyde over gulv (mm)</label><input type="number" min="0" max="5000" value={Math.round(Number(sel.elevation)||0)} onChange={e=>update("elevation",e.target.value)}/><small className={styles.muted}>Bruk f.eks. høyde over gulv for overskap og veggmontert TV i 3D-visningen.</small></div></>}{[["Bredde (mm)","w"],["Dybde/lengde (mm)","h"],["X-posisjon (mm)","x"],["Y-posisjon (mm)","y"],["Rotasjon (grader)","rot"]].map(([l,k])=><div className={styles.field} key={k}><label>{l}</label><input type="number" value={Math.round(sel[k])} onChange={e=>update(k,e.target.value)}/></div>)}{sel.wallId&&doc.walls.find(w=>w.id===sel.wallId)&&(()=>{const wall=doc.walls.find(w=>w.id===sel.wallId),gaps=wallEdgeOffsets(sel,wall),maxGap=Math.max(0,gaps.L-Math.max(0,Number(sel.w)||0));return <div className={styles.field}><label>Plassering på vegg</label>{gaps.tooWide&&<p className={styles.muted}><b>Obs:</b> Objektet er bredere enn veggen og kan ikke plasseres helt innenfor.</p>}<label>Fra start/hjørne til nærmeste objektkant (mm)</label><input type="number" min="0" max={maxGap} value={gaps.start} onChange={e=>update("wallStartGap",e.target.value)}/><label>Fra motsatt objektkant til veggslutt (mm)</label><input type="number" min="0" max={maxGap} value={gaps.end} onChange={e=>update("wallEndGap",e.target.value)}/><small className={styles.muted}>Begge målene går til objektets kant, ikke senter. Objektet holdes automatisk innenfor veggen når det er plass.</small></div>})()}<div className={styles.row}>{sel.type==="door"&&<button className={styles.btn} onClick={flipDoor}>Speil slagretning</button>}{sel.wallId&&!wallElectricalTypes.has(sel.type)&&<button className={styles.btn} onClick={detach}>Løsne fra vegg</button>}<button className={styles.btn} onClick={duplicate}>Dupliser</button></div></>} {sel&&<button className={styles.btn+" "+styles.danger} onClick={remove}>Slett valgt</button>}
    <div className={styles.group+" "+styles.ai}><h2>Tegningsinfo</h2><p className={styles.muted}>Oppdrag: <b>{projectLabel}</b><br/>Målestokk for utskrift: <b>{doc.scale||"1:50"}</b><br/>Alle oppgitte mål er i millimeter.</p></div><div className={styles.group+" "+styles.ai}><h2>Mengder fra tegning</h2><p className={styles.muted}>Vegger: <b>{summary.wallM.toFixed(2)} lm</b><br/>Brutto veggflate: <b>{summary.wallM2.toFixed(2)} m²</b><br/>Åpningsareal i vegg: <b>{summary.openingM2.toFixed(2)} m²</b><br/>Netto veggflate: <b>{summary.netWallM2.toFixed(2)} m²</b><br/>Gulvareal lukket rom: <b>{summary.floorM2==null?"—":summary.floorM2.toFixed(2)+" m²"}</b><br/>Terrassefelt: <b>{summary.deckM2.toFixed(2)} m²</b><br/>Dører/skyvedører: <b>{summary.doors}</b><br/>Vinduer: <b>{summary.windows}</b><br/>Stolper: <b>{summary.posts}</b><br/>EL-punkter: <b>{summary.electrical}</b><br/>LED-stripe: <b>{summary.ledM.toFixed(2)} lm</b><br/>Objekter totalt: <b>{summary.objects}</b>{summary.zoneRows.length>0&&<><br/><br/>Romsoner: <b>{summary.zoneRows.length}</b><br/>Samlet gulv/tak: <b>{summary.zonedFloorM2.toFixed(2)} m²</b><br/>Brutto listelengde: <b>{summary.zonePerimeterM.toFixed(2)} lm</b><br/>Brutto rom-veggflate: <b>{summary.zoneWallM2.toFixed(2)} m²</b></>}</p>{summary.zoneRows.length>0&&<div className={styles.zoneList}>{summary.zoneRows.map(z=><button type="button" key={z.id} onClick={()=>setSelected({kind:"zone",id:z.id})}><span>{z.name||"Rom"}</span><b>{z.area.toFixed(2)} m²</b></button>)}</div>}</div><div className={styles.group+" "+styles.ai}><h2>AI-visualisering</h2><p className={styles.muted}>Bruk plantegningen som målgrunnlag sammen med kundebilde i ChatGPT. Briefen inkluderer vegger, åpninger, høyder, standardmål og plasseringer.</p><div className={styles.field}><label>Ønsket uttrykk / endringer</label><textarea className={styles.textarea} value={doc.visualizationNotes||""} onChange={e=>setDoc(d=>({...d,visualizationNotes:e.target.value}))} placeholder="F.eks. lyse eikefronter, beige fliser, behold vinduene, fjern overskap på høyre vegg…"/></div><div className={styles.row}><button type="button" className={styles.activeBtn} onClick={prepareChatGptPackage}>Klargjør for ChatGPT</button><button type="button" className={styles.btn} onClick={exportPng}>Bare PNG</button><button type="button" className={styles.btn} onClick={()=>copyAiBrief()}>Bare brief</button></div><p className={styles.muted}>«Klargjør for ChatGPT» eksporterer tegningen som PNG og kopierer den detaljerte briefen. Legg ved PNG-en og eventuelle kundebilder i ChatGPT, og lim inn briefen. AI-bildet er en illustrasjon; målene i tegningen er fortsatt teknisk grunnlag.</p></div>
   </aside>
  </div>
 </main>
}