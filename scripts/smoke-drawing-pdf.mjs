import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const pageCode=readFileSync("lib/drawingPdfPages.js","utf8").replace('import "server-only";',"");
const pageUrl="data:text/javascript;base64,"+Buffer.from(pageCode).toString("base64");
const pages=await import(pageUrl);
const reportCode=readFileSync("lib/drawingReportPdf.js","utf8")
 .replace('import "server-only";',"")
 .replace('from "./drawingPdfPages";','from "'+pageUrl+'";');
const report=await import("data:text/javascript;base64,"+Buffer.from(reportCode).toString("base64"));
import {centerlinePointsFromInner,offsetPolygon} from "../lib/roomInnerGeometry.mjs";

const drawingSource=readFileSync("app/admin/tegning/DrawingClient.js","utf8");
assert.ok(drawingSource.includes("const centerPoints=offsetPolygon(innerPoints,t/2,false)"),"entered inner room boundary must be offset outward to wall centerlines");
assert.ok(drawingSource.includes('dimensionMode:"inner",enteredInnerWidth:w,enteredInnerHeight:h'),"room must retain the exact entered inner dimensions");
assert.ok(drawingSource.includes("centerlinePointsFromInner(innerPoints,zone.wallIds"),"editing a room must preserve its inner face while updating wall centerlines");
assert.ok(drawingSource.includes("updateRoomInnerWallLength"),"room wall-length edits must go through the inner-dimension update path");
assert.ok(drawingSource.includes("rebuildLinkedRoomGeometry(d,zone,inner,{[wallId]:n})"),"wall thickness edits must rebuild centerlines from the existing inner boundary");
const innerRect=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
const wallIds=["top","right","bottom","left"];
const variedWalls=[
 {id:"top",t:100},{id:"right",t:120},{id:"bottom",t:80},{id:"left",t:60}
].map(w=>({...w,x1:0,y1:0,x2:0,y2:0}));
const centerlines=centerlinePointsFromInner(innerRect,wallIds,variedWalls,98);
assert.deepEqual(centerlines.map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),[
 {x:-30,y:-50},
 {x:4060,y:-50},
 {x:4060,y:3040},
 {x:-30,y:3040}
],"inner room dimensions must stay exact when each wall has its own thickness");
// Editing a wall thickness must move its centerline, not its finished inner face.
const thicknessChanged=centerlinePointsFromInner(innerRect,wallIds,variedWalls,98,{top:180});
const assertInnerFace=(lines,wallSpecs,label)=>{
 for(let i=0;i<lines.length;i++){
  const p=innerRect[i],q=innerRect[(i+1)%innerRect.length],dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy);
  const inward={x:-dy/L,y:dx/L},t=(wallSpecs.find(w=>w.id===wallIds[i])?.t??98),center=lines[i];
  const signed=(center.x-p.x)*inward.x+(center.y-p.y)*inward.y;
  assert.ok(Math.abs(signed+t/2)<0.01,label+" must preserve the exact inner face of wall "+wallIds[i]);
 }
};
assertInnerFace(centerlines,variedWalls,"mixed wall thicknesses");
assertInnerFace(thicknessChanged,variedWalls.map(w=>w.id==="top"?{...w,t:180}:w),"editing wall thickness");
// L-shaped rooms are also entered by their finished inner faces. Test the
// concave corner with mixed wall thicknesses, not just rectangular rooms.
const innerL=[
 {x:0,y:0},{x:5000,y:0},{x:5000,y:1600},
 {x:3200,y:1600},{x:3200,y:4000},{x:0,y:4000}
];
const lWallIds=["l-top","l-right","l-notch","l-inner","l-bottom","l-left"];
const lWallSpecs=lWallIds.map((id,i)=>({id,t:[98,120,80,140,98,60][i]}));
const lCenterlines=centerlinePointsFromInner(innerL,lWallIds,lWallSpecs,98);
for(let i=0;i<innerL.length;i++){
 const p=innerL[i],q=innerL[(i+1)%innerL.length],dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy);
 const inward={x:-dy/L,y:dx/L},center=lCenterlines[i],thickness=lWallSpecs[i].t;
 const signed=(center.x-p.x)*inward.x+(center.y-p.y)*inward.y;
 assert.ok(Math.abs(signed+thickness/2)<0.01,"L-room inner dimensions must remain exact at wall "+lWallIds[i]);
 const next=lCenterlines[(i+1)%innerL.length];
 assert.ok(Math.abs(Math.hypot(next.x-center.x,next.y-center.y)-L)<0.01,"L-room wall length must match the entered inner length for "+lWallIds[i]);
}
const centerline=offsetPolygon(innerRect,49,false);
assert.deepEqual(centerline.map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),[
 {x:-49,y:-49},
 {x:4049,y:-49},
 {x:4049,y:3049},
 {x:-49,y:3049}
],"wall centerline offset must be computed from the inner boundary");
const w=4000,h=3000;
const points=[{x:300,y:300},{x:4300,y:300},{x:4300,y:3300},{x:300,y:3300}];
const walls=points.map((p,i)=>({id:"wall-"+i,x1:p.x,y1:p.y,x2:points[(i+1)%4].x,y2:points[(i+1)%4].y,t:98,h:2400}));
const drawing={name:"Test av plan og vegger",customer:"Testkunde",walls,zones:[{name:"Stue",points,enteredInnerWidth:w,enteredInnerHeight:h}],items:[{id:"bed",type:"bed",x:700,y:1000,w:1800,h:2000,rot:0},{id:"window",type:"window",wallId:"wall-0",wallOffset:2000,w:1100,openingHeight:1200,sillHeight:900}]};
const streams=pages.drawingPageStreams(drawing);
assert.equal(streams.length,5,"Plantegning og fire veggtegninger");
assert.ok(streams[0].includes("PLANTEGNING"),"Plantegning mangler");
assert.ok(streams[1].includes("VEGGTEGNING 1"),"Veggtegning mangler");
const pdf=report.buildDrawingReportPdf(drawing);
assert.ok(pdf.subarray(0,8).toString("ascii")==="%PDF-1.4","PDF-header mangler");
assert.equal((pdf.toString("latin1").match(/\/Type \/Page \/Parent/g)||[]).length,5,"Feil antall PDF-sider");
assert.ok(pdf.toString("latin1").includes("%%EOF"),"PDF er ikke avsluttet");
console.log("PDF-sjekk bestått: 1 plantegning, 4 veggtegninger, 5 PDF-sider.");
