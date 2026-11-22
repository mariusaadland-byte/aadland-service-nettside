// These are the complete open, reviewable sources of the optional ChromeOS bridge.
// No printer address, document, login or account credentials leave the Chromebook.
export const chromeOsScannerExtensionFiles={
 "manifest.json":JSON.stringify({
  manifest_version:3,
  name:"Aadland Service – Chromebook-skanner",
  version:"1.0.0",
  description:"Skann ett papirbilag om gangen direkte til Aadland Service via ChromeOS.",
  permissions:["documentScan"],
  background:{service_worker:"background.js"},
  content_scripts:[{matches:["https://www.aadland-service.no/*"],js:["bridge.js"],run_at:"document_idle"}]
 },null,2),
 "background.js":`// Scan images stay inside the user's browser. No network calls or automatic bookkeeping.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 const origin=(()=>{try{return new URL(sender.tab?.url||"").origin;}catch{return "";}})();
 if(origin!=="https://www.aadland-service.no"||message?.type!=="AADLAND_SCAN_DOCUMENT")return false;
 (async()=>{
  if(!chrome.documentScan?.scan)throw Error("Chromebook støtter ikke denne skannefunksjonen.");
  const result=await chrome.documentScan.scan({mimeTypes:["image/png","image/jpeg"],maxImages:1});
  const dataUrl=result?.dataUrls?.[0];
  if(typeof dataUrl!=="string"||!/^data:image\\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(dataUrl))
   throw Error("Ingen lesbart bilde ble levert fra ChromeOS-skanneren.");
  // Max ~25 MB binary. Large scans should be reduced before importing.
  if(dataUrl.length>34*1024*1024)throw Error("Bildet er for stort. Velg lavere oppløsning.");
  return {ok:true,dataUrl};
 })().then(respond,error=>respond({ok:false,error:String(error?.message||"Skanning mislyktes.")}));
 return true;
});`,
 "bridge.js":`// The page can request a scan only immediately after a real click on its Scan button.
const ORIGIN="https://www.aadland-service.no";
const PAGE="aadland-chromeos-page",EXT="aadland-chromeos-extension";
let recentClick=0,scanning=false;
document.addEventListener("click",event=>{
 if(event.isTrusted&&event.target?.closest?.('[data-aadland-direct-scan="true"]'))
  recentClick=Date.now();
},true);
window.addEventListener("message",event=>{
 if(event.source!==window||event.origin!==ORIGIN||event.data?.channel!==PAGE)return;
 if(event.data.type==="HELLO"){
  window.postMessage({channel:EXT,type:"READY"},ORIGIN);return;
 }
 if(event.data.type!=="SCAN"||!Number.isSafeInteger(event.data.requestId))return;
 const requestId=event.data.requestId;
 if(scanning||Date.now()-recentClick>2000){
  window.postMessage({channel:EXT,type:"RESULT",requestId,ok:false,
   error:"Trykk på Skann neste kvittering for å starte skanningen."},ORIGIN);return;
 }
 recentClick=0;scanning=true;
 chrome.runtime.sendMessage({type:"AADLAND_SCAN_DOCUMENT"},response=>{
  scanning=false;
  const err=chrome.runtime.lastError?.message;
  window.postMessage({channel:EXT,type:"RESULT",requestId,ok:Boolean(response?.ok&&!err),
   dataUrl:response?.ok?response.dataUrl:undefined,
   error:err||response?.error||"Skanneren svarte ikke."},ORIGIN);
 });
});
window.postMessage({channel:EXT,type:"READY"},ORIGIN);`,
 "LES-MEG.txt":`Aadland Service – Chromebook-skanner

Denne utvidelsen gir Aadland Service tilgang til ChromeOS sitt skannegrensesnitt.
En skanning startes bare når du trykker Skann neste kvittering på nettsiden.
Resultatet sendes kun til Aadland Service-fanen i nettleseren, ikke til andre nettsteder.
Ingen dokumenter registreres eller bokføres automatisk.

INSTALLER
1. Pakk ut denne ZIP-filen i en vanlig mappe på Chromebooken.
2. Åpne chrome://extensions i Chrome.
3. Slå på Utviklermodus hvis den er tilgjengelig.
4. Trykk Last inn upakket (Load unpacked) og velg mappen med manifest.json.
5. Oppdater https://www.aadland-service.no, og åpne Regnskap – MVA.

Du kan fjerne utvidelsen igjen fra chrome://extensions når du vil.
ChromeOS må finne HP-skanneren på nettverket. Dette må testes på din maskin.
`
};
