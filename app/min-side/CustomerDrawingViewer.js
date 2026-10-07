"use client";

import {useMemo,useRef,useState} from "react";

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pointsAttr=points=>points.map(p=>p.x+","+p.y).join(" ");
const wallLength=w=>Math.max(1,Math.hypot((Number(w.x2)||0)-(Number(w.x1)||0),(Number(w.y2)||0)-(Number(w.y1)||0)));
const itemHeight=item=>Math.max(80,Number(item?.modelHeight)||({
 bed:550,nightstand:550,dresser:900,desk:750,bookshelf:1900,vanity:780,armchair:900,ottoman:450,headboard:1200,
 wardrobe:2100,sofa:850,table:750,chair:900,tv:750,base:900,wallcab:700,tallcab:2200,fridge:2000,oven:900,dishwasher:850,island:900
})[item?.type]||600);
const electrical=new Set(["ceilinglight","downlight","ledstrip","walllight","outlet","doubleoutlet","switch","dimmer","thermostat","junction"]);
const wallElectrical=new Set(["walllight","outlet","doubleoutlet","switch","dimmer","thermostat"]);
const ceilingElectrical=new Set(["ceilinglight","downlight","ledstrip","junction"]);
const openingTypes=new Set(["door","sliding","window","opening"]);
const customCellTypes=["open","door","drawer","shelf"];
const customDimArray=(count,total,source=[])=>{
 count=Math.max(1,Math.round(Number(count)||1));total=Math.max(count*50,Math.round(Number(total)||count*100));
 const valid=Array.isArray(source)&&source.length===count&&source.every(v=>Number(v)>=50);
 if(valid){const sum=source.reduce((a,b)=>a+Number(b),0)||1;let used=0;return source.map((v,i)=>{if(i===count-1)return Math.max(50,total-used);const n=Math.max(50,Math.round(Number(v)*total/sum));used+=n;return n})}
 const base=Math.floor(total/count),out=Array(count).fill(base);out[count-1]+=total-base*count;return out;
};
const customCells=item=>{
 const cols=Math.max(1,Math.min(8,Math.round(Number(item?.sectionsX)||1))),rows=Math.max(1,Math.min(6,Math.round(Number(item?.sectionsY)||1))),count=cols*rows,source=Array.isArray(item?.cellTypes)?item.cellTypes:[];
 const colWidths=customDimArray(cols,Math.max(100,Number(item?.w)||1000),item?.colWidths),rowHeights=customDimArray(rows,Math.max(50,itemHeight(item)),item?.rowHeights),cwTotal=colWidths.reduce((a,b)=>a+b,0)||1,rhTotal=rowHeights.reduce((a,b)=>a+b,0)||1;
 const colEdges=[0],rowEdges=[0];for(const v of colWidths)colEdges.push(colEdges.at(-1)+v/cwTotal);for(const v of rowHeights)rowEdges.push(rowEdges.at(-1)+v/rhTotal);
 return {cols,rows,cells:Array.from({length:count},(_,i)=>customCellTypes.includes(source[i])?source[i]:"open"),colEdges,rowEdges};
};
const polygonSignedArea=points=>{let area=0;for(let i=0;i<(points||[]).length;i++){const a=points[i],b=points[(i+1)%points.length];area+=(Number(a.x)||0)*(Number(b.y)||0)-(Number(b.x)||0)*(Number(a.y)||0)}return area/2};
function wallInwardNormal(wall,zones=[]){
 const zone=(zones||[]).find(z=>Array.isArray(z.wallIds)&&z.wallIds.includes(wall?.id));
 if(!zone)return{x:0,y:0};
 const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,L=Math.hypot(dx,dy)||1,ccw=polygonSignedArea(zone.points||[])>=0;
 return ccw?{x:-dy/L,y:dx/L}:{x:dy/L,y:-dx/L};
}

