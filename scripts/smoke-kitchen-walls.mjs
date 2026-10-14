import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("lib/kitchenWallPresets.js","utf8");
const builder=readFileSync("app/admin/tegning/KitchenWallBuilder.js","utf8");
if(!builder.includes("validateKitchenCornerFit(value,{includeCabinets})"))throw new Error("Kitchen builder must reject corner cabinets that cannot fit within the entered wall runs.");
if(!builder.includes("fitMetodCabinetRun(")||!builder.includes("Forslag til METOD-benkeskap")||!source.includes("export function fitMetodCabinetRun("))throw new Error("Straight kitchen should use the shared tested METOD cabinet fitter.");
if(!source.includes("METOD_BASE_WIDTHS=[200,300,400,600,800,1000,1200]")||!builder.includes("run.fit.used")||!builder.includes("run.fit.target"))throw new Error("METOD row fit should use real module widths and report exact selected width and target wall length.");
if(!builder.includes("Plasser benkeskapene automatisk i tegningen"))throw new Error("Kitchen builder should offer automatic cabinet placement.");
const drawing=readFileSync("app/admin/tegning/DrawingClient.js","utf8");
if(!drawing.includes("config.cabinetRuns")||!drawing.includes("cabinetItems.push")||!drawing.includes("metodModuleId:module.id"))throw new Error("Suggested METOD modules should be created as placed catalog items.");
if(!builder.includes("CORNER_RESERVE=875")||!builder.includes("WALL_FACE_OFFSET=Math.max(0,Number(value.thickness)||0)/2")||!builder.includes("CORNER_START=CORNER_RESERVE+WALL_FACE_OFFSET")||!builder.includes("Venstre sidevegg")||!builder.includes("Høyre sidevegg")||!builder.includes("holdes 875 mm fri fra ferdig innvendig veggflate")||!builder.includes("Hjørneskap settes inn automatisk sammen med benkeskapene"))throw new Error("L/U kitchen runs must reserve 875 mm from the finished inside corner face and describe automatic corner placement accurately.");
if(!builder.includes("start:hasLeft?CORNER_START:0")||!builder.includes("fitMetodCabinetRun(back-(hasLeft?CORNER_START:0)-(hasRight?CORNER_START:0))")||!builder.includes("fitMetodCabinetRun(left-CORNER_START)")||!builder.includes("fitMetodCabinetRun(right-CORNER_START)"))throw new Error("L/U cabinet suggestions must calculate usable back and side-wall runs from the finished inside faces.");
if(!builder.includes('{wallLabel:"Venstre sidevegg",start:leftFit.remainder,fit:leftFit}'))throw new Error("Left-side cabinet run must use any leftover filler at the open end and meet the corner cabinet without a gap.");
if(!builder.includes('remainder:run.fit.remainder,fillRemainder:run.wallLabel==="Bakvegg"&&hasRight'))throw new Error("Back-wall runs that end at a right corner must pass their leftover width through for a filler.");
if(!drawing.includes("if(run.fillRemainder&&remainder>0&&cabinetStart+remainder<=faceLength)")||!drawing.includes('type:"filler",x:0,y:0,w:remainder,h:600'))throw new Error("A narrow filler must close the gap between the back-wall cabinet row and its corner cabinet without changing METOD module widths.");
const preview=readFileSync("app/admin/tegning/KitchenWallBuilder.js","utf8");
if(!preview.includes("previewScale=Math.min("))throw new Error("Kitchen preview must use entered dimensions.");
const url="data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const {createKitchenWalls,createKitchenCornerPlacements,kitchenWallDefaults,validateKitchenCornerFit,fitMetodCabinetRun}=await import(url);
// 875 mm corner cabinets must stay inside the entered wall lengths.
// With 98 mm walls, the centerline reserve is 875 + 49 = 924 mm per corner.
assert.throws(()=>validateKitchenCornerFit({shape:"l",lSide:"left",backLength:"3000",leftDepth:"923",thickness:"98"}),/Venstre sidevegg/);
assert.equal(validateKitchenCornerFit({shape:"l",lSide:"left",backLength:"3000",leftDepth:"924",thickness:"98"}),true);
assert.throws(()=>validateKitchenCornerFit({shape:"l",lSide:"right",backLength:"3000",rightDepth:"923",thickness:"98"}),/Høyre sidevegg/);
assert.throws(()=>validateKitchenCornerFit({shape:"u",backLength:"1847",leftDepth:"924",rightDepth:"924",thickness:"98"}),/Bakveggen/);
assert.equal(validateKitchenCornerFit({shape:"u",backLength:"1848",leftDepth:"924",rightDepth:"924",thickness:"98"}),true);
assert.equal(validateKitchenCornerFit({shape:"u",backLength:"300",leftDepth:"300",rightDepth:"300",thickness:"98"},{includeCabinets:false}),true,"wall-only layouts may omit corner cabinets");
const lengths=wall=>Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1);
const normal=wall=>{const l=lengths(wall);return{x:-(wall.y2-wall.y1)/l,y:(wall.x2-wall.x1)/l}};
let next=0;
const options={center:{x:4000,y:4000},canvasSize:8000,idFactory:()=>String(++next)};
const straight=createKitchenWalls({...kitchenWallDefaults,shape:"straight",backLength:"4100"},options);
assert.equal(straight.walls.length,1);
assert.equal(lengths(straight.walls[0]),4100);
assert.equal(straight.walls[0].kitchenLabel,"Bakvegg");
assert.ok(normal(straight.walls[0]).y>0);
const l=createKitchenWalls({...kitchenWallDefaults,shape:"l",backLength:"3800",rightDepth:"2600"},options);
assert.equal(l.walls.length,2);
assert.deepEqual(l.walls.map(lengths),[3800,2600]);
assert.equal(l.walls[0].x2,l.walls[1].x1);
assert.equal(l.walls[0].y2,l.walls[1].y1);
assert.ok(normal(l.walls[1]).x<0);
const leftL=createKitchenWalls({...kitchenWallDefaults,shape:"l",lSide:"left",backLength:"3650",leftDepth:"1750"},options);
assert.equal(leftL.walls.length,2);
assert.deepEqual(leftL.walls.map(lengths),[1750,3650]);
assert.equal(leftL.walls[0].x2,leftL.walls[1].x1);
assert.equal(leftL.walls[0].y2,leftL.walls[1].y1);
assert.ok(normal(leftL.walls[0]).x>0);
const u=createKitchenWalls({...kitchenWallDefaults,shape:"u",backLength:"4200",leftDepth:"2200",rightDepth:"2900"},options);
assert.equal(u.walls.length,3);
assert.deepEqual(u.walls.map(lengths),[2200,4200,2900]);
assert.equal(u.walls[0].x2,u.walls[1].x1);
assert.equal(u.walls[0].y2,u.walls[1].y1);
assert.equal(u.walls[1].x2,u.walls[2].x1);
assert.equal(u.walls[1].y2,u.walls[2].y1);
assert.ok(normal(u.walls[0]).x>0);
assert.ok(normal(u.walls[1]).y>0);
assert.ok(normal(u.walls[2]).x<0);
const cornerModule={id:"metod-corner-88",type:"cornerbase",width:875,depth:875,height:800};
let cornerId=0;
const leftCorners=createKitchenCornerPlacements(leftL.walls,cornerModule,()=>String(++cornerId));
assert.equal(leftCorners.length,1,"left L should have one corner cabinet");
assert.equal(leftCorners[0].rot,0,"left inner corner uses the unrotated cabinet footprint");
const rightCorners=createKitchenCornerPlacements(l.walls,cornerModule,()=>String(++cornerId));
assert.equal(rightCorners.length,1,"right L should have one corner cabinet");
assert.equal(rightCorners[0].rot,90,"right inner corner rotates the clipped face toward the kitchen");
const uCorners=createKitchenCornerPlacements(u.walls,cornerModule,()=>String(++cornerId));
assert.equal(uCorners.length,2,"U kitchen should have two corner cabinets");
assert.deepEqual(uCorners.map(item=>item.rot).sort((a,b)=>a-b),[0,90],"U corners need opposite orientations");
for(const [placements,group] of [[leftCorners,leftL.walls],[rightCorners,l.walls],[uCorners,u.walls]]){
 for(const item of placements){
  const vertex=item.cornerVertex;
  const connected=group.filter(w=>Math.hypot(w.x1-vertex.x,w.y1-vertex.y)<1||Math.hypot(w.x2-vertex.x,w.y2-vertex.y)<1);
  assert.equal(connected.length,2,"corner cabinet must use a real shared wall vertex");
  const inward=w=>{const length=lengths(w),side=w.insideSide==="right"?-1:1;return{x:-(w.y2-w.y1)/length*side,y:(w.x2-w.x1)/length*side}};
  const a=inward(connected[0]),b=inward(connected[1]);
  assert.equal(Math.round((item.x+item.w/2)*100)/100,Math.round((vertex.x+a.x*(item.w/2+(connected[0].t||0)/2)+b.x*(item.h/2+(connected[1].t||0)/2))*100)/100,"cabinet center must include half-thickness of both finished wall faces");
  assert.equal(Math.round((item.y+item.h/2)*100)/100,Math.round((vertex.y+a.y*(item.w/2+(connected[0].t||0)/2)+b.y*(item.h/2+(connected[1].t||0)/2))*100)/100,"cabinet center must include half-thickness of both finished wall faces");
  assert.ok(Number.isFinite(item.x)&&Number.isFinite(item.y),"corner cabinet coordinates must be finite");
  assert.equal(item.w,875);assert.equal(item.h,875);
  // Validate the actual rotated clipped footprint, not only its center point.
  const w=item.w,d=item.h,cx=item.x+w/2,cy=item.y+d/2,rad=(Number(item.rot)||0)*Math.PI/180;
  const cut=Math.min(w,d)*.38;
  const footprint=[[0,0],[w,0],[w,d-cut],[w-cut,d],[0,d]].map(([x,y])=>({
   x:cx+(x-w/2)*Math.cos(rad)-(y-d/2)*Math.sin(rad),
   y:cy+(x-w/2)*Math.sin(rad)+(y-d/2)*Math.cos(rad)
  }));
  for(const wall of connected){
   const n=inward(wall),faceOffset=(Number(wall.t)||0)/2;
   const faceEdge=footprint.some((p,k)=>{
    const q=footprint[(k+1)%footprint.length];
    const dp=(p.x-vertex.x)*n.x+(p.y-vertex.y)*n.y;
    const dq=(q.x-vertex.x)*n.x+(q.y-vertex.y)*n.y;
    return Math.abs(dp-faceOffset)<0.01&&Math.abs(dq-faceOffset)<0.01;
   });
   assert.ok(faceEdge,`rotated corner footprint must touch the finished inside face of ${wall.kitchenLabel}`);
  }
 }
}


 // Corner modules sit half a wall thickness beyond the centerline. The straight
 // rows must therefore start/end 875 mm + half thickness from the corner vertex,
 // leaving exactly 875 mm between the corner cabinet and row measured on the
 // finished inside face, rather than overlapping by half the wall thickness.
 const thickness=98,faceOffset=thickness/2,cornerReserve=875,cornerStart=cornerReserve+faceOffset;
 for(const [label,back,left,right,hasLeft,hasRight] of [
  ["L-left",3650,1750,0,true,false],
  ["L-right",3800,0,2600,false,true],
  ["U",4200,2200,2900,true,true]
 ]){
  const backStart=hasLeft?cornerStart:0;
  const backUsable=back-(hasLeft?cornerStart:0)-(hasRight?cornerStart:0);
  assert.ok(backUsable>=0,label+" back row should have nonnegative usable length");
  assert.equal(backStart,hasLeft?924:0,label+" back row start accounts for half wall thickness");
  if(hasLeft)assert.equal(left-cornerStart,left===1750?826:1276,label+" left side usable run is measured after the corner reserve");
  if(hasRight)assert.equal(right-cornerStart,right===2600?1676:1976,label+" right side usable run is measured after the corner reserve");
  // Corner's wall-facing edge starts 49 mm past the centerline vertex and spans
  // 875 mm; the straight row's first/last edge must meet, not overlap, that edge.
  assert.equal(cornerStart-faceOffset,cornerReserve,label+" reserve is measured from finished face");
 }

