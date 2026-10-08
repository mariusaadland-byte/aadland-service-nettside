import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("lib/kitchenWallPresets.js","utf8");
const url="data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const {createKitchenWalls,kitchenWallDefaults}=await import(url);
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
