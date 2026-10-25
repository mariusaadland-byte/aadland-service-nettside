"use client";
import {useEffect,useRef,useState} from "react";
import {
 detectReceiptCorners,fullReceiptCorners,validReceiptCorners,
 receiptPerspectiveMatrix,receiptPerspectivePoint,receiptScanDimensions
} from "../../../../lib/vatReceiptCrop";

const MAX_SIZE=4*1024*1024;
const labels=["Øverst venstre","Øverst høyre","Nederst høyre","Nederst venstre"];
const percent=x=>(x*100).toFixed(3)+"%";
function cropFilename(file){
 const base=String(file?.name||"kvittering").replace(/\.[^.]+$/,"")
  .replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,78)||"kvittering";
 return base+"-rettet.jpg";
}
const length=(a,b,width,height)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);

// Resample the precise four-corner paper area into a rectangular white-page
// photo. Pixels outside the selected paper polygon are NEVER copied.
async function straightenReceipt(file,corners){
 if(!validReceiptCorners(corners))throw Error("De fire hjørnene danner ikke en gyldig kvittering. Juster punktene.");
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error("Kvitteringsbildet kunne ikke åpnes."));
   img.src=url;
  });
  const w=image.naturalWidth,h=image.naturalHeight;
  const matrix=receiptPerspectiveMatrix(corners);
  const dimensions=receiptScanDimensions(corners,w,h);
  if(!matrix||!dimensions||dimensions.width<100||dimensions.height<100)
   throw Error("Kvitteringsområdet er for lite. Juster hjørnene på nytt.");
  // Work with a bounded source resolution to prevent Safari from exhausting RAM.
  const srcScale=Math.min(1,3000/Math.max(w,h),Math.sqrt(7500000/(w*h)));
  const source=document.createElement("canvas");
  source.width=Math.max(1,Math.round(w*srcScale));
  source.height=Math.max(1,Math.round(h*srcScale));
  const srcCtx=source.getContext("2d",{willReadFrequently:true});
  if(!srcCtx)throw Error("Telefonen støtter ikke dokumentskanning.");
  srcCtx.drawImage(image,0,0,source.width,source.height);
  const srcW=source.width,srcH=source.height;
  const input=srcCtx.getImageData(0,0,srcW,srcH).data;
  const out=document.createElement("canvas");
  out.width=dimensions.width;out.height=dimensions.height;
  const outputContext=out.getContext("2d",{alpha:false});
  if(!outputContext)throw Error("Telefonen kunne ikke lage det beskårne bildet.");
  const imageData=outputContext.createImageData(out.width,out.height);
  const result=imageData.data;
  const [a,b,c,d,e,f,g,j]=matrix;
  // Bilinear interpolation preserves small receipt text when de-skewing.
  for(let y=0;y<out.height;y++){
   const v=y/Math.max(1,out.height-1);
   for(let x=0;x<out.width;x++){
    const u=x/Math.max(1,out.width-1),denom=g*u+j*v+1;
    const pos=(y*out.width+x)*4;
    if(Math.abs(denom)<1e-9){
     result[pos]=255;result[pos+1]=255;result[pos+2]=255;result[pos+3]=255;continue;
    }
    const fx=Math.max(0,Math.min(srcW-1,(a*u+b*v+c)/denom*(srcW-1)));
    const fy=Math.max(0,Math.min(srcH-1,(d*u+e*v+f)/denom*(srcH-1)));
    const left=Math.floor(fx),top=Math.floor(fy);
    const right=Math.min(srcW-1,left+1),bottom=Math.min(srcH-1,top+1);
    const dx=fx-left,dy=fy-top;
    const k00=(top*srcW+left)*4,k10=(top*srcW+right)*4;
    const k01=(bottom*srcW+left)*4,k11=(bottom*srcW+right)*4;
    for(let channel=0;channel<3;channel++){
     const topValue=input[k00+channel]*(1-dx)+input[k10+channel]*dx;
     const bottomValue=input[k01+channel]*(1-dx)+input[k11+channel]*dx;
     result[pos+channel]=Math.round(topValue*(1-dy)+bottomValue*dy);
    }
    result[pos+3]=255;
   }
  }
  source.width=0;source.height=0;
  outputContext.putImageData(imageData,0,0);
  for(const quality of [.9,.82,.72,.60]){
   const blob=await new Promise(resolve=>out.toBlob(resolve,"image/jpeg",quality));
   if(blob?.size>=12&&blob.size<=MAX_SIZE){
    out.width=0;out.height=0;
    return new File([blob],cropFilename(file),{type:"image/jpeg"});
   }
  }
  out.width=0;out.height=0;
  throw Error("Det ferdige dokumentbildet er for stort. Ta bilde litt lenger unna.");
 }finally{URL.revokeObjectURL(url);}
}
export default function VatReceiptCropper({file,onApply,onCancel,disabled=false}){
 const [url,setUrl]=useState("");
 const [ready,setReady]=useState(false);
 const [corners,setCorners]=useState(fullReceiptCorners);
 const [autoCorners,setAutoCorners]=useState(null);
 const [preview,setPreview]=useState(null);
 const [previewUrl,setPreviewUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const drag=useRef(null);
 const previewUrlRef=useRef("");
 useEffect(()=>{
  let active=true;
  const link=URL.createObjectURL(file);
  setUrl(link);setReady(false);setAutoCorners(null);
  setCorners(fullReceiptCorners());setPreview(null);setError("");
  const img=new Image();
  img.onload=()=>{
   if(!active)return;
   try{
    const scale=Math.min(1,650/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(ctx){
     ctx.drawImage(img,0,0,canvas.width,canvas.height);
     const found=detectReceiptCorners(ctx.getImageData(0,0,canvas.width,canvas.height));
     if(found){setCorners(found);setAutoCorners(found);}
    }
    canvas.width=0;canvas.height=0;
   }catch{
    // On an uncertain background, let the user position all four corners.
   }
   setReady(true);
  };
  img.onerror=()=>{if(active){setError("Kunne ikke åpne bildet. Ta et nytt bilde.");setReady(false);}};
  img.src=link;
  return ()=>{active=false;URL.revokeObjectURL(link);};
 },[file]);
 useEffect(()=>{
  if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);
  previewUrlRef.current=preview?URL.createObjectURL(preview):"";
  setPreviewUrl(previewUrlRef.current);
  return ()=>{if(previewUrlRef.current){URL.revokeObjectURL(previewUrlRef.current);previewUrlRef.current="";}};
 },[preview]);
 function startDrag(event){
  const index=Number(event.target?.dataset?.corner);
  if(!Number.isInteger(index)||index<0||index>3||disabled||busy)return;
  event.preventDefault();drag.current={id:event.pointerId,index};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function moveDrag(event){
  if(!drag.current||drag.current.id!==event.pointerId)return;
  const bounds=event.currentTarget.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const x=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));
  const y=Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height));
  setCorners(current=>{
   const next=current.map((point,index)=>index===drag.current.index?{x,y}:point);
   return validReceiptCorners(next)?next:current;
  });
 }
 function endDrag(event){
  if(drag.current?.id!==event.pointerId)return;
  drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function adjust(index,axis,percent){
  setCorners(current=>{
   const next=current.map((point,i)=>i===index?{...point,[axis]:Number(percent)/100}:point);
   return validReceiptCorners(next)?next:current;
  });
 }
 async function generate(){
  if(disabled||busy||!ready||!validReceiptCorners(corners))return;
  setError("");setBusy(true);
  try{
   const img=await straightenReceipt(file,corners);
   setPreview(img);
  }catch(e){setError(e.message||"Beskjæring mislyktes.");}
  finally{setBusy(false);}
 }
 async function approve(){
  if(!preview||busy||disabled)return;
  setBusy(true);setError("");
  try{await onApply(preview,{cropped:true});}
  catch(e){setError(e.message||"Kunne ikke bruke kvitteringsbildet.");}
  finally{setBusy(false);}
 }
 const styleButton={border:"1px solid #98b2a7",background:"#fff",padding:"11px 14px",borderRadius:10,fontSize:14,fontWeight:650,color:"#244a43",cursor:"pointer"};
 const valid=validReceiptCorners(corners);
 return <section style={{border:"2px solid #b5cec5",borderRadius:14,padding:14,margin:"13px 0",background:"#f4faf8"}}>
  <h3 style={{margin:"0 0 8px"}}>{preview?"Se kvitteringen uten bakgrunn":"Finn selve kvitteringen"}</h3>
  {!preview?<><p style={{fontSize:13}}>
   {autoCorners?"De grønne prikkene er foreslått automatisk. Sjekk at de står på alle fire papirkantene.":
    "Bakgrunnen gjør kantene vanskelige å oppdage. Dra hver grønne prikk til et hjørne av kvitteringen."}
   {" "}Da fjernes alt utenfor kvitteringen, også hvis den er tatt på skrå.
  </p>
   <div style={{maxWidth:600,margin:"0 auto",position:"relative",background:"#1e2930",borderRadius:8,overflow:"hidden"}}>
    {url&&<img src={url} alt="Plasser de fire grønne hjørnene rundt kvitteringen"
     style={{display:"block",width:"100%",height:"auto"}}/>}
    {ready&&<div style={{position:"absolute",inset:0,touchAction:"none"}}
     onPointerDown={startDrag} onPointerMove={moveDrag}
     onPointerUp={endDrag} onPointerCancel={endDrag}>
     <svg viewBox="0 0 1000 1000" preserveAspectRatio="none"
      aria-hidden="true" style={{position:"absolute",width:"100%",height:"100%",inset:0,pointerEvents:"none"}}>
      <polygon points={corners.map(p=>[p.x*1000,p.y*1000].join(",")).join(" ")}
       fill="rgba(40,200,100,.13)" stroke="#20db79" strokeWidth="5" vectorEffect="non-scaling-stroke"/>
     </svg>
     {corners.map((point,i)=><span key={i} data-corner={i}
      title={labels[i]} aria-label={labels[i]}
      style={{position:"absolute",left:percent(point.x),top:percent(point.y),
       transform:"translate(-50%,-50%)",width:35,height:35,borderRadius:"50%",
       border:"3px solid white",background:"#16a34a",boxSizing:"border-box",
       boxShadow:"0 0 0 2px #064e3b",touchAction:"none",cursor:"grab"}}/>)}
    </div>}
   </div>
   <p style={{fontSize:12,color:"#4f615a"}}>Dra de fire grønne hjørnene slik at rammen følger papiret, ikke bordet.</p>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {autoCorners&&<button type="button" style={styleButton} disabled={busy||disabled} onClick={()=>setCorners(autoCorners)}>Finn kantene på nytt</button>}
    <button type="button" style={styleButton} disabled={busy||disabled} onClick={()=>setCorners(fullReceiptCorners())}>Bruk hele bildet</button>
   </div>
   <details style={{fontSize:13,margin:"12px 0"}}>
    <summary>Finjuster hjørnene med skyveknapper</summary>
    <div style={{display:"grid",gap:10,marginTop:12}}>
     {corners.map((point,i)=><div key={i} style={{borderBottom:"1px solid #c3d7d0",paddingBottom:8}}>
      <strong>{labels[i]}</strong>
      {["x","y"].map(axis=><label key={axis} style={{display:"block"}}>
       {axis==="x"?"Vannrett":"Loddrett"}
       <input type="range" min="0" max="100" step="1" value={Math.round(point[axis]*100)}
        onChange={event=>adjust(i,axis,event.target.value)} disabled={busy||disabled}
        style={{display:"block",width:"100%"}}/>
      </label>)}
     </div>)}
    </div>
   </details>
  </>:<>
   {previewUrl&&<div style={{maxWidth:480,margin:"12px auto",background:"#fff",padding:0}}>
    <img src={previewUrl} alt="Ferdig opprettet kvittering: bare papiret, uten omgivelsene"
     style={{display:"block",width:"100%",height:"auto"}}/>
   </div>}
   <p style={{fontSize:13}}>Dette er bildet som blir lest og lagret som kopi. Ser du bare kvitteringen og all tekst?</p>
  </>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  <p style={{fontSize:12,color:"#4f615a"}}>Dette blir en opprettet JPEG-kopi. Behold kamerabildet som originalbilag i regnskapet.</p>
  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
   {!preview?<button type="button" onClick={generate} disabled={!ready||!valid||busy||disabled}
    style={{...styleButton,background:"#18684c",color:"#fff"}}>
    {busy?"Retter opp kvitteringen …":"Vis bare kvitteringen"}
   </button>:<>
    <button type="button" onClick={approve} disabled={busy||disabled}
     style={{...styleButton,background:"#18684c",color:"#fff"}}>
     {busy?"Leser …":"Bruk dette bildet"}
    </button>
    <button type="button" onClick={()=>{setPreview(null);setError("");}} disabled={busy||disabled} style={styleButton}>Juster hjørnene</button>
   </>}
   <button type="button" onClick={onCancel} disabled={busy||disabled} style={styleButton}>Avbryt</button>
  </div>
 </section>;
}
