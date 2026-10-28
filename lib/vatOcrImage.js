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