function rotatedCorners(item){
 const w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),cx=(Number(item.x)||0)+w/2,cy=(Number(item.y)||0)+h/2,a=(Number(item.rot)||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>({x:cx+x*c-y*s,y:cy+x*s+y*c}));
}
function wallPrism(w){
 const dx=(Number(w.x2)||0)-(Number(w.x1)||0),dy=(Number(w.y2)||0)-(Number(w.y1)||0),L=Math.hypot(dx,dy)||1,half=Math.max(20,Number(w.t)||98)/2,nx=-dy/L,ny=dx/L;
 return [
  {x:(Number(w.x1)||0)+nx*half,y:(Number(w.y1)||0)+ny*half},
  {x:(Number(w.x2)||0)+nx*half,y:(Number(w.y2)||0)+ny*half},
  {x:(Number(w.x2)||0)-nx*half,y:(Number(w.y2)||0)-ny*half},
  {x:(Number(w.x1)||0)-nx*half,y:(Number(w.y1)||0)-ny*half}
 ];
}
function planBounds(doc){
 const xs=[],ys=[];
 for(const w of doc.walls||[]){xs.push(Number(w.x1)||0,Number(w.x2)||0);ys.push(Number(w.y1)||0,Number(w.y2)||0)}
 for(const z of doc.zones||[])for(const p of z.points||[]){xs.push(Number(p.x)||0);ys.push(Number(p.y)||0)}
 for(const item of doc.items||[])for(const p of rotatedCorners(item)){xs.push(p.x);ys.push(p.y)}
 if(!xs.length)return{x:0,y:0,w:4000,h:3000,cx:2000,cy:1500};
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),pad=Math.max(250,Math.max(maxX-minX,maxY-minY)*.06);
 return{x:minX-pad,y:minY-pad,w:Math.max(800,maxX-minX+pad*2),h:Math.max(800,maxY-minY+pad*2),cx:(minX+maxX)/2,cy:(minY+maxY)/2};
}
function cameraProject(x,y,z,camera,origin){
 const yaw=(Number(camera.yaw)||0)*Math.PI/180,pitch=clamp(Number(camera.pitch)||35,8,78)*Math.PI/180,zoom=clamp(Number(camera.zoom)||1,.55,2.4);
 const dx=(Number(x)||0)-origin.x,dy=(Number(y)||0)-origin.y,rx=dx*Math.cos(yaw)-dy*Math.sin(yaw),ry=dx*Math.sin(yaw)+dy*Math.cos(yaw);
 return{x:rx*zoom,y:(ry*Math.sin(pitch)-(Number(z)||0)*Math.cos(pitch))*zoom,depth:ry*Math.cos(pitch)+(Number(z)||0)*Math.sin(pitch)};
}
function ceilingHeight(item,doc){
 const fallback=Number(doc.defaultWallHeight)||2400;
 return wallElectrical.has(item.type)?Number(item.mountHeight)||1200:ceilingElectrical.has(item.type)?fallback:itemHeight(item);
}
function FurnitureFront({item,a,b,z0,height,project,prefix}){
 const {cols,rows,cells,colEdges,rowEdges}=customCells(item),point=(t,z)=>project(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,z);
 return <g>{cells.map((type,i)=>{
  const col=i%cols,row=Math.floor(i/cols),t0=colEdges[col],t1=colEdges[col+1],zTop=z0+height*(1-rowEdges[row]),zBottom=z0+height*(1-rowEdges[row+1]);
  const p0=point(t0,zBottom),p1=point(t1,zBottom),p2=point(t1,zTop),p3=point(t0,zTop),mid=point((t0+t1)/2,(zTop+zBottom)/2);
  return <g key={prefix+"-"+i}>
   <polygon points={pointsAttr([p0,p1,p2,p3])} fill={type==="open"?"rgba(88,69,45,.18)":type==="drawer"?"rgba(222,193,143,.92)":"rgba(235,216,180,.94)"} stroke="#665136" strokeWidth="6"/>
   {type==="door"&&<><line x1={p3.x+(p2.x-p3.x)*.08} y1={p3.y+(p2.y-p3.y)*.08} x2={p0.x+(p1.x-p0.x)*.08} y2={p0.y+(p1.y-p0.y)*.08} stroke="#8c7047" strokeWidth="5"/><circle cx={mid.x+(p2.x-p3.x)*.35} cy={mid.y+(p2.y-p3.y)*.35} r="8" fill="#4b3923"/></>}
   {type==="drawer"&&[.25,.5,.75].map((q,n)=>{const l=point(t0,zBottom+(zTop-zBottom)*q),rr=point(t1,zBottom+(zTop-zBottom)*q);return <line key={n} x1={l.x} y1={l.y} x2={rr.x} y2={rr.y} stroke="#80633f" strokeWidth="5"/>})}
   {type==="shelf"&&[1/3,2/3].map((q,n)=>{const l=point(t0,zBottom+(zTop-zBottom)*q),rr=point(t1,zBottom+(zTop-zBottom)*q);return <line key={n} x1={l.x} y1={l.y} x2={rr.x} y2={rr.y} stroke="#725736" strokeWidth="7"/>})}
   {type==="open"&&<text x={mid.x} y={mid.y+12} textAnchor="middle" fontSize="32" fontWeight="900" fill="#6d593c">ÅPEN</text>}
  </g>
 })}</g>;
}

