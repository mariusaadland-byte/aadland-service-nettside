"use client";
import {useEffect,useRef,useState} from "react";
import {scanRentalUnit} from "../../lib/rentalScanInput.mjs";
export default function RentalCamera({onScan,disabled=false}){
 const video=useRef(null),stream=useRef(null),generation=useRef(0),timer=useRef(null),[active,setActive]=useState(false),[message,setMessage]=useState("");
 function stop(){generation.current++;clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;setActive(false);}
 useEffect(()=>()=>{generation.current++;clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());},[]);
 useEffect(()=>{if(disabled)stop();},[disabled]);
 async function start(){
  stop();setMessage("");
  if(!globalThis.BarcodeDetector||!navigator.mediaDevices?.getUserMedia){setMessage("Nettleseren har ikke innebygd QR-leser. Bruk vanlig kamera/QR-leser og lim inn koden, eller skriv individ-ID.");return;}
  const id=++generation.current;
  try{
   const formats=await globalThis.BarcodeDetector.getSupportedFormats();if(!formats.includes("qr_code"))throw Error("unsupported");
   const detector=new globalThis.BarcodeDetector({formats:["qr_code"]});
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
   if(id!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
   stream.current=media;video.current.srcObject=media;await video.current.play();if(id!==generation.current)return;setActive(true);
   async function tick(){if(id!==generation.current)return;try{if(video.current?.readyState>=2){const results=await detector.detect(video.current);if(id!==generation.current)return;for(const r of results){const unit=scanRentalUnit(r.rawValue);if(unit){stop();onScan(unit);setMessage("QR-kode lest. Kontroller at den gjelder riktig maskin.");return;}}}}catch{if(id===generation.current){stop();setMessage("Kunne ikke lese QR-koden. Bruk manuell registrering.");}return;}if(id===generation.current)timer.current=setTimeout(tick,250);}
   tick();
  }catch{if(id===generation.current){stop();setMessage("Kamera kunne ikke åpnes. Kontroller tillatelse eller bruk manuell registrering.");}}
 }
 return <div><button type="button" disabled={disabled} onClick={active?stop:start}>{active?"Stopp kamera":"Skann QR med kamera"}</button><video ref={video} playsInline muted hidden={!active} style={{width:"100%",maxHeight:260,objectFit:"contain"}}/>{message&&<p role="status">{message}</p>}</div>;
}
