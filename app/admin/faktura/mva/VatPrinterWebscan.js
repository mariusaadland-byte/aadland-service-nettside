"use client";
import {useEffect,useState} from "react";
import {vatWebscanLocalAddress} from "../../../../lib/vatPrinterWebscan";
import styles from "./VatSimpleForm.module.css";

const IP_KEY="aadland-vat-local-hp-webscan-ip";
const PIN_KEY="aadland-vat-local-hp-webscan-pin";
const PIN_UPDATED="aadland-vat-webscan-pin-updated";
// A printer PIN is a credential: never include a user's PIN in the shipped code,
// server logs, URLs, external requests or an analytics event. The user enters it
// once on their own Chromebook and explicitly decides whether to remember it.
const validPrinterPin=value=>/^\d{8}$/.test(String(value||"").trim());

export default function VatPrinterWebscan({disabled=false,compact=false,initialIp=""}){
 const [ip,setIp]=useState("");
 const [message,setMessage]=useState("");
 const [pin,setPin]=useState("");
 const [pinSaved,setPinSaved]=useState(false);
 const [pinVisible,setPinVisible]=useState(false);
 const [pinMessage,setPinMessage]=useState("");
 useEffect(()=>{
  try{
   const stored=window.localStorage.getItem(IP_KEY)||"";
   if(vatWebscanLocalAddress(stored))setIp(stored);
   else if(vatWebscanLocalAddress(initialIp))setIp(initialIp);
  }catch{
   // Private mode can block persistence; scanning remains available.
   if(vatWebscanLocalAddress(initialIp))setIp(initialIp);
  }
  try{
   const storedPin=window.localStorage.getItem(PIN_KEY)||"";
   if(validPrinterPin(storedPin)){setPin(storedPin);setPinSaved(true);}
  }catch{
   // PIN stays empty if persistent browser storage is unavailable.
  }
 },[initialIp]);
 useEffect(()=>{
  function syncPin(){
   try{
    const stored=window.localStorage.getItem(PIN_KEY)||"";
    setPin(validPrinterPin(stored)?stored:"");
    setPinSaved(validPrinterPin(stored));
   }catch{}
  }
  function onStorage(event){if(event.key===PIN_KEY)syncPin();}
  window.addEventListener(PIN_UPDATED,syncPin);
  window.addEventListener("storage",onStorage);
  return()=>{
   window.removeEventListener(PIN_UPDATED,syncPin);
   window.removeEventListener("storage",onStorage);
  };
 },[]);
 const address=vatWebscanLocalAddress(ip);
 function openPrinter(){
  if(disabled)return;
  if(!address){
   setMessage("Skriv inn skriverens lokale IP-adresse, for eksempel 192.168.1.55.");
   return;
  }
  setMessage("");
  try{window.localStorage.setItem(IP_KEY,ip.trim());}catch{}
  // A new tab is navigated by the user's own click. Do not place the PIN in
  // this URL, send it to the printer or attempt to read the printer's page.
  const tab=window.open(address,"_blank","noopener,noreferrer");
  if(!tab)setMessage("Nettleseren blokkerte ny fane. Tillat popup for Aadland Service, eller åpne "+address+" i adresselinjen.");
 }
 function rememberPin(){
  if(!validPrinterPin(pin)){
   setPinMessage("Skriver-PIN må inneholde 8 sifre.");return;
  }
  try{
   window.localStorage.setItem(PIN_KEY,pin.trim());
   setPinSaved(true);
   window.dispatchEvent(new Event(PIN_UPDATED));
   setPinMessage("Skriver-PIN er lagret kun i Chrome på denne enheten.");
  }catch{
   setPinSaved(false);
   setPinMessage("Chrome tillot ikke lagring. Du kan fortsatt kopiere PIN nå.");
  }
 }
 async function copyPin(){
  if(!validPrinterPin(pin)){
   setPinMessage("Skriv inn en gyldig skriver-PIN først.");return;
  }
  try{
   if(!navigator.clipboard?.writeText)throw Error("Clipboard unavailable");
   await navigator.clipboard.writeText(pin.trim());
   setPinMessage("PIN kopiert. Lim den inn i HP-siden hvis skriveren spør etter den.");
  }catch{
   setPinVisible(true);
   setPinMessage("Automatisk kopiering er blokkert. PIN er vist slik at du kan kopiere den manuelt.");
  }
 }
 function forgetPin(){
  try{window.localStorage.removeItem(PIN_KEY);window.dispatchEvent(new Event(PIN_UPDATED));}catch{}
  setPin("");
  setPinSaved(false);
  setPinVisible(false);
  setPinMessage("Lagret skriver-PIN er slettet fra denne nettleseren.");
 }
 return <section className={styles.scanMessage} aria-label="Webscan for HP Smart Tank 7005"
  style={{border:"1px solid #d8d5ce",borderRadius:12,padding:12,background:"#faf9f6"}}>
  <strong>{compact?"HP Webscan – fungerer selv om ChromeOS ikke finner skanneren":
   "Skann fra HP Smart Tank 7005 via nettleseren"}</strong>
  <p>{compact
   ?"Siden HP Webscan allerede fungerer, kan du bruke den direkte. Skann og lagre flere filer i Nedlastinger, kom tilbake hit og velg alle samtidig i skannekøen."
   :"Du og skriveren må være på samme Wi-Fi. Skriv inn skriverens IP-adresse én gang. Den huskes bare i denne nettleseren."}</p>
  <label style={{display:"grid",gap:6,fontSize:13,fontWeight:650,maxWidth:340}}>
   Skriverens IP-adresse
   <input type="text" inputMode="decimal" autoComplete="off" value={ip}
    onChange={event=>{setIp(event.target.value);setMessage("");}}
    placeholder="192.168.1.55" aria-label="Lokal IP-adresse til HP Smart Tank 7005"
    style={{fontSize:16,minHeight:44,padding:"10px 12px",color:"#25231f",background:"#fff",border:"1px solid #bcb7af",borderRadius:9,width:"100%"}}/>
  </label>
  <button type="button" className={styles.uploadAction}
   style={{marginTop:12,maxWidth:340,width:"100%"}} disabled={disabled||!address}
   onClick={openPrinter}>🖨️ Åpne Webscan på skriveren</button>

  <div style={{marginTop:15,paddingTop:12,borderTop:"1px solid #ddd7cf"}}>
   <strong style={{display:"block",fontSize:14}}>Skriver-PIN</strong>
   <p style={{fontSize:13,margin:"5px 0 10px"}}>Legg inn koden én gang, og bruk «Lagre PIN på denne enheten».
    Neste gang finner du den her uten å hente frem skriverens informasjonsside.</p>
   <label style={{display:"grid",gap:6,fontSize:13,fontWeight:650,maxWidth:340}}>
    8-sifret PIN til HP Smart Tank
    <input type={pinVisible?"text":"password"} inputMode="numeric" autoComplete="off"
     maxLength={8} value={pin} placeholder="••••••••"
     aria-label="Skriver-PIN til HP Smart Tank"
     onChange={event=>{
      setPin(event.target.value.replace(/\D/g,"").slice(0,8));
      setPinSaved(false);setPinMessage("");
     }}
     style={{fontSize:16,minHeight:44,padding:"10px 12px",color:"#25231f",background:"#fff",border:"1px solid #bcb7af",borderRadius:9,width:"100%"}}/>
   </label>
   <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10,alignItems:"center"}}>
    <button type="button" className={styles.uploadAction} disabled={!validPrinterPin(pin)}
     onClick={rememberPin}>{pinSaved?"✓ PIN lagret":"Lagre PIN på denne enheten"}</button>
    <button type="button" className={styles.textAction} disabled={!validPrinterPin(pin)}
     onClick={copyPin}>Kopier PIN</button>
    <button type="button" className={styles.textAction} disabled={!pin}
     onClick={()=>setPinVisible(value=>!value)}>{pinVisible?"Skjul":"Vis"}</button>
    {pinSaved&&<button type="button" className={styles.textAction}
     onClick={forgetPin}>Slett lagret PIN</button>}
   </div>
   {pinMessage&&<p role="status" aria-live="polite" style={{fontSize:13}}>{pinMessage}</p>}
   <p style={{fontSize:12}}>PIN lagres bare lokalt i Chrome på denne enheten, ikke på Aadland Service-serveren.
    Lokal lagring er ikke kryptert separat. Bruk bare dette på en privat Chromebook, ikke en delt enhet.
    PIN kan kopieres til HP-siden, men kan ikke fylles inn automatisk på skriverens nettsted.</p>
  </div>
  {message&&<p role="alert" style={{color:"#9c302b"}}>{message}</p>}
  {!compact&&<p>Finn IP-adressen i HP-appen under <strong>Avanserte innstillinger</strong>, eller på skriverens nettverksoversikt.
   Første gang: Åpne <strong>Innstillinger → Sikkerhet → Administratorinnstillinger</strong> på skriversiden og aktiver Webscan.
   Gå deretter til <strong>Skann → Webscan</strong> og start skanningen.</p>}
  <p style={{fontSize:12}}>HP Webscan åpnes i en egen nettleserfane. Når skanningene er lagret,
   kom tilbake og bruk «Velg mange PDF-er / bilder» i skannekøen.
   ChromeOS og HP Webscan er to ulike skanneveier; vi kan ikke hente skanninger
   automatisk fra HP-siden.</p>
 </section>;
}