function PlanView({doc}){
 const b=planBounds(doc);
 return <svg viewBox={[b.x,b.y,b.w,b.h].join(" ")} role="img" aria-label="Plantegning">
  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fbfaf7"/>
  {(doc.zones||[]).map(z=><polygon key={z.id} points={pointsAttr((z.points||[]).map(p=>({x:Number(p.x)||0,y:Number(p.y)||0})))} fill="#f2eee5" stroke="#d0c7b7" strokeWidth="20"/>)}
  {(doc.walls||[]).map((w,i)=><g key={w.id}><line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#403d37" strokeWidth={Math.max(35,Number(w.t)||98)} strokeLinecap="square"/><text x={(Number(w.x1)+Number(w.x2))/2} y={(Number(w.y1)+Number(w.y2))/2-80} textAnchor="middle" fontSize="90" fontWeight="800" fill="#736957">V{i+1}</text></g>)}
  {(doc.items||[]).filter(item=>!electrical.has(item.type)).map(item=>{
   const c=rotatedCorners(item),custom=["customwall","customfloor"].includes(item.type);
   if(!custom)return <polygon key={item.id} points={pointsAttr(c)} fill={openingTypes.has(item.type)?"#dfeaec":"#dcc598"} stroke="#6a5738" strokeWidth="18"/>;
   const {colEdges}=customCells(item);
   return <g key={item.id}><polygon points={pointsAttr(c)} fill="#dcc598" stroke="#6a5738" strokeWidth="18"/>{colEdges.slice(1,-1).map((edge,i)=>{const a={x:c[0].x+(c[1].x-c[0].x)*edge,y:c[0].y+(c[1].y-c[0].y)*edge},b={x:c[3].x+(c[2].x-c[3].x)*edge,y:c[3].y+(c[2].y-c[3].y)*edge};return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8d7249" strokeWidth="11"/>})}</g>;
  })}
  {(doc.items||[]).filter(item=>electrical.has(item.type)).map(item=>{
   if(item.type==="ledstrip")return <polygon key={item.id} points={pointsAttr(rotatedCorners(item))} fill="#fff0a8" stroke="#8c6b1f" strokeWidth="16"/>;
   const cx=(Number(item.x)||0)+(Number(item.w)||0)/2,cy=(Number(item.y)||0)+(Number(item.h)||0)/2;
   return <circle key={item.id} cx={cx} cy={cy} r="70" fill="#f1d66d" stroke="#80631f" strokeWidth="16"/>;
  })}
 </svg>;
}

function ThreeDView({doc,camera}){
 const b=planBounds(doc),origin={x:b.cx,y:b.cy},project=(x,y,z=0)=>cameraProject(x,y,z,camera,origin);
 const projected=[];
 const add=(x,y,z=0)=>projected.push(project(x,y,z));
 for(const z of doc.zones||[])for(const p of z.points||[]){add(p.x,p.y,0);add(p.x,p.y,Number(z.ceilingHeight)||Number(doc.defaultWallHeight)||2400)}
 for(const w of doc.walls||[]){const h=Number(w.h)||2400;for(const p of wallPrism(w)){add(p.x,p.y,0);add(p.x,p.y,h)}}
 for(const item of doc.items||[]){const h=ceilingHeight(item,doc),z0=electrical.has(item.type)?h:Math.max(0,Number(item.elevation)||0);for(const p of rotatedCorners(item)){add(p.x,p.y,z0);if(!electrical.has(item.type))add(p.x,p.y,z0+itemHeight(item))}}
 if(!projected.length)projected.push({x:-500,y:-300},{x:500,y:300});
 const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y)),pad=Math.max(250,(maxX-minX+maxY-minY)*.05);
 const viewBox=[minX-pad,minY-pad,Math.max(900,maxX-minX+pad*2),Math.max(700,maxY-minY+pad*2)].join(" ");
 const wallRows=[...(doc.walls||[])].sort((a,b)=>project((a.x1+a.x2)/2,(a.y1+a.y2)/2,0).depth-project((b.x1+b.x2)/2,(b.y1+b.y2)/2,0).depth);
 const itemRows=[...(doc.items||[])].sort((a,b)=>project((Number(a.x)||0)+(Number(a.w)||0)/2,(Number(a.y)||0)+(Number(a.h)||0)/2,0).depth-project((Number(b.x)||0)+(Number(b.w)||0)/2,(Number(b.y)||0)+(Number(b.h)||0)/2,0).depth);
 return <svg viewBox={viewBox} role="img" aria-label="Dreibar 3D-visning">
  {(doc.zones||[]).map(z=><polygon key={"f-"+z.id} points={pointsAttr((z.points||[]).map(p=>project(p.x,p.y,0)))} fill="#efe9dd" stroke="#c7bbab" strokeWidth="14"/>)}
  {wallRows.map(w=>{const h=Number(w.h)||2400,fp=wallPrism(w),base=fp.map(p=>project(p.x,p.y,0)),top=fp.map(p=>project(p.x,p.y,h));return <g key={w.id}>
   <polygon points={pointsAttr([base[0],base[1],top[1],top[0]])} fill="#c8c1b5" stroke="#746d63" strokeWidth="10"/>
   <polygon points={pointsAttr([base[1],base[2],top[2],top[1]])} fill="#a9a195" stroke="#746d63" strokeWidth="10"/>
   <polygon points={pointsAttr([base[2],base[3],top[3],top[2]])} fill="#d7d1c7" stroke="#746d63" strokeWidth="10"/>
   <polygon points={pointsAttr(top)} fill="#ebe6dd" stroke="#746d63" strokeWidth="10"/>
  </g>})}
  {itemRows.map(item=>{
   const center={x:(Number(item.x)||0)+(Number(item.w)||0)/2,y:(Number(item.y)||0)+(Number(item.h)||0)/2};
   if(item.type==="ledstrip"){
    const z=ceilingHeight(item,doc)-12,top=rotatedCorners(item).map(p=>project(p.x,p.y,z));
    return <polygon key={item.id} points={pointsAttr(top)} fill="#ffe78a" stroke="#8b6a1f" strokeWidth="10"/>;
   }
   if(electrical.has(item.type)){
    const z=ceilingHeight(item,doc),p=project(center.x,center.y,z),size=80;
    return <polygon key={item.id} points={pointsAttr([{x:p.x,y:p.y-size},{x:p.x+size,y:p.y},{x:p.x,y:p.y+size},{x:p.x-size,y:p.y}])} fill="#efd86f" stroke="#7f6722" strokeWidth="10"/>;
   }
   if(openingTypes.has(item.type)){
    const a=(Number(item.rot)||0)*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),half=(Number(item.w)||0)/2,z0=item.type==="window"?Number(item.sillHeight)||0:0,z1=z0+(Number(item.openingHeight)||2100);
    return <polygon key={item.id} points={pointsAttr([project(center.x-ux*half,center.y-uy*half,z0),project(center.x+ux*half,center.y+uy*half,z0),project(center.x+ux*half,center.y+uy*half,z1),project(center.x-ux*half,center.y-uy*half,z1)])} fill={item.type==="window"?"#b9d9df":"#f2efe8"} stroke="#66615a" strokeWidth="10"/>;
   }
   const corners=rotatedCorners(item),z0=Math.max(0,Number(item.elevation)||0),h=itemHeight(item),base=corners.map(p=>project(p.x,p.y,z0)),top=corners.map(p=>project(p.x,p.y,z0+h)),custom=["customfloor","customwall"].includes(item.type);
   let frontA=corners[3],frontB=corners[2];
   if(item.type==="customwall"&&item.wallId){
    const wall=(doc.walls||[]).find(w=>w.id===item.wallId);
    if(wall){
     const inward=wallInwardNormal(wall,doc.zones||[]),a=(Number(item.rot)||0)*Math.PI/180,localY={x:-Math.sin(a),y:Math.cos(a)};
     if(localY.x*inward.x+localY.y*inward.y<0){frontA=corners[0];frontB=corners[1]}
    }
   }
   return <g key={item.id}><polygon points={pointsAttr([base[1],base[2],top[2],top[1]])} fill="#9f7e4d" stroke="#675337" strokeWidth="9"/><polygon points={pointsAttr([base[2],base[3],top[3],top[2]])} fill="#806440" stroke="#675337" strokeWidth="9"/><polygon points={pointsAttr(top)} fill="#d4b57d" stroke="#675337" strokeWidth="10"/>{custom&&<FurnitureFront item={item} a={frontA} b={frontB} z0={z0} height={h} project={project} prefix={"customer-front-"+item.id}/>}</g>;
  })}
 </svg>;
}

export default function CustomerDrawingViewer({drawing}){
 const doc=useMemo(()=>drawing?.drawingData&&typeof drawing.drawingData==="object"?drawing.drawingData:{},[drawing]);
 const [mode,setMode]=useState("3d");
 const [camera,setCamera]=useState({yaw:42,pitch:34,zoom:1});
 const drag=useRef(null);
 const pointerDown=e=>{if(mode!=="3d")return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:camera.yaw,pitch:camera.pitch};e.currentTarget.setPointerCapture?.(e.pointerId)};
 const pointerMove=e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;setCamera(c=>({...c,yaw:d.yaw+(e.clientX-d.x)*.35,pitch:clamp(d.pitch-(e.clientY-d.y)*.22,8,78)}))};
 const pointerUp=e=>{if(drag.current?.id===e.pointerId)drag.current=null;try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}};
 return <div className="customerDrawingViewer">
  <div className="customerDrawingControls">
   <button type="button" className={mode==="plan"?"isActive":""} onClick={()=>setMode("plan")}>Plantegning</button>
   <button type="button" className={mode==="3d"?"isActive":""} onClick={()=>setMode("3d")}>3D</button>
   {mode==="3d"&&<><button type="button" onClick={()=>setCamera(c=>({...c,yaw:c.yaw-20}))}>↺</button><button type="button" onClick={()=>setCamera(c=>({...c,yaw:c.yaw+20}))}>↻</button><button type="button" onClick={()=>setCamera(c=>({...c,zoom:clamp(c.zoom+.12,.55,2.4)}))}>+</button><button type="button" onClick={()=>setCamera(c=>({...c,zoom:clamp(c.zoom-.12,.55,2.4)}))}>−</button><button type="button" onClick={()=>setCamera({yaw:42,pitch:34,zoom:1})}>Nullstill</button></>}
  </div>
  <div className={"customerDrawingStage "+(mode==="3d"?"is3D":"")} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
   {mode==="3d"?<ThreeDView doc={doc} camera={camera}/>:<PlanView doc={doc}/>}
  </div>
  {mode==="3d"&&<p className="customerDrawingHint">Dra med finger eller mus for å snu tegningen. Bruk knappene for finjustering og zoom.</p>}
 </div>;
}
