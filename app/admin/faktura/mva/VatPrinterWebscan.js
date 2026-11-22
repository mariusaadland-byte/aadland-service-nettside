"use client";
import {useEffect,useState} from "react";
import {vatWebscanLocalAddress} from "../../../../lib/vatPrinterWebscan";
import styles from "./VatSimpleForm.module.css";

const KEY="aadland-vat-local-hp-webscan-ip";
export default function VatPrinterWebscan({disabled=false,compact=false,initialIp=""}){
 const [ip,setIp]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  try{
   const stored=window.localStorage.getItem(KEY)||"";
   if(vatWebscanLocalAddress(stored))setIp(stored);
   else if(vatWebscanLocalAddress(initialIp))setIp(initialIp);
  }catch{
   // Private mode can block persistence; scanning remains available.
  }
 },[initialIp]);
 const address=vatWebscanLocalAddress(ip);
 function openPrinter(){
  if(disabled)return;
  if(!address){
   setMessage("Skriv inn skriverens lokale IP-adresse, for eksempel 192.168.1.55.");
   return;
  }
  setMessage("");
  try{window.localStorage.setItem(KEY,ip.trim());}catch{}
  // A new tab is navigated by the user's own click. No fetch, CORS workaround,
  // automatic device access, local network scan or cross-origin file reading.
  const tab=window.open(address,"_blank","noopener,noreferrer");
  if(!tab)setMessage("Nettleseren blokkerte ny fane. Tillat popup for Aadland Service, eller åpne "+address+" i adresselinjen.");
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
  {message&&<p role="alert" style={{color:"#9c302b"}}>{message}</p>}
  {!compact&&<p>Finn IP-adressen i HP-appen under <strong>Avanserte innstillinger</strong>, eller på skriverens nettverksoversikt.
   Første gang: Åpne <strong>Innstillinger → Sikkerhet → Administratorinnstillinger</strong> på skriversiden og aktiver Webscan.
   Gå deretter til <strong>Skann → Webscan</strong> og start skanningen.</p>}
  <p style={{fontSize:12}}>HP Webscan åpnes i en egen nettleserfane. Når skanningene er lagret,
   kom tilbake og bruk «Velg mange PDF-er / bilder» i skannekøen.
   ChromeOS og HP Webscan er to ulike skanneveier; vi kan ikke hente skanninger
   automatisk fra HP-siden. Ingen skriverpassord lagres.</p>
 </section>;
}
