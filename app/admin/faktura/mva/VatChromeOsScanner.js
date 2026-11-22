"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./VatSimpleForm.module.css";

const PAGE_CHANNEL="aadland-chromeos-page",EXT_CHANNEL="aadland-chromeos-extension";
const ALLOWED=/^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i;
const scannerNotFound=error=>/no scanners? available|no scanners? found|no scanners? detected|ingen skannere|scanner not found/i.test(String(error||""));
export default function VatChromeOsScanner({onScan,disabled=false}){
 const [connected,setConnected]=useState(false);
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState("");
 const currentRef=useRef(null),sequenceRef=useRef(0);
 const onScanRef=useRef(onScan);
 onScanRef.current=onScan;
 useEffect(()=>{
  function receive(event){
   if(event.source!==window||event.origin!==window.location.origin||event.data?.channel!==EXT_CHANNEL)return;
   if(event.data.type==="READY"){setConnected(true);return;}
   if(event.data.type!=="RESULT"||!currentRef.current||
    event.data.requestId!==currentRef.current.id)return;
   const req=currentRef.current;currentRef.current=null;clearTimeout(req.timer);
   void (async()=>{
    try{
     if(!event.data.ok)throw Error(event.data.error||"Skanningen ble avbrutt.");
     const dataUrl=event.data.dataUrl;
     if(typeof dataUrl!=="string"||dataUrl.length>34*1024*1024||!ALLOWED.test(dataUrl))
      throw Error("Skanneren leverte et ugyldig eller for stort bilde.");
     const image=await fetch(dataUrl).then(response=>response.blob());
     if(image.size>25*1024*1024)throw Error("Bildet er for stort. Bruk lavere skanneoppløsning.");
     const ext=image.type==="image/jpeg"?"jpg":"png";
     const file=new File([image],"HP-skanning-"+new Date().toISOString().replace(/[:.]/g,"-")+"."+ext,
      {type:image.type});
     await onScanRef.current(file);
     setMessage("Kvitteringen er lagt i køen. Legg på neste ark og skann igjen.");
    }catch(error){
     const detail=String(error?.message||"Skanningen mislyktes.");
     setMessage(scannerNotFound(detail)
      ?"ChromeOS finner ingen skanner. HP Smart Tank 7005 fungerer likevel via Webscan. Trykk «Åpne Webscan på skriveren» nedenfor, skann dokumentene og velg deretter alle filene i køen."
      :detail);
    }
    finally{setWorking(false);}
   })();
  }
  window.addEventListener("message",receive);
  window.postMessage({channel:PAGE_CHANNEL,type:"HELLO"},window.location.origin);
  return()=>{
   window.removeEventListener("message",receive);
   if(currentRef.current){clearTimeout(currentRef.current.timer);currentRef.current=null;}
  };
 },[]);
 function begin(){
  if(!connected||disabled||working)return;
  const id=++sequenceRef.current;
  setWorking(true);setMessage("Venter på at ChromeOS skal skanne arket …");
  const timer=setTimeout(()=>{
   if(currentRef.current?.id!==id)return;
   currentRef.current=null;setWorking(false);
   setMessage("Skanningen tok for lang tid. Kontroller skriveren og prøv igjen.");
  },120000);
  currentRef.current={id,timer};
  window.postMessage({channel:PAGE_CHANNEL,type:"SCAN",requestId:id},window.location.origin);
 }
 return <div className={styles.scanMessage}
  style={{marginTop:12,padding:12,border:"1px solid #c1d5d1",borderRadius:12,background:"#f6faf9"}}>
  <strong>🖨️ Skann direkte fra Chromebook</strong>
  <p>Direkte skanning bruker ChromeOS sin egen skannertilgang. Hvis ChromeOS viser
   «No scanners available», betyr det at ChromeOS ikke oppdager HP-skanneren.
   Da kan du bruke «Åpne Webscan på skriveren» nedenfor og fortsatt legge alle skanningene i køen.</p>
  {connected?<button type="button" className={styles.uploadAction} data-aadland-direct-scan="true"
    disabled={disabled||working} onClick={begin}>
    {working?"Skanner …":"📄 Skann neste kvittering"}
   </button>:
   <div>
    <p><strong>Utvidelsen er ikke koblet til.</strong> Du kan fortsatt bruke «Velg mange PDF-er/bilder» uten utvidelsen.</p>
    <a className={styles.uploadAction} href="/api/admin/invoices/vat-chromebook-scanner"
     download="aadland-chromebook-skanner.zip" style={{display:"inline-block",marginBottom:10}}>
     Last ned Chromebook-skannerutvidelsen
    </a>
    <details><summary>Slik installerer du den én gang</summary>
     <ol style={{paddingLeft:24}}>
      <li>Last ned ZIP-filen, åpne <strong>Filer</strong> og pakk den ut i en egen mappe.</li>
      <li>Skriv <strong>chrome://extensions</strong> i adressefeltet til Chrome.</li>
      <li>Slå på Utviklermodus og velg <strong>Last inn upakket</strong>.</li>
      <li>Velg mappen som inneholder manifest.json, og oppdater Aadland Service.</li>
     </ol>
     <p>Det kan hende Chromebookens sikkerhetsinnstillinger hindrer installasjonen, eller at HP-skanneren
      ikke blir oppdaget. Da bruker du vanlig skanning til PDF.</p>
    </details>
   </div>}
  {message&&<p role="status" aria-live="polite">{message}</p>}
 </div>;
}
