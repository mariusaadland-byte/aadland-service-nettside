// Open wall runs for kitchen planning. These are deliberately NOT room zones:
 // one wall, an L or a U can be furnished, shown in 3D and exported without a closed floorplan.
export const KITCHEN_SHAPES=["straight","l","u"];
export const kitchenWallDefaults={shape:"straight",backLength:"4000",leftDepth:"2500",rightDepth:"2500",thickness:"98",height:"2400"};
const int=(value)=>Number(value);
const finiteBetween=(value,min,max)=>Number.isFinite(int(value))&&int(value)>=min&&int(value)<=max;
export function createKitchenWalls(config,{center={x:4000,y:4000},canvasSize=8000,idFactory}={}){
 const shape=String(config?.shape||"");
 if(!KITCHEN_SHAPES.includes(shape))throw new Error("Velg rett vegg, L-vegg eller U-vegg.");
 const back=int(config.backLength),left=int(config.leftDepth),right=int(config.rightDepth),thickness=int(config.thickness),height=int(config.height);
 if(!finiteBetween(back,300,7000)||shape==="u"&&!finiteBetween(left,300,7000)||shape!=="straight"&&!finiteBetween(right,300,7000)){
  throw new Error("Vegglengder må være mellom 300 og 7000 mm.");
 }
 if(!finiteBetween(thickness,40,600)||!finiteBetween(height,300,6000))throw new Error("Kontroller veggtykkelse og høyde.");
 if(typeof idFactory!=="function")throw new Error("Mangler unik vegg-ID.");
 // Plan: the back wall runs left to right, with its furnished face below the line.
 // A U has an upward-pointing left wall and a downward-pointing right wall,
 // so the same left-hand normal is inward for every wall.
 const maxDepth=shape==="straight"?0:shape==="l"?right:Math.max(left,right);
 const safeCenter={x:Number.isFinite(Number(center?.x))?Number(center.x):canvasSize/2,y:Number.isFinite(Number(center?.y))?Number(center.y):canvasSize/2};
 const x0=Math.max(250,Math.min(canvasSize-250-back,safeCenter.x-back/2));
 const y0=Math.max(250,Math.min(canvasSize-250-maxDepth,safeCenter.y-(maxDepth+thickness)/2));
 const segments=[];
 if(shape==="u")segments.push({name:"Venstre sidevegg",x1:x0,y1:y0+left,x2:x0,y2:y0});
 segments.push({name:"Bakvegg",x1:x0,y1:y0,x2:x0+back,y2:y0});
 if(shape!=="straight")segments.push({name:"Høyre sidevegg",x1:x0+back,y1:y0,x2:x0+back,y2:y0+right});
 const walls=segments.map(({name,...coordinates})=>({
  id:idFactory(),...coordinates,t:thickness,h:height,insideSide:"left",kitchenWall:true,kitchenLabel:name
 }));
 return {walls,bounds:{minX:x0,minY:y0,maxX:x0+back,maxY:y0+maxDepth},shape};
}
