// Fast OCR-only copies: keep the customer's original receipt file untouched.
// Source photos can be 12+ megapixels even when their JPEG size is below 4 MB.
import {detectReceiptBounds,detectReceiptCorners,validReceiptCorners,receiptCornerArea,receiptPerspectiveMatrix,receiptScanDimensions} from "./vatReceiptCrop";

export function vatOcrGeometry(width,height,detected=null){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)
  throw Error("Ugyldig oppløsning på kvitteringsbildet.");
 // Only crop a clearly distinct white document on a dark background.
 // Weak detection must fall back to the complete image.
 const area=detected?.w*detected?.h;
 const good=detected&&[detected.x,detected.y,detected.w,detected.h].every(Number.isFinite)&&
  detected.x>=0&&detected.y>=0&&detected.x+detected.w<=1.001&&
  detected.y+detected.h<=1.001&&detected.w>=.25&&detected.h>=.30&&
  area>=.18&&area<.88;
 const sx=good?Math.max(0,Math.floor((detected.x-.025)*width)):0;
 const sy=good?Math.max(0,Math.floor((detected.y-.025)*height)):0;
 const ex=good?Math.min(width,Math.ceil((detected.x+detected.w+.025)*width)):width;
 const ey=good?Math.min(height,Math.ceil((detected.y+detected.h+.025)*height)):height;
 const sw=ex-sx,sh=ey-sy;
 const scale=Math.min(1,2200/Math.max(sw,sh),Math.sqrt(2600000/(sw*sh)));
 return {sx,sy,sw,sh,width:Math.max(1,Math.round(sw*scale)),
  height:Math.max(1,Math.round(sh*scale)),cropped:Boolean(good)};
}


export function vatOcrSegments(geometry){
 if(geometry.sh<=2400||geometry.sh/geometry.sw<=2.15)return [];
 const count=Math.min(3,Math.max(2,Math.ceil(geometry.sh/(geometry.sw*1.55))));
 const sectionHeight=geometry.sh/count;
 const overlap=Math.min(geometry.sh*.035,geometry.sw*.10);
 return Array.from({length:count},(_,index)=>{
  const sy=Math.max(geometry.sy,Math.floor(geometry.sy+index*sectionHeight-(index?overlap:0)));
  const bottom=Math.min(geometry.sy+geometry.sh,
   Math.ceil(geometry.sy+(index+1)*sectionHeight+(index<count-1?overlap:0)));
  const sh=bottom-sy;
  const scale=Math.min(1,2200/Math.max(geometry.sw,sh),Math.sqrt(2600000/(geometry.sw*sh)));
  return {sx:geometry.sx,sy,sw:geometry.sw,sh,
   width:Math.max(1,Math.round(geometry.sw*scale)),
   height:Math.max(1,Math.round(sh*scale))};
 });
}


// Automatically rectify strongly-detected paper, before OCR. This is an
// OCR-only temporary copy; users can still adjust all four corners manually.
// Conservative detection intentionally falls back to the original photograph.
export function vatAutoPerspectiveDimensions(corners,width,height){
 if(!validReceiptCorners(corners))return null;
 const area=receiptCornerArea(corners);
 if(area<.12||area>.84)return null;
 const d=receiptScanDimensions(corners,width,height);
 if(!d||d.width<180||d.height<280)return null;
 const aspect=d.height/d.width;
 if(aspect<1.15||aspect>8)return null;
 const scale=Math.min(1,2100/Math.max(d.width,d.height),Math.sqrt(2300000/(d.width*d.height)));
 return {width:Math.max(1,Math.round(d.width*scale)),height:Math.max(1,Math.round(d.height*scale))};
}

async function rectifyForVatOcr(img,corners,onProgress){
 const w=img.naturalWidth,h=img.naturalHeight;
 const dims=vatAutoPerspectiveDimensions(corners,w,h);
 const matrix=dims&&receiptPerspectiveMatrix(corners);
 if(!dims||!matrix)return null;
 onProgress("Retter opp kvitteringen og fjerner bakgrunnen før tekstlesing …");
 // Bounded source image reduces Safari memory use with 12+ MP photographs.
 const scale=Math.min(1,2600/Math.max(w,h),Math.sqrt(5000000/(w*h)));
 const source=document.createElement("canvas"),out=document.createElement("canvas");
 try{
  source.width=Math.max(1,Math.round(w*scale));
  source.height=Math.max(1,Math.round(h*scale));
  const srcContext=source.getContext("2d",{willReadFrequently:true});
  if(!srcContext)return null;
  srcContext.drawImage(img,0,0,source.width,source.height);
  const input=srcContext.getImageData(0,0,source.width,source.height).data;
  const srcW=source.width,srcH=source.height;
  out.width=dims.width;out.height=dims.height;
  const output=out.getContext("2d",{alpha:false});
  if(!output)return null;
  const imageData=output.createImageData(out.width,out.height);
  const data=imageData.data;
  const [a,b,c,d,e,f,g,j]=matrix;
  for(let y=0;y<out.height;y++){
   const v=y/Math.max(1,out.height-1);
   for(let x=0;x<out.width;x++){
    const u=x/Math.max(1,out.width-1),denom=g*u+j*v+1;
    const offset=(y*out.width+x)*4;
    if(Math.abs(denom)<1e-9){
     data[offset]=255;data[offset+1]=255;data[offset+2]=255;data[offset+3]=255;continue;
    }
    const fx=Math.max(0,Math.min(srcW-1,(a*u+b*v+c)/denom*(srcW-1)));
    const fy=Math.max(0,Math.min(srcH-1,(d*u+e*v+f)/denom*(srcH-1)));
    const left=Math.floor(fx),top=Math.floor(fy),right=Math.min(srcW-1,left+1),
      bottom=Math.min(srcH-1,top+1),dx=fx-left,dy=fy-top;
    const k00=(top*srcW+left)*4,k10=(top*srcW+right)*4;
    const k01=(bottom*srcW+left)*4,k11=(bottom*srcW+right)*4;
    for(let c=0;c<3;c++){
     const up=input[k00+c]*(1-dx)+input[k10+c]*dx;
     const down=input[k01+c]*(1-dx)+input[k11+c]*dx;
     data[offset+c]=Math.round(up*(1-dy)+down*dy);
    }
    data[offset+3]=255;
   }
  }
  output.putImageData(imageData,0,0);
  const blob=await new Promise(resolve=>out.toBlob(resolve,"image/jpeg",.94));
  return blob?.size>=12?new File([blob],"kvittering-rettet-for-tekstlesing.jpg",{type:"image/jpeg"}):null;
 }finally{
  source.width=0;source.height=0;out.width=0;out.height=0;
 }
}

