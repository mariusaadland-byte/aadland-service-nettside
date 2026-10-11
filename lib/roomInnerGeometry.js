export function polygonSignedArea(points){
 let area=0;
 for(let i=0;i<(points||[]).length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y}
 return area/2;
}
export function infiniteLineIntersection(a,b,c,d){
 const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},den=r.x*s.y-r.y*s.x;
 if(Math.abs(den)<1e-7)return null;
 const t=((c.x-a.x)*s.y-(c.y-a.y)*s.x)/den;
 return{x:a.x+t*r.x,y:a.y+t*r.y};
}
export function offsetPolygon(points,distance,inward=true){
 if(!Array.isArray(points)||points.length<3)return points||[];
 const orientation=polygonSignedArea(points)>=0?1:-1,shifted=[],direction=inward?1:-1;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
  const ix=orientation>0?-dy/L:dy/L,iy=orientation>0?dx/L:-dx/L,nx=ix*direction,ny=iy*direction;
  shifted.push({a:{x:a.x+nx*distance,y:a.y+ny*distance},b:{x:b.x+nx*distance,y:b.y+ny*distance},nx,ny});
 }
 return points.map((point,i)=>{
  const prev=shifted[(i-1+shifted.length)%shifted.length],next=shifted[i],hit=infiniteLineIntersection(prev.a,prev.b,next.a,next.b);
  if(hit&&Number.isFinite(hit.x)&&Number.isFinite(hit.y)&&Math.hypot(hit.x-point.x,hit.y-point.y)<3000)return hit;
  return{x:point.x+(prev.nx+next.nx)*distance/2,y:point.y+(prev.ny+next.ny)*distance/2};
 });
}
export function centerlinePointsFromInner(points,wallIds,walls,defaultThickness=98,thicknessOverrides={}){
 if(!Array.isArray(points)||points.length<3||!Array.isArray(wallIds)||wallIds.length!==points.length)return points||[];
 const byId=new Map((walls||[]).map(w=>[w.id,w])),orientation=polygonSignedArea(points)>=0?1:-1,shifted=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,wallId=wallIds[i],wall=byId.get(wallId),thickness=Number(thicknessOverrides?.[wallId]??wall?.t??defaultThickness)||98,distance=Math.max(0,thickness/2);
  const inX=orientation>0?-dy/L:dy/L,inY=orientation>0?dx/L:-dx/L,outX=-inX,outY=-inY;
  shifted.push({a:{x:a.x+outX*distance,y:a.y+outY*distance},b:{x:b.x+outX*distance,y:b.y+outY*distance},outX,outY,distance});
 }
 return points.map((point,i)=>{
  const prev=shifted[(i-1+shifted.length)%shifted.length],next=shifted[i],hit=infiniteLineIntersection(prev.a,prev.b,next.a,next.b);
  if(hit&&Number.isFinite(hit.x)&&Number.isFinite(hit.y)&&Math.hypot(hit.x-point.x,hit.y-point.y)<3000)return hit;
  return{x:point.x+(prev.outX*prev.distance+next.outX*next.distance)/2,y:point.y+(prev.outY*prev.distance+next.outY*next.distance)/2};
 });
}
