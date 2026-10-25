// Local, conservative detection of a pale paper receipt against a darker surface.
// Never auto-commit a crop: users can review and adjust it before OCR.
export const fullReceiptBounds=()=>({x:0,y:0,w:1,h:1});
export function clampReceiptBounds(bounds){
 const clamp=(v,low,high)=>Math.min(high,Math.max(low,Number.isFinite(v)?v:low));
 const x=clamp(Number(bounds?.x),0,.94),y=clamp(Number(bounds?.y),0,.94);
 const w=clamp(Number(bounds?.w),.06,1-x),h=clamp(Number(bounds?.h),.06,1-y);
 return {x,y,w,h};
}
export function detectReceiptBounds(image){
 const width=Math.floor(Number(image?.width)),height=Math.floor(Number(image?.height));
 const pixels=image?.data;
 if(width<50||height<50||!pixels||pixels.length<width*height*4)return null;
 const luminance=(i)=>.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
 const marginX=Math.max(3,Math.floor(width*.11)),marginY=Math.max(3,Math.floor(height*.11));
 let backgroundSum=0,backgroundSamples=0;
 // Read the four corners, not an entire border (which could include paper).
 for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){
  if((x<marginX||x>=width-marginX)&&(y<marginY||y>=height-marginY)){
   backgroundSum+=luminance((y*width+x)*4);backgroundSamples++;
  }
 }
 const background=backgroundSamples?backgroundSum/backgroundSamples:255;
 // On a white background the receipt edge cannot be detected reliably.
 if(background>195)return null;
 const threshold=Math.max(145,Math.min(235,background+34));
 const rowCounts=new Uint32Array(height),colCounts=new Uint32Array(width);
 let candidates=0;
 for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){
  const i=(y*width+x)*4;
  const max=Math.max(pixels[i],pixels[i+1],pixels[i+2]);
  const min=Math.min(pixels[i],pixels[i+1],pixels[i+2]);
  if(luminance(i)>threshold&&max-min<75){
   rowCounts[y]++;colCounts[x]++;candidates++;
  }
 }
 if(candidates<width*height*.035)return null;
 const rowLimit=Math.max(5,Math.round(width*.13/2));
 const colLimit=Math.max(5,Math.round(height*.13/2));
 let top=0,bottom=height-1,left=0,right=width-1;
 while(top<height&&rowCounts[top]<rowLimit)top++;
 while(bottom>=0&&rowCounts[bottom]<rowLimit)bottom--;
 while(left<width&&colCounts[left]<colLimit)left++;
 while(right>=0&&colCounts[right]<colLimit)right--;
 if(top>=bottom||left>=right)return null;
 const rectWidth=(right-left+1)/width,rectHeight=(bottom-top+1)/height;
 if(rectWidth<.23||rectHeight<.26||rectWidth*rectHeight<.10)return null;
 // Add a small safety margin to avoid cutting the printed edge of paper.
 const padX=Math.ceil(width*.018),padY=Math.ceil(height*.018);
 const x=Math.max(0,left-padX)/width,y=Math.max(0,top-padY)/height;
 const endX=Math.min(width,right+padX+1)/width,endY=Math.min(height,bottom+padY+1)/height;
 return clampReceiptBounds({x,y,w:endX-x,h:endY-y});
}
export function cropReceiptPixels(width,height,bounds){
 const b=clampReceiptBounds(bounds);
 const x=Math.floor(b.x*width),y=Math.floor(b.y*height);
 const right=Math.min(width,Math.ceil((b.x+b.w)*width));
 const bottom=Math.min(height,Math.ceil((b.y+b.h)*height));
 return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
}


