"use client";
import {useRef,useState} from "react";
import Link from "next/link";
export default function InvoicePrintClient({id,invoiceNumber}){
 const frame=useRef(null),started=useRef(false);
 const [message,setMessage]=useState("");
 const pdf="/api/admin/invoices/pdf?id="+encodeURIComponent(id);
 function print(){
  try{const target=frame.current?.contentWindow;if(!target)throw Error();target.focus();target.print();}
  catch{setMessage("Åpne PDF-en og bruk nettleserens utskriftsvalg.");}
 }
 function loaded(){if(started.current)return;started.current=true;setTimeout(print,300);}
 return <main style={{margin:"0 auto",maxWidth:1100,padding:16}}><div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:12}}><Link href={"/admin/faktura?id="+id}>← Tilbake til faktura</Link><strong>Faktura {invoiceNumber}</strong><button type="button" onClick={print}>Skriv ut faktura</button><a href={pdf+"&inline=1"} target="_blank" rel="noreferrer">Åpne PDF</a><a href={pdf}>Last ned PDF</a></div><p>På iPhone kan du også åpne PDF-en og velge Del → Skriv ut.</p>{message&&<p role="status">{message}</p>}<iframe ref={frame} title={"Faktura "+invoiceNumber} src={pdf+"&inline=1"} onLoad={loaded} style={{width:"100%",height:"80vh",border:"1px solid #ddd",background:"#fff"}}/><style jsx>{`@media print{main>div,main>p{display:none}iframe{width:100%;height:100vh;border:0}}`}</style></main>;
}
