"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {detectReceiptCorners} from "../../../../lib/vatReceiptCrop";
import {vatCameraVisibleFrame} from "../../../../lib/vatCameraVisibleFrame";
import styles from "./VatSimpleForm.module.css";

// The full camera feed is captured, never just the green guide polygon.
// The overlay uses the visible video dimensions, including letterboxing,
// so its lines stay on the paper even when iPhone cameras change aspect.
export default function VatReceiptLiveCamera({onCapture,onCancel,disabled=false}){
 const videoRef=useRef(null),streamRef=useRef(null),stageRef=useRef(null);
 const closeRef=useRef(null),previousFocus=useRef(null),dialogRef=useRef(null);
 const cancelRef=useRef(onCancel),capturingRef=useRef(false),reviewRef=useRef(false);
 cancelRef.current=onCancel;
 const [mounted,setMounted]=useState(false);
 const [corners,setCorners]=useState(null);
 const [previewBox,setPreviewBox]=useState(null);
 const [error,setError]=useState("");
 const [ready,setReady]=useState(false);
 const [capturing,setCapturing]=useState(false);
 const [photo,setPhoto]=useState(null);
 reviewRef.current=Boolean(photo);
 useEffect(()=>()=>{if(photo?.url)URL.revokeObjectURL(photo.url);},[photo]);

 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{
  if(!mounted)return;
  const body=document.body;
  const scrollY=window.scrollY;
  previousFocus.current=document.activeElement;
  const before={position:body.style.position,top:body.style.top,
   left:body.style.left,right:body.style.right,width:body.style.width,
   overflow:body.style.overflow};
  body.style.position="fixed";
  body.style.top="-"+scrollY+"px";
  body.style.left="0";body.style.right="0";
  body.style.width="100%";body.style.overflow="hidden";
  closeRef.current?.focus();
  const onKey=e=>{
   if(e.key==="Escape"&&!capturingRef.current){e.preventDefault();cancelRef.current();}
   if(e.key==="Tab"){
    const buttons=[...(dialogRef.current?.querySelectorAll("button:not([disabled])")||[])];
    if(!buttons.length)return;
    const first=buttons[0],last=buttons[buttons.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  };
  window.addEventListener("keydown",onKey);
  return ()=>{
   window.removeEventListener("keydown",onKey);
   for(const key of Object.keys(before))body.style[key]=before[key];
   window.scrollTo(0,scrollY);
   previousFocus.current?.focus?.();
  };
 },[mounted]);

 useEffect(()=>{
  if(!mounted)return;
  let canceled=false,timer=null;
  const updateOverlay=()=>{
   const video=videoRef.current,stage=stageRef.current;
   if(!video?.videoWidth||!video?.videoHeight||!stage?.clientWidth||!stage?.clientHeight)return;
   const frame=vatCameraVisibleFrame(stage.clientWidth,stage.clientHeight,video.videoWidth,video.videoHeight);
   if(frame)setPreviewBox(frame);
  };
  const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(updateOverlay):null;
  if(stageRef.current)observer?.observe(stageRef.current);
  window.addEventListener("resize",updateOverlay);
  async function start(){
   if(!navigator.mediaDevices?.getUserMedia){
    setError("Nettleseren støtter ikke direkteskanning. Lukk og bruk vanlig kamera.");return;
   }
   try{
    const stream=await navigator.mediaDevices.getUserMedia({
     audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:2560}}
    });
    if(canceled){stream.getTracks().forEach(track=>track.stop());return;}
    streamRef.current=stream;
    const video=videoRef.current;
    if(!video){stream.getTracks().forEach(track=>track.stop());streamRef.current=null;return;}
    video.srcObject=stream;
    await video.play();
    if(canceled)return;
    setReady(true);
    updateOverlay();
    const preview=document.createElement("canvas");
    const ctx=preview.getContext("2d",{willReadFrequently:true});
    if(!ctx)return;
    timer=setInterval(()=>{
     if(reviewRef.current||video.readyState<2||!video.videoWidth||!video.videoHeight||canceled)return;
     try{
      const scale=Math.min(1,280/Math.max(video.videoWidth,video.videoHeight));
      preview.width=Math.max(80,Math.round(video.videoWidth*scale));
      preview.height=Math.max(80,Math.round(video.videoHeight*scale));
      ctx.drawImage(video,0,0,preview.width,preview.height);
      setCorners(detectReceiptCorners(ctx.getImageData(0,0,preview.width,preview.height)));
     }catch{setCorners(null);}
    },550);
   }catch{
    if(!canceled)setError("Fikk ikke tilgang til kameraet. Sjekk kameratillatelsen, eller lukk og bruk vanlig kamera.");
   }
  }
  void start();
  return ()=>{
   canceled=true;
   if(timer!==null)clearInterval(timer);
   observer?.disconnect();
   window.removeEventListener("resize",updateOverlay);
   const stream=streamRef.current;
   if(stream){stream.getTracks().forEach(track=>track.stop());streamRef.current=null;}
   if(videoRef.current)videoRef.current.srcObject=null;
  };
 },[mounted]);

 async function takePicture(){
  const video=videoRef.current;
  if(disabled||capturing||photo||!ready||!video?.videoWidth)return;
  capturingRef.current=true;setCapturing(true);setError("");
  try{
   const canvas=document.createElement("canvas");
   const scale=Math.min(1,3000/Math.max(video.videoWidth,video.videoHeight));
   canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
   canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("Kameraet kunne ikke ta bildet.");
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.91));
   canvas.width=0;canvas.height=0;
   if(!blob||blob.size<12)throw Error("Kunne ikke lagre kamerabildet.");
   const file=new File([blob],"kvittering-kamera.jpg",{type:"image/jpeg"});
   // Retaking leaves the previous form and accounting attachment unchanged.
   const url=URL.createObjectURL(blob);
   setPhoto({file,url});
  }catch(e){setError(String(e.message||"Klarte ikke å ta bildet."));}
  finally{capturingRef.current=false;setCapturing(false);}
 }

 async function acceptPhoto(){
  if(!photo||disabled||capturingRef.current)return;
  capturingRef.current=true;setCapturing(true);setError("");
  try{await onCapture(photo.file);}
  catch(e){setError(String(e?.message||"Kunne ikke bruke bildet. Prøv igjen."));}
  finally{capturingRef.current=false;setCapturing(false);}
 }
 function retakePhoto(){
  if(capturing||disabled)return;
  setPhoto(null);setError("");setCorners(null);
 }
 if(!mounted)return null;
 const outline=corners?.map(p=>`${(p.x*100).toFixed(2)},${(p.y*100).toFixed(2)}`).join(" ")||"";
 return createPortal(<div ref={dialogRef} className={styles.liveCameraFullscreen} role="dialog"
  aria-modal="true" aria-label="Skann kvittering i fullskjerm">
  <header className={styles.liveCameraHeader}>
   <div><strong>{photo?"Kontroller bildet":"Skann kvittering"}</strong>
    <span>{photo?"Les hele kvitteringen før du fortsetter":"Hold hele kvitteringen synlig i kameraet"}</span></div>
   <button ref={closeRef} type="button" onClick={onCancel} disabled={capturing}
    className={styles.liveCameraClose} aria-label="Lukk skanneren">✕ Lukk</button>
  </header>
  <div ref={stageRef} className={styles.liveCameraStage}>
   <video ref={videoRef} autoPlay playsInline muted className={styles.liveCameraVideo}
    style={photo?{visibility:"hidden"}:undefined}
    onLoadedMetadata={()=>{const video=videoRef.current,stage=stageRef.current;
     if(!video?.videoWidth||!stage)return;
     const frame=vatCameraVisibleFrame(stage.clientWidth,stage.clientHeight,video.videoWidth,video.videoHeight);
     if(frame)setPreviewBox(frame);
    }}/>
   {photo&&<img className={styles.liveCameraPhotoReview} src={photo.url}
    alt="Bildet du nettopp tok av kvitteringen. Kontroller at hele papiret er med og teksten er skarp."/>}
   {!photo&&outline&&previewBox&&<svg className={styles.liveCameraOutline} viewBox="0 0 100 100"
    style={{left:previewBox.left,top:previewBox.top,width:previewBox.width,height:previewBox.height}}
    preserveAspectRatio="none" aria-hidden="true">
    <polygon points={outline} fill="rgba(18,160,106,.08)" stroke="#26d894"
     strokeWidth=".8" strokeLinejoin="round"/>
   </svg>}
   {!photo&&!ready&&!error&&<p className={styles.liveCameraHint}>Starter kamera …</p>}
  </div>
  <footer className={styles.liveCameraFooter}>
   <p className={styles.liveCameraStatus} aria-live="polite">{photo
    ?"Ser du hele kvitteringen tydelig? Velg Bruk bildet, eller ta et nytt bilde."
    :corners
    ?"Grønn ramme funnet. Hold telefonen stille og ta bildet."
    :"Legg hele kvitteringen på et mørkere underlag. Ta bilde også uten grønn ramme."}</p>
   {error&&<p role="alert" className={styles.liveCameraError}>{error}</p>}
   {photo?<div className={styles.liveCameraReviewActions}>
    <button type="button" onClick={retakePhoto} disabled={disabled||capturing}
     className={styles.liveCameraRetake}>Ta på nytt</button>
    <button type="button" onClick={acceptPhoto} disabled={disabled||capturing}
     className={styles.liveCameraCapture} aria-label="Bruk det fotograferte kvitteringsbildet">
     {capturing?"Behandler …":"Bruk bildet"}
    </button>
   </div>:<button type="button" onClick={takePicture} disabled={!ready||disabled||capturing}
    className={styles.liveCameraCapture} aria-label="Ta bilde av kvitteringen">
    <span aria-hidden="true" className={styles.liveCameraShutterIcon}/>
    {capturing?"Tar bilde …":"Ta bilde"}
   </button>
  </footer>
 </div>,document.body);
}
