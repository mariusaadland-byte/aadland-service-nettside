// Browser-only construction of one PDF attachment from multiple receipt photos.
// Never upload photos here; final saved attachment is one PDF copy under 4 MB.
export const VAT_MULTI_PAGE_LIMIT=8;
export const VAT_MULTI_PAGE_MAX_BYTES=4*1024*1024;
const SOURCE_MAX_BYTES=25*1024*1024;
const acceptedImageTypes=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
const mimeFromExtension={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",heif:"image/heif"};
const enc=new TextEncoder();

export function isVatMultiPageImage(file){
 if(!file||!Number.isFinite(file.size)||file.size<12||file.size>SOURCE_MAX_BYTES)return false;
 const ext=String(file.name||"").split(".").pop().toLowerCase();
 const type=String(file.type||mimeFromExtension[ext]||"").toLowerCase();
 return acceptedImageTypes.has(type)&&Object.keys(mimeFromExtension).includes(ext)&&
  (type===mimeFromExtension[ext]||type==="image/jpeg"&&ext==="jpg");
}
const ascii=value=>enc.encode(value);
const concat=parts=>{
 const length=parts.reduce((sum,part)=>sum+part.length,0);
 const result=new Uint8Array(length);
 let position=0;
 for(const part of parts){result.set(part,position);position+=part.length;}
 return result;
};

// JPEG streams are embedded directly as image XObjects. They are not
// recompressed while building the PDF, preserving the reviewed page images.
export function buildVatReceiptPdf(jpegs){
 if(!Array.isArray(jpegs)||jpegs.length<1||jpegs.length>VAT_MULTI_PAGE_LIMIT)
  throw Error("Velg mellom 1 og 8 sider.");
 const chunks=[],offsets=[0];
 let position=0;
 function push(value){
  const bytes=typeof value==="string"?ascii(value):value;
  chunks.push(bytes);position+=bytes.length;
 }
 function startObject(id){offsets[id]=position;push(id+" 0 obj\n");}
 function endObject(){push("endobj\n");}
 push(ascii("%PDF-1.4\n"));
 push(new Uint8Array([37,226,227,207,211,10]));
 const pageIds=jpegs.map((_,i)=>3+i*3);
 startObject(1);push("<< /Type /Catalog /Pages 2 0 R >>\n");endObject();
 startObject(2);
 push("<< /Type /Pages /Count "+jpegs.length+" /Kids ["+pageIds.map(i=>i+" 0 R").join(" ")+"] >>\n");
 endObject();
 for(let i=0;i<jpegs.length;i++){
  const {bytes,width,height}=jpegs[i];
  if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||
   !Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)
   throw Error("En av sidene er ikke et gyldig JPEG-bilde.");
  const page=pageIds[i],contents=page+1,image=page+2;
  const w=Math.max(100,Math.round(width*.36)),h=Math.max(100,Math.round(height*.36));
  startObject(page);
  push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+w+" "+h+
   "] /Resources << /XObject << /Im0 "+image+" 0 R >> >> /Contents "+contents+" 0 R >>\n");
  endObject();
  const commands=ascii("q\n"+w+" 0 0 "+h+" 0 0 cm\n/Im0 Do\nQ\n");
  startObject(contents);
  push("<< /Length "+commands.length+" >>\nstream\n");
  push(commands);push("endstream\n");endObject();
  startObject(image);
  push("<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+
   " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+bytes.length+" >>\nstream\n");
  push(bytes);push("\nendstream\n");endObject();
 }
 const xref=position,totalObjects=2+jpegs.length*3;
 push("xref\n0 "+(totalObjects+1)+"\n0000000000 65535 f \n");
 for(let i=1;i<=totalObjects;i++)push(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
 push("trailer\n<< /Size "+(totalObjects+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
 return concat(chunks);
}

async function jpegCopy(source,longSide,quality){
 const url=URL.createObjectURL(source);
 try{
  const img=await new Promise((resolve,reject)=>{
   const element=new Image();
   element.onload=()=>resolve(element);
   element.onerror=()=>reject(Error("Kunne ikke åpne sidebildet. Bruk JPG eller PNG dersom telefonen ikke støtter HEIC."));
   element.src=url;
  });
  const width=img.naturalWidth,height=img.naturalHeight;
  if(width<350||height<350)throw Error("Et bilde er for lite til sikker tekstlesing. Ta det på nytt.");
  const ratio=Math.min(1,longSide/Math.max(width,height),Math.sqrt(5200000/(width*height)));
  const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  const canvas=document.createElement("canvas");
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("Telefonen kunne ikke lage PDF-sidene.");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
  canvas.width=0;canvas.height=0;
  if(!blob||blob.size<12)throw Error("Kunne ikke klargjøre et sidebilde.");
  return {bytes:new Uint8Array(await blob.arrayBuffer()),width:w,height:h};
 }finally{URL.revokeObjectURL(url);}
}

export async function createVatMultiPageReceipt(sources,onProgress=()=>{}){
 if(!Array.isArray(sources)||sources.length<2||sources.length>VAT_MULTI_PAGE_LIMIT)
  throw Error("Velg 2–8 bilder av samme kvittering.");
 for(const source of sources)if(!isVatMultiPageImage(source))
  throw Error("Alle sider må være JPG, PNG, WebP eller HEIC og maks 25 MB per bilde.");
 const settings=[
  [2200,.86],[2000,.78],[1800,.70],[1600,.62],[1400,.55]
 ];
 for(const [longSide,quality] of settings){
  const jpegs=[];
  for(let i=0;i<sources.length;i++){
   onProgress("Klargjør side "+(i+1)+" av "+sources.length+" …");
   jpegs.push(await jpegCopy(sources[i],longSide,quality));
  }
  const pdf=buildVatReceiptPdf(jpegs);
  if(pdf.length<=VAT_MULTI_PAGE_MAX_BYTES){
   const file=new File([pdf],"kvittering-"+sources.length+"-sider.pdf",{type:"application/pdf"});
   const ocrImages=jpegs.map((page,i)=>new File([page.bytes],"kvittering-side-"+(i+1)+".jpg",{type:"image/jpeg"}));
   return {file,ocrImages};
  }
 }
 throw Error("PDF-en overstiger 4 MB selv etter tilpasning. Bruk færre sider eller skarpere, mindre bilder. Ingen bilag er erstattet.");
}
