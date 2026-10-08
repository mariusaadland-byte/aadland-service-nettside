import "server-only";

const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const safe=v=>String(v??"").replace(/[–—]/g,"-").replace(/[\r\n\t]+/g," ").replace(/[^\x20-\x7eÆØÅæøåÉé]/g,"?").slice(0,130);
const escapePdf=v=>safe(v).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
const text=(x,y,s,size=10,bold=false,color=[0.16,0.20,0.22])=>"BT /"+(bold?"F2":"F1")+" "+size+" Tf "+color.join(" ")+" rg "+x.toFixed(1)+" "+y.toFixed(1)+" Td ("+escapePdf(s)+") Tj ET\n";
const rect=(x,y,w,h,c=[1,1,1])=>c.join(" ")+" rg "+x.toFixed(1)+" "+y.toFixed(1)+" "+w.toFixed(1)+" "+h.toFixed(1)+" re f\n";
const rule=(x1,y1,x2,y2,c=[0.2,0.24,0.26],sw=1)=>c.join(" ")+" RG "+sw+" w "+x1.toFixed(1)+" "+y1.toFixed(1)+" m "+x2.toFixed(1)+" "+y2.toFixed(1)+" l S\n";
const polygon=(pts,color)=>pts.length<3?"":color.join(" ")+" rg "+pts.map((p,i)=>(i?"":"")+p[0].toFixed(1)+" "+p[1].toFixed(1)+(i?" l ":" m ")).join("")+"h f\n";
const ink=[0.17,0.22,0.25],gold=[0.70,0.48,0.20],grey=[0.40,0.45,0.48],light=[0.93,0.96,0.97];
const names={door:"Dør",sliding:"Skyvedør",window:"Vindu",opening:"Åpning",wallcab:"Overskap",base:"Benkeskap",tallcab:"Høyskap",wardrobe:"Garderobe",bed:"Seng",sinkcab:"Vaskeskap",customwall:"Eget møbel",customfloor:"Eget møbel",sofa:"Sofa",table:"Bord",fridge:"Kjøleskap",toilet:"Toalett",shower:"Dusj",sink:"Servant",downlight:"Downlight",outlet:"Stikk",switch:"Bryter"};
const label=item=>safe(item?.customName||names[item?.type]||item?.type||"Objekt").slice(0,28);
const length=wall=>Math.hypot(num(wall.x2)-num(wall.x1),num(wall.y2)-num(wall.y1));
const fmt=v=>String(Math.round(num(v)))+" mm";
const opening=item=>["door","window","sliding","opening"].includes(item?.type);
const electric=item=>["downlight","ceilinglight","outlet","doubleoutlet","walllight","switch","dimmer","thermostat"].includes(item?.type);
function header(heading,sub){
 let s=rect(0,755,595,87,[0.065,0.065,0.058]);
 s+=text(48,803,"AADLAND SERVICE",15,true,[0.88,0.72,0.42]);
 s+=text(48,783,"TEGNINGSVEDLEGG",9,true,[0.90,0.90,0.88]);
 s+=text(48,729,heading,23,true,ink);
 s+=text(48,708,sub,9,false,grey);
 s+=rule(48,694,547,694,[0.80,0.80,0.77],0.8);
 return s;
}
function bounds(doc){
 let xx=[],yy=[];
 for(const w of doc.walls||[]){xx.push(num(w.x1),num(w.x2));yy.push(num(w.y1),num(w.y2))}
 for(const z of doc.zones||[])for(const p of z.points||[]){xx.push(num(p.x));yy.push(num(p.y))}
 for(const item of doc.items||[]){xx.push(num(item.x),num(item.x)+num(item.w));yy.push(num(item.y),num(item.y)+num(item.h))}
 if(!xx.length){xx=[0,4000];yy=[0,3000]}
 return {minX:Math.min(...xx)-300,maxX:Math.max(...xx)+300,minY:Math.min(...yy)-300,maxY:Math.max(...yy)+300};
}
function floorPage(doc){
 const b=bounds(doc),spanX=Math.max(1000,b.maxX-b.minX),spanY=Math.max(1000,b.maxY-b.minY);
 const scale=Math.min(485/spanX,390/spanY);
 const offX=297.5-(b.minX+b.maxX)*scale/2,offY=451-(b.minY+b.maxY)*scale/2;
 const x=v=>offX+num(v)*scale,y=v=>offY-num(v)*scale;
 let s=header("PLANTEGNING",safe(doc.name||"Tegning")+" - "+safe(doc.customer||""));
 s+=rect(48,209,499,453,[0.985,0.989,0.99]);
 for(const z of doc.zones||[]){
  const pts=(z.points||[]).map(p=>[x(p.x),y(p.y)]);
  s+=polygon(pts,light);
  if(pts.length){
   const cx=pts.reduce((n,p)=>n+p[0],0)/pts.length,cy=pts.reduce((n,p)=>n+p[1],0)/pts.length;
   s+=text(cx-24,cy,safe(z.name||"Rom").slice(0,22),9,true,[0.28,0.49,0.56]);
  }
 }
 for(const w of doc.walls||[]){
  s+=rule(x(w.x1),y(w.y1),x(w.x2),y(w.y2),ink,Math.min(14,Math.max(2,num(w.t,98)*scale)));
 }
 for(const item of doc.items||[]){
  const w=num(item.w,200),h=num(item.h,200),ix=num(item.x),iy=num(item.y);
  if(opening(item)&&item.wallId){
   const wall=(doc.walls||[]).find(row=>row.id===item.wallId);
   if(wall){
    const L=length(wall)||1,ux=(num(wall.x2)-num(wall.x1))/L,uy=(num(wall.y2)-num(wall.y1))/L,c=num(item.wallOffset,L/2);
    const a={x:num(wall.x1)+ux*(c-w/2),y:num(wall.y1)+uy*(c-w/2)},d={x:a.x+ux*w,y:a.y+uy*w};
    s+=rule(x(a.x),y(a.y),x(d.x),y(d.y),[1,1,1],Math.max(5,num(wall.t,98)*scale+3));
    s+=rule(x(a.x),y(a.y),x(d.x),y(d.y),item.type==="window"?[0.15,0.53,0.67]:gold,2.4);
   }
   continue;
  }
  if(electric(item)){const cx=x(ix+w/2),cy=y(iy+h/2);s+=rect(cx-3,cy-3,6,6,[0.14,0.53,0.32]);continue}
  const rad=num(item.rot)*Math.PI/180,cx=ix+w/2,cy=iy+h/2,cos=Math.cos(rad),sin=Math.sin(rad);
  const vertices=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy])=>({x:cx+dx*cos-dy*sin,y:cy+dx*sin+dy*cos}));
  const pts=vertices.map(p=>[x(p.x),y(p.y)]);
  s+=polygon(pts,[0.89,0.81,0.65]);
  for(let k=0;k<4;k++)s+=rule(pts[k][0],pts[k][1],pts[(k+1)%4][0],pts[(k+1)%4][1],[0.50,0.39,0.26],0.7);
  if(w*scale>36&&h*scale>16)s+=text(x(cx)-Math.min(28,w*scale/3),y(cy),label(item).slice(0,15),Math.min(8,Math.max(5,w*scale/9)),true,ink);
 }
 let yy=190;
 for(const z of (doc.zones||[]).slice(0,4)){
  const dims=[num(z.enteredInnerWidth),num(z.enteredInnerHeight)];
  const exact=dims.every(n=>n>0)?": "+fmt(dims[0])+" x "+fmt(dims[1])+" innvendig":"";
  s+=text(52,yy,safe(z.name||"Rom")+exact,9,true,grey);yy-=17;
 }
 s+=text(48,95,"Illustrasjon fra lagret tegningsgrunnlag. Ferdige mål oppgis i mm.",8,false,grey);
 s+=text(48,79,"Kontroller mål på byggeplassen - ikke mål med linjal på utskriften.",8,false,grey);
 return s;
}
function elevationPage(doc,wall,index){
 const L=Math.max(100,length(wall)),H=Math.max(500,num(wall.h,num(doc.defaultWallHeight,2400)));
 const scale=Math.min(454/L,330/H);
 const ox=297.5-L*scale/2,fy=280;
 let s=header("VEGGTEGNING "+(index+1),safe(doc.name||"Tegning")+" - frontvisning");
 s+=rect(48,219,499,439,[0.985,0.989,0.99]);
 s+=rect(ox,fy,L*scale,H*scale,light);
 s+=rule(ox,fy,ox+L*scale,fy,ink,1.3);
 s+=rule(ox,fy,ox,fy+H*scale,ink,1.3);
 s+=rule(ox+L*scale,fy,ox+L*scale,fy+H*scale,ink,1.3);
 s+=rule(ox,fy+H*scale,ox+L*scale,fy+H*scale,ink,1.3);
 for(const item of (doc.items||[]).filter(item=>item.wallId===wall.id)){
  const w=Math.max(20,num(item.w,200)),c=num(item.wallOffset,L/2),start=Math.max(0,Math.min(L-w,c-w/2));
  const door=["door","sliding","opening"].includes(item.type),window=item.type==="window";
  const elev=window?num(item.sillHeight,900):door?0:num(item.elevation,num(item.mountHeight,0));
  const height=window?num(item.openingHeight,1200):door?num(item.openingHeight,2100):num(item.modelHeight,item.type==="wallcab"?700:900);
  const h=Math.max(10,Math.min(Math.max(10,H-elev),height));
  const rx=ox+start*scale,ry=fy+elev*scale,rw=w*scale,rh=h*scale;
  if(electric(item)){s+=rect(rx+rw/2-4,ry-4,8,8,[0.14,0.56,0.38]);continue}
  s+=rect(rx,ry,rw,rh,window?[0.73,0.89,0.94]:door?[1,1,1]:[0.88,0.80,0.64]);
  s+=rule(rx,ry,rx+rw,ry,ink,0.8);s+=rule(rx+rw,ry,rx+rw,ry+rh,ink,0.8);
  s+=rule(rx+rw,ry+rh,rx,ry+rh,ink,0.8);s+=rule(rx,ry+rh,rx,ry,ink,0.8);
  if((item.type==="customwall"||item.type==="customfloor")&&rw>22&&rh>22){
   const cols=Math.max(1,num(item.sectionsX,1)),rows=Math.max(1,num(item.sectionsY,1));
   for(let k=1;k<cols;k++)s+=rule(rx+rw*k/cols,ry,rx+rw*k/cols,ry+rh,[0.51,0.44,0.31],0.6);
   for(let k=1;k<rows;k++)s+=rule(rx,ry+rh*k/rows,rx+rw,ry+rh*k/rows,[0.51,0.44,0.31],0.6);
  }
  if(rw>50&&rh>25)s+=text(rx+4,ry+rh/2,label(item).slice(0,18),Math.min(7,Math.max(4,rw/Math.max(10,label(item).length))),true,ink);
 }
 s+=text(297.5-L*scale/2,247,"0",9,false,grey);
 s+=text(297.5-L*scale/2,205,"Vegg "+(index+1)+": "+fmt(L)+" langs senterlinje - høyde "+fmt(H),11,true,ink);
 s+=text(48,105,"Frontvisning med åpninger, innredning og monteringshøyder.",8,false,grey);
 s+=text(48,88,"Sjekk ferdige innvendige hjørnemål i plantegningen før utførelse.",8,false,grey);
 return s;
}
export function drawingPageStreams(drawing,{maxWalls=40}={}){
 const doc=drawing?.drawing_data||drawing?.drawingData||drawing||{};
 const walls=Array.isArray(doc.walls)?doc.walls:[];
 const zones=Array.isArray(doc.zones)?doc.zones:[];
 if(!walls.length&&!zones.length)throw new Error("Tegningen er tom. Lag minst ett rom eller en vegg.");
 if(walls.length>maxWalls)throw new Error("For mange vegger i samme PDF. Maks "+maxWalls+" per tegning.");
 return [floorPage(doc),...walls.map((wall,index)=>elevationPage(doc,wall,index))];
}