// Four-point document scan: the flattened output contains ONLY the
// quadrilateral between these corners (not a rectangular slice of the table).
export const fullReceiptCorners=()=>[
 {x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}
];
export function cornersFromReceiptBounds(b){
 const c=clampReceiptBounds(b);
 return [{x:c.x,y:c.y},{x:c.x+c.w,y:c.y},
  {x:c.x+c.w,y:c.y+c.h},{x:c.x,y:c.y+c.h}];
}
export function receiptCornerArea(corners){
 if(!Array.isArray(corners)||corners.length!==4)return 0;
 let area=0;
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4];
  area+=a.x*b.y-b.x*a.y;
 }
 return area/2;
}
export function validReceiptCorners(corners){
 if(!Array.isArray(corners)||corners.length!==4)return false;
 if(corners.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
   p.x<0||p.y<0||p.x>1||p.y>1))return false;
 if(receiptCornerArea(corners)<.017)return false;
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4],c=corners[(i+2)%4];
  const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  if(cross<.0005)return false;
 }
 return true;
}
export function detectReceiptCorners(image){
 const width=image?.width|0,height=image?.height|0,data=image?.data;
 if(width<50||height<50||!data||data.length<width*height*4)return null;
 const luminance=i=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
 const mx=Math.max(3,Math.floor(width*.10)),my=Math.max(3,Math.floor(height*.10));
 let background=0,n=0;
 for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){
  if((x<mx||x>=width-mx)&&(y<my||y>=height-my)){
   background+=luminance((y*width+x)*4);n++;
  }
 }
 background=n?background/n:255;
 // Paper on white/light floors is ambiguous. Never delete pixels on a guess.
 if(background>195)return null;
 const threshold=Math.max(145,Math.min(235,background+43));
 const mask=new Uint8Array(width*height);
 for(let i=0;i<mask.length;i++){
  const p=i*4,red=data[p],green=data[p+1],blue=data[p+2];
  const max=Math.max(red,green,blue),min=Math.min(red,green,blue);
  if(luminance(p)>threshold&&max-min<82)mask[i]=1;
 }
 const visited=new Uint8Array(width*height),queue=new Int32Array(width*height);
 let biggest=null;
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||visited[start])continue;
  let head=0,tail=1;queue[0]=start;visited[start]=1;
  let minX=width,minY=height,maxX=0,maxY=0;
  let tl=null,tr=null,br=null,bl=null;
  let sTL=Infinity,sTR=-Infinity,sBR=-Infinity,sBL=Infinity;
  while(head<tail){
   const i=queue[head++],x=i%width,y=(i-x)/width;
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);
   minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   const plus=x+y,minus=x-y;
   if(plus<sTL){sTL=plus;tl={x,y};}
   if(minus>sTR){sTR=minus;tr={x,y};}
   if(plus>sBR){sBR=plus;br={x,y};}
   if(minus<sBL){sBL=minus;bl={x,y};}
   if(x>0&&mask[i-1]&&!visited[i-1]){visited[i-1]=1;queue[tail++]=i-1;}
   if(x<width-1&&mask[i+1]&&!visited[i+1]){visited[i+1]=1;queue[tail++]=i+1;}
   if(y>0&&mask[i-width]&&!visited[i-width]){visited[i-width]=1;queue[tail++]=i-width;}
   if(y<height-1&&mask[i+width]&&!visited[i+width]){visited[i+width]=1;queue[tail++]=i+width;}
  }
  const bbox=(maxX-minX+1)*(maxY-minY+1);
  if(tail<width*height*.06||bbox<width*height*.085||
    (maxX-minX)<width*.22||(maxY-minY)<height*.23)continue;
  const fill=tail/bbox;
  if(fill<.38)continue;
  const points=[tl,tr,br,bl].map(p=>({x:p.x/Math.max(1,width-1),y:p.y/Math.max(1,height-1)}));
  if(!validReceiptCorners(points))continue;
  if(!biggest||tail>biggest.size)biggest={points,size:tail};
 }
 return biggest?.points||null;
}
function solveReceiptLinear8(matrix,values){
 const rows=matrix.map((v,i)=>[...v,values[i]]);
 for(let i=0;i<8;i++){
  let pivot=i;
  for(let j=i+1;j<8;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;
  if(Math.abs(rows[pivot][i])<1e-9)return null;
  [rows[i],rows[pivot]]=[rows[pivot],rows[i]];
  const scale=rows[i][i];
  for(let k=i;k<=8;k++)rows[i][k]/=scale;
  for(let j=0;j<8;j++)if(j!==i){
   const factor=rows[j][i];
   for(let k=i;k<=8;k++)rows[j][k]-=factor*rows[i][k];
  }
 }
 return rows.map(row=>row[8]);
}
// Homography maps a straightened unit square to the four source corners.
export function receiptPerspectiveMatrix(corners){
 if(!validReceiptCorners(corners))return null;
 const unit=[[0,0],[1,0],[1,1],[0,1]];
 const matrix=[],values=[];
 for(let i=0;i<4;i++){
  const [u,v]=unit[i],{x,y}=corners[i];
  matrix.push([u,v,1,0,0,0,-u*x,-v*x]);values.push(x);
  matrix.push([0,0,0,u,v,1,-u*y,-v*y]);values.push(y);
 }
 return solveReceiptLinear8(matrix,values);
}
export function receiptPerspectivePoint(matrix,u,v){
 if(!matrix||matrix.length!==8)return null;
 const [a,b,c,d,e,f,g,h]=matrix;
 const denom=g*u+h*v+1;
 if(Math.abs(denom)<1e-9)return null;
 return {x:(a*u+b*v+c)/denom,y:(d*u+e*v+f)/denom};
}
export function receiptScanDimensions(corners,width,height){
 if(!validReceiptCorners(corners))return null;
 const len=(a,b)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
 const horizontal=(len(corners[0],corners[1])+len(corners[3],corners[2]))/2;
 const vertical=(len(corners[0],corners[3])+len(corners[1],corners[2]))/2;
 const scale=Math.min(1,2700/Math.max(horizontal,vertical),Math.sqrt(5200000/(horizontal*vertical)));
 return {width:Math.max(1,Math.round(horizontal*scale)),height:Math.max(1,Math.round(vertical*scale))};
}
