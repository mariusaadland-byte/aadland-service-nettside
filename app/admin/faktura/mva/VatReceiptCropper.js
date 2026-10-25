"use client";
import {useEffect,useRef,useState} from "react";
import {clampReceiptBounds,cropReceiptPixels,detectReceiptBounds,fullReceiptBounds} from "../../../../lib/vatReceiptCrop";

const MAX_SIZE=4*1024*1024;
const pct=v=>Math.round(v*100);
const corners=["nw","ne","sw","se"];
const cornerStyle={
 nw:{top:-10,left:-10},ne:{top:-10,right:-10},
 sw:{bottom:-10,left:-10},se:{bottom:-10,right:-10}
};
function receiptCropName(file){
 const base=String(file?.name||"kvittering").replace(/\.[^.]+$/,"")
  .replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,85)||"kvittering";
 return base+"-beskjaert.jpg";
}
async function makeCrop(file,bounds){
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>resolve(image);
   image.onerror=()=>reject(Error("Kunne ikke åpne kvitteringen for beskjæring."));
   image.src=url;
  });
  const rect=cropReceiptPixels(img.naturalWidth,img.naturalHeight,bounds);
  const ratio=Math.min(1,2600/Math.max(rect.width,rect.height),Math.sqrt(8000000/(rect.width*rect.height)));
  let scale=ratio;
  for(let attempt=0;attempt<5;attempt++){
   const canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.floor(rect.width*scale));
   canvas.height=Math.max(1,Math.floor(rect.height*scale));
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("Telefonen støtter ikke bildebeskjæring.");
   ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(img,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.89-attempt*.075));
   canvas.width=0;canvas.height=0;
   if(blob&&blob.size>=12&&blob.size<=MAX_SIZE){
    return new File([blob],receiptCropName(file),{type:"image/jpeg"});
   }
   scale*=.79;
  }
  throw Error("Bildet kunne ikke lagres under 4 MB. Bruk et mindre bilde.");
 }finally{URL.revokeObjectURL(url);}
}
export default function VatReceiptCropper({file,onApply,onCancel,disabled=false}){
 const [url,setUrl]=useState("");
 const [bounds,setBounds]=useState(fullReceiptBounds);
 const [suggested,setSuggested]=useState(null);
 const [imageReady,setImageReady]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const drag=useRef(null);
 useEffect(()=>{
  if(!file)return;
  let live=true;const blobUrl=URL.createObjectURL(file);
  setUrl(blobUrl);setLoading(true);setError("");setImageReady(false);
  setBounds(fullReceiptBounds());setSuggested(null);
  const img=new Image();
  img.onload=()=>{
   if(!live)return;
   // Small canvas lets us locate a pale receipt against a dark tabletop.
   // This may fail for white/light surfaces; always allow manual positioning.
   try{
    const scale=Math.min(1,700/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(ctx){
     ctx.drawImage(img,0,0,canvas.width,canvas.height);
     const recommendation=detectReceiptBounds(ctx.getImageData(0,0,canvas.width,canvas.height));
     if(recommendation){setBounds(recommendation);setSuggested(recommendation);}
    }
    canvas.width=0;canvas.height=0;
   }catch{ /* Unsupported canvas analysis must not stop manual cropping. */ }
   setImageReady(true);setLoading(false);
  };
  img.onerror=()=>{if(live){setError("Kunne ikke vise kvitteringsbildet. Velg et annet bilde.");setLoading(false);}};
  img.src=blobUrl;
  return ()=>{live=false;URL.revokeObjectURL(blobUrl);};
 },[file]);
 function pointerDown(event){
  if(disabled||saving)return;
  const handle=event.target.closest("[data-handle]")?.dataset.handle||"move";
  event.preventDefault();
  drag.current={id:event.pointerId,mode:handle,from:bounds,pointX:event.clientX,pointY:event.clientY};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function pointerMove(event){
  if(!drag.current||drag.current.id!==event.pointerId)return;
  const parent=event.currentTarget.parentElement?.getBoundingClientRect();
  if(!parent?.width||!parent?.height)return;
  const {mode,from,pointX,pointY}=drag.current;
  const dx=(event.clientX-pointX)/parent.width,dy=(event.clientY-pointY)/parent.height;
  const limit=(n,a,b)=>Math.max(a,Math.min(b,n));
  let left=from.x,top=from.y,right=from.x+from.w,bottom=from.y+from.h;
  if(mode==="move"){
   left=limit(from.x+dx,0,1-from.w);
   top=limit(from.y+dy,0,1-from.h);
   right=left+from.w;bottom=top+from.h;
  }else{
   if(mode.includes("w"))left=limit(from.x+dx,0,right-.08);
   if(mode.includes("e"))right=limit(from.x+from.w+dx,left+.08,1);
   if(mode.includes("n"))top=limit(from.y+dy,0,bottom-.08);
   if(mode.includes("s"))bottom=limit(from.y+from.h+dy,top+.08,1);
  }
  setBounds({x:left,y:top,w:right-left,h:bottom-top});
 }
 function pointerUp(event){
  if(drag.current?.id!==event.pointerId)return;
  drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function changeEdge(side,value){
  setBounds(old=>{
   const p=Math.max(0,Math.min(1,Number(value)/100));
   const left=old.x,top=old.y,right=old.x+old.w,bottom=old.y+old.h;
   if(side==="left")return {...old,x:Math.min(p,right-.08),w:right-Math.min(p,right-.08)};
   if(side==="right")return {...old,w:Math.max(.08,p-left)};
   if(side==="top")return {...old,y:Math.min(p,bottom-.08),h:bottom-Math.min(p,bottom-.08)};
   return {...old,h:Math.max(.08,p-top)};
  });
 }
 async function useCrop(){
  if(disabled||saving||!imageReady)return;
  setSaving(true);setError("");
  try{
   // A deliberately full-image selection should preserve the original,
   // unless an earlier HEIC conversion was required.
   const isWhole=bounds.x<.001&&bounds.y<.001&&bounds.w>.998&&bounds.h>.998;
   const result=isWhole?file:await makeCrop(file,clampReceiptBounds(bounds));
   await onApply(result,{cropped:!isWhole});
  }catch(e){setError(e.message||"Kunne ikke behandle bildet.");}
  finally{setSaving(false);}
 }
 const btn={border:"1px solid #99ada8",borderRadius:9,padding:"11px 13px",background:"#fff",color:"#234c46",fontWeight:650,fontSize:13,cursor:"pointer"};
 const sliders=[
  ["left","Venstre",bounds.x,0,bounds.x+bounds.w-.08],
  ["top","Topp",bounds.y,0,bounds.y+bounds.h-.08],
  ["right","Høyre",bounds.x+bounds.w,bounds.x+.08,1],
  ["bottom","Bunn",bounds.y+bounds.h,bounds.y+.08,1]
 ];
 return <section style={{border:"2px solid #9dbbb1",borderRadius:14,padding:14,margin:"12px 0",background:"#f4faf8"}}>
  <h3 style={{margin:"0 0 6px"}}>Beskjær kvitteringen</h3>
  <p style={{fontSize:13,margin:"0 0 11px"}}>{suggested
   ?"Jeg har foreslått kantene på kvitteringen. Kontroller at all tekst og totalsummen er innenfor rammen."
   :"Jeg fant ikke alle kantene sikkert. Dra hjørnene på rammen for å fjerne bakgrunnen."}</p>
  {loading&&<p role="status">Finner kvitteringskantene …</p>}
  <div style={{maxWidth:600,margin:"0 auto",position:"relative",touchAction:"none",overflow:"hidden",borderRadius:10,background:"#26352f"}}>
   {url&&<img src={url} alt="Forhåndsvisning av kvittering som kan beskjæres" style={{display:"block",width:"100%",height:"auto"}}/>}
   {imageReady&&<div style={{
    position:"absolute",left:pct(bounds.x)+"%",top:pct(bounds.y)+"%",
    width:pct(bounds.w)+"%",height:pct(bounds.h)+"%",
    border:"2px solid #22c55e",boxSizing:"border-box",
    boxShadow:"0 0 0 100vmax rgba(0,0,0,.48)",
    cursor:"move",touchAction:"none"
   }} role="group" aria-label="Flytt beskjæringsrammen eller dra i hjørnene"
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    {corners.map(corner=><span key={corner} data-handle={corner} style={{
     position:"absolute",...cornerStyle[corner],width:24,height:24,borderRadius:"50%",
     border:"2px solid #fff",background:"#16a34a",boxSizing:"border-box",touchAction:"none"
    }}/>)}
   </div>}
  </div>
  <p style={{fontSize:12,color:"#4f625d",marginTop:10}}>Dra de grønne hjørnene for å justere. Dra midt i rammen for å flytte den.</p>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"12px 0"}}>
   <button type="button" style={btn} onClick={()=>setBounds(fullReceiptBounds())} disabled={disabled||saving||!imageReady}>Hele bildet</button>
   {suggested&&<button type="button" style={btn} onClick={()=>setBounds(suggested)} disabled={disabled||saving}>Foreslå utsnitt på nytt</button>}
  </div>
  <details style={{fontSize:13,marginBottom:12}}>
   <summary>Finjuster kantene med skyveknapper</summary>
   <div style={{display:"grid",gap:8,margin:"12px 0"}}>
    {sliders.map(([key,title,value,min,max])=><label key={key}>{title}
     <input aria-label={title+" kant"} type="range" min={Math.round(min*100)} max={Math.round(max*100)}
      value={pct(value)} onChange={e=>changeEdge(key,e.target.value)}
      disabled={disabled||saving||!imageReady} style={{display:"block",width:"100%"}}/>
    </label>)}
   </div>
  </details>
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  <p style={{fontSize:12,color:"#4f625d"}}>Utsnittet lagres som JPEG-kopi sammen med bilaget. Behold det originale kamerabildet i regnskapssystemet.</p>
  <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
   <button type="button" onClick={useCrop} disabled={disabled||saving||!imageReady}
    style={{...btn,background:"#1f6b50",color:"#fff",borderColor:"#1f6b50"}}>
    {saving?"Lager utsnitt …":"Bruk utsnitt og les kvittering"}
   </button>
   <button type="button" onClick={onCancel} disabled={disabled||saving} style={btn}>Avbryt</button>
  </div>
 </section>;
}
