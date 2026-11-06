"use client";

import {useMemo} from "react";
import qrcode from "../../../lib/vendor/qrcode.mjs";

function qrPaymentUrl(value){
 try{
  const url=new URL(value);
  if(url.protocol!=="https:"||url.hostname!=="www.aadland-service.no"||
   url.pathname!=="/betaling/faktura/start"||url.username||url.password||
   url.searchParams.size!==1||!/^INV-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(url.searchParams.get("reference")||""))
   return null;
  return url.href;
 }catch{return null;}
}
export default function InvoicePaymentQr({url,invoiceNumber}){
 const code=useMemo(()=>{
  const approved=qrPaymentUrl(url);
  if(!approved)return null;
  try{
   const qr=qrcode(0,"M");
   qr.addData(approved,"Byte");
   qr.make();
   const size=qr.getModuleCount(),segments=[];
   for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
     if(qr.isDark(y,x))segments.push("M"+(x+4)+" "+(y+4)+"h1v1h-1z");
    }
   }
   return {size:size+8,path:segments.join(" ")};
  }catch{return null;}
 },[url]);
 if(!code)return <p role="alert">QR-koden kunne ikke vises. Bruk betalingslenken i stedet.</p>;
 return <figure style={{margin:"12px auto",textAlign:"center",maxWidth:290}}>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 "+code.size+" "+code.size}
   role="img" aria-label={"QR-kode for betalingssiden til faktura "+(invoiceNumber||"")}
   style={{display:"block",width:"100%",height:"auto",margin:"0 auto",background:"#fff",border:"8px solid #fff",borderRadius:8}}>
   <rect width={code.size} height={code.size} fill="#fff"/>
   <path d={code.path} fill="#111"/>
  </svg>
  <figcaption style={{fontSize:13,marginTop:8}}>La kunden skanne QR-koden med sin telefon. Den åpner samme betalingsside som lenken i e-posten.</figcaption>
 </figure>;
}