for(const group of [straight,l,leftL,u]){
 for(const wall of group.walls){
  assert.equal(wall.insideSide,"left");
  for(const number of [wall.x1,wall.x2,wall.y1,wall.y2])assert.ok(number>=0&&number<=8000,"wall outside canvas");
 }
}
assert.throws(()=>createKitchenWalls({...kitchenWallDefaults,shape:"l",rightDepth:"8000"},options),/Vegglengder/);
assert.throws(()=>createKitchenWalls({...kitchenWallDefaults,shape:"u",leftDepth:"-5"},options),/Vegglengder/);
assert.throws(()=>createKitchenWalls({...kitchenWallDefaults,shape:"none"},options),/Velg/);
console.log("Kjøkkenvegg-test bestått: 1 vegg, L høyre, L venstre, U, forskjellige sidelengder og innsider.");

// Test the exact fitter used by the live kitchen builder, not a duplicate test-only algorithm.
for(const [label,length,expectedRemainder] of [["short open run",826,26],["typical side run",1676,76],["long back run",2352,152],["uneven U side",1976,76]]){
 const fit=fitMetodCabinetRun(length);
 assert.equal(fit.used+fit.remainder,fit.target,label+" must account for every millimetre");
 assert.ok(fit.widths.every(width=>[200,300,400,600,800,1000,1200].includes(width)),label+" must use real standard widths");
 assert.equal(fit.remainder,expectedRemainder,label+" must expose exact remainder for separate fitting");
}
const rightCornerBack=fitMetodCabinetRun(3800-924);
assert.equal(rightCornerBack.used+rightCornerBack.remainder,2876,"right-corner back run must account for the usable wall length");
assert.equal(924-49,875,"corner reserve must be measured from the finished inside face");
const leftOpenRun=fitMetodCabinetRun(1750-924);
assert.equal(leftOpenRun.used+leftOpenRun.remainder,826,"left L side must account for its entire usable run");
assert.equal(leftOpenRun.remainder,26,"open-end filler must close the remaining 26 mm without changing METOD widths");
assert.deepEqual(fitMetodCabinetRun(0),{widths:[],remainder:0,used:0,target:0},"zero-length runs must not create cabinets or filler");
console.log("METOD-plassering bestått: live fitter, innvendige mål, hjørnereserver, standardbredder og restmål.");
