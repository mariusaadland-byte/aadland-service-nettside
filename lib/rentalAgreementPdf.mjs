// Node only. Deterministic, dependency-free PDF renderer for a frozen agreement.
import {agreementDocumentDigest,SIGNING_STATEMENT} from "./aadlandSigning.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {groupQuoteSnapshot} from "./rentalGroupQuote.mjs";
import {TERMS_2026_11_25} from "./rentalAgreementTerms20261125.mjs";
const simple=v=>typeof v==="string"&&v.trim().length>0&&v.length<=254&&!/[\x00-\x1f\x7f]/.test(v);
const money=v=>(v/100).toFixed(2).replace(".",",")+" kr";
const win={"\u2013":150,"\u2014":151,"\u2018":145,"\u2019":146,"\u201c":147,"\u201d":148,"\u2026":133,"\u2022":149,"\u20ac":128,"\u202f":32};
function encoded(s){
 let out="";
 for(const ch of s){
  const n=win[ch]??ch.codePointAt(0);
  if(!((n>=32&&n<=126)||(n>=160&&n<=255)||Object.values(win).includes(n)))throw Error("PDF_UNSUPPORTED_CHARACTER");
  out+=n.toString(16).padStart(2,"0");
 }
 return out;
}
function wrap(s,max=80){
 const result=[];
 for(const paragraph of s.split("\n")){
  let line="";
  for(let word of paragraph.split(/\s+/).filter(Boolean)){
   while(word.length>max){if(line){result.push(line);line="";}result.push(word.slice(0,max));word=word.slice(max);}
   if(line&&line.length+word.length+1>max){result.push(line);line="";}
   if(word)line+=(line?" ":"")+word;
  }
  result.push(line);
 }
 return result;
}
export function buildRentalAgreementPdf({agreementId,customerId,customerName,email,orderNumber,revision,quote,today}){
 if(!rentalUnitId(agreementId)||!rentalUnitId(customerId)||!simple(customerName)||!simple(email)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!simple(orderNumber)||!Number.isSafeInteger(revision)||revision<1)throw Error("AGREEMENT_CONTEXT_INVALID");
 const s=quote?.snapshot;
 if(!s||s.termsVersion!=="2026-11-25"||!Array.isArray(s.rentals)||!Array.isArray(s.goods))throw Error("AGREEMENT_QUOTE_INVALID");
 const fresh=groupQuoteSnapshot({rentals:s.rentals.map(r=>({...r,available:true})),goods:s.goods,today});
 if(!fresh||fresh.digest!==quote.digest||JSON.stringify(fresh.snapshot)!==JSON.stringify(s))throw Error("AGREEMENT_QUOTE_INVALID");
 const sections=[
 {heading:true,text:"Avtalegrunnlag - Aadland Utleie"},
 {text:"Ordre: "+orderNumber+" | Avtaleversjon: "+revision},
 {text:"Avtale-ID: "+agreementId},
 {text:"Kunde: "+customerName+"\nE-post: "+email},
 {text:"Henting. Booking er ikke endelig bekreftet før utleier har bekreftet avtalen og tilgjengelighet."},
 {heading:true,text:"Leie av utstyr"},
 ...s.rentals.map(r=>({text:r.name+"\n"+r.quantity+" stk. | "+r.startDate+" til "+r.endDate+"\nLeie inkl. mva.: "+money(r.totalOre)+" | Depositum: "+money(r.depositOre)})),
 ...(s.goods.length?[{heading:true,text:"Forbruksmateriell (kjøp)"},...s.goods.map(g=>({text:g.name+" ("+g.sku+")\n"+g.quantity+" stk. x "+money(g.unitOre)+" = "+money(g.totalOre)}))]:[]),
 {heading:true,text:"Betalingsgrunnlag"},
 {text:"Leie inkl. mva.: "+money(s.rentalOre)+"\nVarekjøp inkl. mva.: "+money(s.salesOre)+"\nLeie og kjøp inkl. mva.: "+money(s.payableOre)+"\nDepositum separat: "+money(s.depositOre)},
 {text:"Erklæring ved signering: "+SIGNING_STATEMENT},
 {text:"Dette dokumentet er avtalen til signering. Signeringsbevis opprettes separat. Ingen betaling bekreftes av dokumentet."},
 {heading:true,text:"Utleiebetingelser - versjon "+s.termsVersion},
 ...TERMS_2026_11_25
 ];
 const streams=[];let stream="",y=0,page=0;
 const cmd=(x,yy,text,size=10,bold=false)=>"BT /"+(bold?"F2":"F1")+" "+size+" Tf 0.10 0.12 0.14 rg "+x+" "+yy+" Td <"+encoded(text)+"> Tj ET\n";
 function start(){
  if(page){stream+=cmd(48,32,"Side "+page,9);streams.push(stream);}
  page++;stream="0.07 0.09 0.12 rg 0 774 595 68 re f\nBT /F2 15 Tf 1 1 1 rg 48 804 Td <"+encoded("AADLAND UTLEIE | LEIEAVTALE")+"> Tj ET\n";
  y=748;
 }
 start();
 for(const section of sections){
  const lines=wrap(section.text,section.heading?65:80);
  if(section.heading&&y<100)start();
  for(const line of lines){if(y<62)start();stream+=cmd(48,y,line,section.heading?12:10,!!section.heading);y-=section.heading?19:14;}
  y-=8;
 }
 stream+=cmd(48,32,"Side "+page,9);streams.push(stream);
 // All stream bytes are ASCII (WinAnsi strings are hex escaped).
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>"];
 const kids=[];
 for(const content of streams){
  const pageId=objects.length+1,contentId=pageId+1;kids.push(pageId+" 0 R");
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+contentId+" 0 R >>");
  objects.push("<< /Length "+Buffer.byteLength(content)+" >>\nstream\n"+content+"endstream");
 }
 objects[1]="<< /Type /Pages /Count "+kids.length+" /Kids ["+kids.join(" ")+"] >>";
 let out="%PDF-1.4\n";const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";}
 const xref=Buffer.byteLength(out);out+="xref\n0 "+offsets.length+"\n0000000000 65535 f \n";
 for(const n of offsets.slice(1))out+=String(n).padStart(10,"0")+" 00000 n \n";
 out+="trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 const bytes=Buffer.from(out,"ascii");
 return {bytes,documentDigest:agreementDocumentDigest(bytes),quoteDigest:quote.digest,termsVersion:s.termsVersion};
}
