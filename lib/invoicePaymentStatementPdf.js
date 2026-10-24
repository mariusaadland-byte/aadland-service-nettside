import "server-only";
import sharp from "sharp";
import path from "path";

const pdfText=value=>String(value??"").replace(/[–—−]/g,"-")
 .replace(/[\u00a0\u202f]/g," ")
 .replace(/[^\x20-\x7eæøåÆØÅ]/g,"?")
 .replace(/[\\()]/g,"\\$&")
 .replace(/[æøåÆØÅ]/g,ch=>"\\"+ch.charCodeAt(0).toString(8));
const money=ore=>((Number(ore)||0)/100).toLocaleString("nb-NO",{
 minimumFractionDigits:2,maximumFractionDigits:2
}).replace(/[\u00a0\u202f]/g," ").replace(/\u2212/g,"-")+" kr";
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;

export async function buildInvoicePaymentStatementPdf(data){
 if(!data?.invoiceNumber||!Array.isArray(data.payments)||!Array.isArray(data.credits)||
    !Array.isArray(data.refunds))throw Error("Betalingsoversikten mangler gyldige opplysninger.");
 const gross=positive(data.grossOre),credited=positive(data.creditedOre);
 const paid=positive(data.paidOre),outstanding=positive(data.outstandingOre);
 if(gross-credited-paid!==outstanding)throw Error("Betalingsoversiktens summer stemmer ikke.");
 const {data:logo,info}=await sharp(path.join(process.cwd(),"public","aadland-service-logo.webp"))
  .resize({width:400,withoutEnlargement:true}).flatten({background:"#111111"})
  .jpeg({quality:82}).toBuffer({resolveWithObject:true});
 const W=595,H=842,pages=[];let y=0,stream="";
 const text=(x,yy,value,size=9,bold=false,color="0.13 0.12 0.11")=>{
  stream+="BT /"+(bold?"F2":"F1")+" "+size+" Tf "+color+
   " rg 1 0 0 1 "+x+" "+yy+" Tm ("+pdfText(value)+") Tj ET\n";
 };
 const rect=(x,yy,w,h,rgb)=>{stream+=rgb+" rg "+x+" "+yy+" "+w+" "+h+" re f\n"};
 const newPage=()=>{
  if(stream)pages.push(stream);
  stream="";rect(0,0,W,H,"1 1 1");rect(0,756,W,86,"0.06 0.06 0.06");
  stream+="q 150 0 0 "+Math.min(72,150*info.height/info.width).toFixed(1)+
    " 42 758 cm /Logo Do Q\n";
  text(240,786,"BETALINGSOVERSIKT",17,true,"0.81 0.63 0.32");
  text(240,765,String(data.invoiceNumber).slice(0,45),8,true,"1 1 1");
  y=728;
 };
 const ensure=(need=25)=>{if(y-need<88)newPage();};
 const section=name=>{
  ensure(50);y-=11;rect(42,y-11,510,28,"0.09 0.09 0.08");
  text(52,y,name,10,true,"1 1 1");y-=33;
 };
 const line=(left,right,bold=false)=>{
  ensure(19);text(50,y,String(left).slice(0,57),9,bold);
  text(395,y,String(right).slice(0,29),9,true);y-=20;
 };
 const wrapped=(value,max=91)=>{
  const raw=String(value??"").trim();
  if(!raw)return;
  for(const phrase of raw.split("\n")){
   let chunk="";
   for(const word of phrase.split(/\s+/)){
    if((chunk+" "+word).trim().length>max&&chunk){
     ensure(16);text(50,y,chunk,8);y-=14;chunk=word;
    }else chunk=(chunk+" "+word).trim();
   }
   if(chunk){ensure(16);text(50,y,chunk,8);y-=14;}
  }
 };
 const event=(date,label,amount)=>{
  ensure(31);text(50,y,String(date||"Dato ikke oppgitt").slice(0,16),9);
  text(155,y,String(label||"").slice(0,45),9);
  text(432,y,money(amount),9,true);y-=19;
  rect(49,y+6,499,0.5,"0.87 0.85 0.82");
 };
 newPage();
 text(48,y,"KUNDE",9,true,"0.65 0.46 0.19");y-=17;
 for(const value of [data.customer?.name,...String(data.customer?.address||"").split("\n"),data.customer?.email]){
  if(value){text(48,y,String(value).slice(0,48),9);y-=14;}
 }
 let firmY=728;
 text(326,firmY,"AADLAND SERVICE",10,true,"0.65 0.46 0.19");firmY-=19;
 for(const value of ["Steinsvikvegen 12P","5251 Søreidgrend",
  "Org.nr.: 937 781 873 MVA","Telefon: 471 54 898","post@aadland-service.no"]){
  text(326,firmY,value,9);firmY-=14;
 }
 y=Math.min(y,firmY)-20;
 text(48,y,"Faktura: "+String(data.invoiceNumber).slice(0,48),10,true);y-=18;
 text(48,y,"Fakturadato: "+String(data.invoiceDate||""),9);y-=16;
 text(48,y,"Oversikt per: "+String(data.asOfDate||""),9,true);y-=19;
 wrapped("Dette er en statusoversikt over registrerte innbetalinger og krediteringer. Dokumentet er ikke en ny faktura eller et nytt betalingskrav.");
 section("SAMLET STATUS");
 line("Opprinnelig fakturabeløp",money(gross));
 if(credited>0)line("Kreditert gjennom kreditnota", "-"+money(credited));
 line("Fakturabeløp etter kreditering",money(gross-credited),true);
 line("Netto innbetalt",money(paid),true);
 if(outstanding>0)line("Gjenstående fakturakrav",money(outstanding),true);
 else {ensure(25);text(50,y,"FAKTURAEN ER OPPGJORT",11,true,"0.30 0.42 0.25");y-=22;}
 section("REGISTRERTE INNBETALINGER - NETTO");
 if(!data.payments.length)wrapped("Ingen innbetalinger registrert.");
 for(const p of data.payments){
  event(p.paidOn,p.method==="vipps"?"Vipps":"Bank / manuelt",positive(p.amountOre));
  if(p.method==="manual"&&p.note){ensure(16);text(155,y,String(p.note).slice(0,58),7);y-=13;}
 }
 if(data.credits.length){
  section("KREDITNOTAER");
  for(const c of data.credits)event(c.date,c.number, -positive(c.amountOre));
 }
 const refunds=data.refunds.filter(r=>positive(r.refundedOre)>0);
 if(refunds.length){
  section("VIPPS-REFUSJONER (INFORMASJON)");
  wrapped("Refusjonene er allerede trukket fra Vipps-beløpene under netto innbetalt. Ikke trekk dem fra på nytt.");
  y-=5;
  for(const r of refunds){
   ensure(48);
   text(50,y,"Vipps-refusjon: -"+money(positive(r.refundedOre)),9,true);y-=15;
   text(50,y,"Betalingsreferanse: "+String(r.reference||"").slice(0,48),8);y-=19;
  }
 }
 ensure(47);y-=13;wrapped("Oversikten gjelder registrerte beløp per datoen over. Kontakt Aadland Service ved spørsmål. Eventuelle nye innbetalinger eller refusjoner etter denne datoen vises i en nyere oversikt.");
 pages.push(stream);
 const objs=[null,Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),null,
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  Buffer.concat([Buffer.from("<< /Type /XObject /Subtype /Image /Width "+info.width+" /Height "+
   info.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+
   logo.length+" >>\nstream\n"),logo,Buffer.from("\nendstream")])];
 const ids=[];
 for(let i=0;i<pages.length;i++){
  let content=pages[i];
  content+="0.7 0.67 0.61 RG 0.5 w 48 66 m 548 66 l S\n";
  content+="BT /F1 8 Tf 0.35 0.33 0.30 rg 1 0 0 1 48 49 Tm ("+
   pdfText("Aadland Service - Org.nr. 937 781 873 MVA - Steinsvikvegen 12P")+") Tj ET\n";
  content+="BT /F1 8 Tf 0.35 0.33 0.30 rg 1 0 0 1 48 35 Tm ("+
   pdfText("post@aadland-service.no - Side "+(i+1)+"/"+pages.length)+") Tj ET\n";
  const id=objs.length;ids.push(id);
  objs.push(Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents "+(id+1)+" 0 R >>"));
  objs.push(Buffer.from("<< /Length "+Buffer.byteLength(content,"latin1")+" >>\nstream\n"+content+"endstream","latin1"));
 }
 objs[2]=Buffer.from("<< /Type /Pages /Kids ["+ids.map(x=>x+" 0 R").join(" ")+"] /Count "+ids.length+" >>");
 const parts=[Buffer.from("%PDF-1.4\n")],offsets=[0];let position=parts[0].length;
 for(let i=1;i<objs.length;i++){
  offsets[i]=position;const b=Buffer.concat([Buffer.from(i+" 0 obj\n"),objs[i],Buffer.from("\nendobj\n")]);
  parts.push(b);position+=b.length;
 }
 const startXref=position;
 parts.push(Buffer.from("xref\n0 "+objs.length+"\n0000000000 65535 f \n"));
 for(let i=1;i<objs.length;i++)parts.push(Buffer.from(String(offsets[i]).padStart(10,"0")+" 00000 n \n"));
 parts.push(Buffer.from("trailer\n<< /Size "+objs.length+" /Root 1 0 R >>\nstartxref\n"+startXref+"\n%%EOF"));
 return Buffer.concat(parts);
}
