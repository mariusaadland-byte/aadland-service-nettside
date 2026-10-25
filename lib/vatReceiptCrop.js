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