// One OCR image normally; a very tall receipt yields several ordered File parts.
export async function prepareVatOcrImage(file,onProgress=()=>{}){
 if(typeof document==="undefined"||!file||typeof URL?.createObjectURL!=="function")return file;
 const url=URL.createObjectURL(file);
 let preview=null,out=null;
 try{
  onProgress("Tilpasser bildet for raskere tekstlesing …");
  const img=await new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>resolve(image);
   image.onerror=()=>reject(Error("Klarte ikke å lese bildeformatet."));
   image.src=url;
  });
  if(img.naturalWidth<50||img.naturalHeight<50)return file;
  // Detect probable receipt edges at small resolution; never analyze the
  // complete 12 MP photo pixel-by-pixel on the iPhone's main thread.
  let bounds=null,corners=null;
  try{
   preview=document.createElement("canvas");
   const k=Math.min(1,520/Math.max(img.naturalWidth,img.naturalHeight));
   preview.width=Math.round(img.naturalWidth*k);
   preview.height=Math.round(img.naturalHeight*k);
   const context=preview.getContext("2d",{willReadFrequently:true});
   if(context){
    context.drawImage(img,0,0,preview.width,preview.height);
    const pixels=context.getImageData(0,0,preview.width,preview.height);
    corners=detectReceiptCorners(pixels);
    bounds=detectReceiptBounds(pixels);
   }
  }catch{
   bounds=null;
  }finally{
   if(preview){preview.width=0;preview.height=0;}
  }
  if(corners){
   try{
    const rectified=await rectifyForVatOcr(img,corners,onProgress);
    if(rectified)return rectified;
   }catch{
    onProgress("Kunne ikke rette opp automatisk. Prøver vanlig kvitteringsutsnitt …");
   }
  }
  const geometry=vatOcrGeometry(img.naturalWidth,img.naturalHeight,bounds);
  // Long, narrow thermal receipts become illegible when a 5-8 MP photograph
  // is squeezed into one 2.6 MP page. Read consecutive overlapping sections
  // at higher resolution instead; the original file remains unchanged.
  const segments=vatOcrSegments(geometry);
  if(segments.length){
   const sections=[];
   for(const [index,part] of segments.entries()){
    out=document.createElement("canvas");
    out.width=part.width;out.height=part.height;
    const ctx=out.getContext("2d",{alpha:false});
    if(!ctx)throw Error("Kunne ikke klargjøre bildeutsnitt.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(img,part.sx,part.sy,part.sw,part.sh,0,0,out.width,out.height);
    const blob=await new Promise(resolve=>out.toBlob(resolve,"image/jpeg",.94));
    out.width=0;out.height=0;
    if(!blob||blob.size<12)throw Error("Kunne ikke lagre bildeutsnitt.");
    sections.push(new File([blob],"kvittering-tekst-del-"+(index+1)+".jpg",{type:"image/jpeg"}));
   }
   onProgress("Lang kvittering: leser "+segments.length+" skarpe deler i stedet for ett nedskalert bilde …");
   return sections;
  }
  out=document.createElement("canvas");
  out.width=geometry.width;out.height=geometry.height;
  const context=out.getContext("2d",{alpha:false});
  if(!context)return file;
  context.fillStyle="#fff";context.fillRect(0,0,out.width,out.height);
  // Keep color for thermal and blue paper; Tesseract applies its own
  // adaptive thresholding. Premature hard binarization loses thin digits.
  context.drawImage(img,geometry.sx,geometry.sy,geometry.sw,geometry.sh,
   0,0,out.width,out.height);
  const blob=await new Promise(resolve=>out.toBlob(resolve,"image/jpeg",.94));
  if(!blob||blob.size<12)return file;
  onProgress(geometry.cropped
   ?"Kvitteringsområdet er funnet. Leser en tilpasset kopi …"
   :"Leser en tilpasset bildekopi …");
  return new File([blob],"tekstlesing-kopi.jpg",{type:"image/jpeg"});
 }catch(error){
  // OCR may still succeed on the original if a browser cannot make a copy.
  onProgress("Bildebehandling kunne ikke fullføres; prøver originalen …");
  return file;
 }finally{
  if(out){out.width=0;out.height=0;}
  URL.revokeObjectURL(url);
 }
}
