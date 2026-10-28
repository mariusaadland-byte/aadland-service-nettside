"use client";
import {useEffect,useRef,useState} from "react";
import {detectReceiptCorners} from "../../../../lib/vatReceiptCrop";
import styles from "./VatSimpleForm.module.css";

// Live edge hints, not an irreversible auto-crop: a receipt on a light
// surface may be impossible to detect reliably. The captured JPEG is full.
export default function VatReceiptLiveCamera({onCapture,onCancel,disabled=false}){
 const videoRef=useRef(null),streamRef=useRef(null);
 const [corners,setCorners]=useState(null);
 const [error,setError]=useState("");
 const [ready,setReady]=useState(false);
 const [capturing,setCapturing]=useState(false);
 useEffect(()=>{
  let canceled=false,timer=null;
  async function start(){
   if(!navigator.mediaDevices?.getUserMedia){
    setError("Nettleseren støtter ikke direkteskanning. Bruk vanlig kamera i stedet.");return;
   }
   try{
    const stream=await navigator.mediaDevices.getUserMedia({
     audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:2560}}
    });
    if(canceled){stream.getTracks().forEach(track=>track.stop());return;}
    streamRef.current=stream;
    const video=videoRef.current;
    if(!video){stream.getTracks().forEach(track=>track.stop());return;}
    video.srcObject=stream;
    await video.play();
    if(canceled)return;
    setReady(true);
    const preview=document.createElement("canvas");
    const ctx=preview.getContext("2d",{willReadFrequently:true});
    if(!ctx)return;
    timer=setInterval(()=>{
     if(video.readyState<2||!video.videoWidth||!video.videoHeight||canceled)return;
     try{
      const scale=Math.min(1,280/Math.max(video.videoWidth,video.videoHeight));
      preview.width=Math.max(80,Math.round(video.videoWidth*scale));
      preview.height=Math.max(80,Math.round(video.videoHeight*scale));
      ctx.drawImage(video,0,0,preview.width,preview.height);
      setCorners(detectReceiptCorners(ctx.getImageData(0,0,preview.width,preview.height)));
     }catch{setCorners(null);}
    },550);
   }catch{
    if(!canceled)setError("Fikk ikke tilgang til kameraet. Sjekk kameratillatelsen, eller bruk vanlig kamera.");
   }
  }
  void start();
  return ()=>{
   canceled=true;
   if(timer!==null)clearInterval(timer);
   const stream=streamRef.current;
   if(stream){stream.getTracks().forEach(track=>track.stop());streamRef.current=null;}
   if(videoRef.current)videoRef.current.srcObject=null;
  };
 },[]);
 async function takePicture(){
  const video=videoRef.current;
  if(disabled||capturing||!ready||!video?.videoWidth)return;
  setCapturing(true);setError("");
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
   await onCapture(new File([blob],"kvittering-kamera.jpg",{type:"image/jpeg"}));
  }catch(e){setError(String(e.message||"Klarte ikke å ta bildet."));}
  finally{setCapturing(false);}
 }
 const outline=corners?.map(p=>`${(p.x*100).toFixed(2)},${(p.y*100).toFixed(2)}`).join(" ")||"";
 return <div className={styles.liveCameraShell}>
  <div className={styles.liveCameraStage}>
   <video ref={videoRef} autoPlay playsInline muted className={styles.liveCameraVideo}/>
   {outline&&<svg className={styles.liveCameraOutline} viewBox="0 0 100 100"
    preserveAspectRatio="none" aria-hidden="true">
    <polygon points={outline} fill="rgba(18,160,106,.08)" stroke="#26d894"
     strokeWidth="1" strokeLinejoin="round"/>
   </svg>}
   {!ready&&!error&&<p className={styles.liveCameraHint}>Starter kamera …</p>}
  </div>
  <p className={styles.scanMessage}>{corners
   ?"Kvitteringen er markert. Hold telefonen stille og ta bildet."
   :"Legg hele kvitteringen på et mørkere underlag. Du kan ta bilde selv om rammen ikke vises."}</p>
  {error&&<p role="alert" className={styles.scanMessage}>{error}</p>}
  <div className={styles.liveCameraActions}>
   <button type="button" onClick={onCancel} className={styles.liveCameraCancel}>Lukk kamera</button>
   <button type="button" onClick={takePicture} disabled={!ready||disabled||capturing}
    className={styles.liveCameraCapture}>{capturing?"Tar bilde …":"Ta bilde"}</button>
  </div>
 </div>;
}
