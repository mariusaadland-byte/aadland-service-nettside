"use client";
import {useMemo} from "react";
import qrcode from "../../../../lib/vendor/qrcode.mjs";
import styles from "./units.module.css";
export default function UnitLabel({url,label,name}){
 const code=useMemo(()=>{if(!url)return null;try{const q=qrcode(0,"M");q.addData(url,"Byte");q.make();let n=q.getModuleCount(),p=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))p.push("M"+(x+4)+" "+(y+4)+"h1v1h-1z");return {n:n+8,path:p.join(" ")};}catch{return null}},[url]);
 if(!code)return <p role="alert">QR-koden kunne ikke genereres.</p>;
 return <><div className={styles.label}><b>AADLAND UTLEIE</b><strong>{name}</strong><svg xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 "+code.n+" "+code.n} role="img" aria-label="QR-kode for utstyr"><rect width={code.n} height={code.n} fill="#fff"/><path d={code.path} fill="#000"/></svg><small>{label}</small></div><button className={"btn "+styles.noPrint} type="button" onClick={()=>window.print()}>Skriv ut QR-etikett</button></>;
}
