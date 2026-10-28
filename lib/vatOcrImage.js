// Fast OCR-only copies: keep the customer's original receipt file untouched.
// Source photos can be 12+ megapixels even when their JPEG size is below 4 MB.
import {detectReceiptBounds} from "./vatReceiptCrop";

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
  let bounds=null;
  try{
   preview=document.createElement("canvas");
   const k=Math.min(1,520/Math.max(img.naturalWidth,img.naturalHeight));
   preview.width=Math.round(img.naturalWidth*k);
   preview.height=Math.round(img.naturalHeight*k);
   const context=preview.getContext("2d",{willReadFrequently:true});
   if(context){
    context.drawImage(img,0,0,preview.width,preview.height);
    bounds=detectReceiptBounds(context.getImageData(0,0,preview.width,preview.height));
   }
  }catch{
   bounds=null;
  }finally{
   if(preview){preview.width=0;preview.height=0;}
  }
  const geometry=vatOcrGeometry(img.naturalWidth,img.naturalHeight,bounds);
  // Long, narrow thermal receipts become illegible when a 5-8 MP photograph
  // is squeezed into one 2.6 MP page. Read consecutive overlapping sections
  // at higher resolution instead; the original file remains unchanged.
  if(geometry.sh>2400&&geometry.sh/geometry.sw>2.15){
   const count=Math.min(3,Math.max(2,Math.ceil(geometry.sh/(geometry.sw*1.55))));
   const sectionHeight=geometry.sh/count;
   const overlap=Math.min(geometry.sh*.035,geometry.sw*.10);
   const sections=[];
   for(let index=0;index<count;index++){
    const top=Math.max(geometry.sy,Math.floor(geometry.sy+index*sectionHeight-(index?overlap:0)));
    const bottom=Math.min(geometry.sy+geometry.sh,
     Math.ceil(geometry.sy+(index+1)*sectionHeight+(index<count-1?overlap:0)));
    const sectionH=bottom-top;
    const scale=Math.min(1,2200/Math.max(geometry.sw,sectionH),
     Math.sqrt(2600000/(geometry.sw*sectionH)));
    out=document.createElement("canvas");
    out.width=Math.max(1,Math.round(geometry.sw*scale));
    out.height=Math.max(1,Math.round(sectionH*scale));
    const ctx=out.getContext("2d",{alpha:false});
    if(!ctx)throw Error("Kunne ikke klargjøre bildeutsnitt.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(img,geometry.sx,top,geometry.sw,sectionH,0,0,out.width,out.height);
    const blob=await new Promise(resolve=>out.toBlob(resolve,"image/jpeg",.94));
    out.width=0;out.height=0;
    if(!blob||blob.size<12)throw Error("Kunne ikke lagre bildeutsnitt.");
    sections.push(new File([blob],"kvittering-tekst-del-"+(index+1)+".jpg",{type:"image/jpeg"}));
   }
   onProgress("Lang kvittering: leser "+count+" skarpe deler i stedet for ett nedskalert bilde …");
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
