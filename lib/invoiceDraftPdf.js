import sharp from "sharp";
import path from "path";
const esc=v=>String(v??"").replace(/[–—]/g,"-").replace(/[\u00a0\u202f]/g," ").replace(/[^\x20-\x7eæøåÆØÅ]/g,"?").replace(/[\\()]/g,"\\$&").replace(/[æøåÆØÅ]/g,ch=>"\\"+ch.charCodeAt(0).toString(8));
const kr=v=>((Number(v)||0)/100).toLocaleString("nb-NO",{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/[\u00a0\u202f]/g," ")+" kr";
export async function buildInvoiceDraftPdf(invoice){
 const {data:logo,info}=await sharp(path.join(process.cwd(),"public","aadland-service-logo.webp")).resize({width:400,withoutEnlargement:true}).flatten({background:"#111111"}).jpeg({quality:82}).toBuffer({resolveWithObject:true});
 const issued=Boolean(invoice.invoice_number);
 const notice=invoice.notice,documentTitle=notice?(notice.kind==="inkasso"?"INKASSOVARSEL":"PURRING"):(issued?"FAKTURA":"FAKTURAKLADD");
 const W=595,H=842,pages=[];let y=0,s="";
 const text=(x,yy,v,size=10,bold=false,color="0.13 0.12 0.11")=>{s+=`BT /${bold?"F2":"F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${yy} Tm (${esc(v)}) Tj ET\n`};
 const rect=(x,yy,w,h,rgb)=>{s+=`${rgb} rg ${x} ${yy} ${w} ${h} re f\n`};
 const start=()=>{if(s)pages.push(s);s="";rect(0,0,W,H,"1 1 1");rect(0,757,W,85,"0.06 0.06 0.06");s+="q 158 0 0 "+Math.min(72,158*info.height/info.width).toFixed(1)+" 42 758 cm /Logo Do Q\n";text(245,790,documentTitle,19,true,"0.81 0.63 0.32");text(245,767,issued?invoice.invoice_number:"IKKE UTSTEDT - IKKE TIL BETALING",8,true,"1 1 1");y=729;};
 const row=(a,b)=>{text(48,y,a,9);text(365,y,b,9,true);y-=20};
 const next=(need=35)=>{if(y-need<82)start()};
 start();
 const top=y;
 text(48,y,"FAKTURAMOTTAKER",9,true,"0.65 0.46 0.19");y-=19;
 for(const line of [invoice.customer?.name,...String(invoice.customer?.address||"").split("\n"),invoice.customer?.phone?"Telefon: "+invoice.customer.phone:"",invoice.customer?.email]){
  if(line){text(48,y,String(line).slice(0,60),9);y-=14}
 }
 let firmY=top;text(330,firmY,"AADLAND SERVICE",10,true,"0.65 0.46 0.19");firmY-=19;
 for(const line of ["Steinsvikvegen 12P","5251 Søreidgrend","Org.nr.: 937 781 873 MVA","Telefon: 471 54 898","post@aadland-service.no"]){text(330,firmY,line,9);firmY-=14}
 y=Math.min(y,firmY)-10;
 for(const [x,label,value] of [[48,"FAKTURANUMMER",invoice.invoice_number||"Tildeles ved utstedelse"],[240,notice?"DOKUMENTDATO":"FAKTURADATO",notice?.document_date||invoice.issued_date||"Tildeles ved utstedelse"],[415,notice?"NY BETALINGSFRIST":"FORFALLSDATO",notice?.due_date||invoice.due_date||"Ikke valgt"]]){text(x,y,label,7,true,"0.65 0.46 0.19");text(x,y-14,value,9,true)}
 y-=34;
 if(notice){
  // A separate notice document preserves the original issued invoice unchanged.
  for(const paragraph of String(notice.body).split("\n").slice(1)){
   if(!paragraph.trim()){y-=8;continue}
   let line="";
   for(const word of paragraph.split(/\s+/)){
    if((line+" "+word).trim().length>90){next(17);text(48,y,line,9);y-=14;line=word}
    else line=(line+" "+word).trim();
   }
   if(line){next(17);text(48,y,line,9);y-=14}
  }
  next(60);y-=15;rect(42,y-19,510,42,"0.96 0.94 0.89");text(53,y-5,"GJENSTÅENDE Å BETALE",12,true);text(405,y-5,kr(notice.outstanding_ore),13,true);
 }else{
 if(invoice.customer?.workDate){text(48,y,"Leveringsdato: "+invoice.customer.workDate,8);y-=14}
 if(invoice.customer?.workAddress){text(48,y,"Arbeidssted: "+String(invoice.customer.workAddress).slice(0,88),8);y-=14}
 y-=10;text(48,y,invoice.title||"Oppdrag",13,true);y-=22;
 const work=String(invoice.customer?.workDescription||"").trim();
 if(work){
  next(42);text(48,y,"UTFØRT ARBEID OG HVA SOM INNGÅR",9,true,"0.65 0.46 0.19");y-=19;
  for(const paragraph of work.split("\n")){
   if(!paragraph.trim()){y-=10;continue}
   const words=paragraph.split(/\s+/);let line="";
   for(const word of words){if((line+" "+word).trim().length>94){next(17);text(48,y,line,8);y-=13;line=word}else line=(line+" "+word).trim()}
   if(line){next(17);text(48,y,line,8);y-=13}
  }
  y-=8;next(60);
 }

 const tableHeader=()=>{rect(42,y-11,510,29,"0.09 0.09 0.08");text(50,y,"BESKRIVELSE",8,true,"1 1 1");text(237,y,"ANTALL",8,true,"1 1 1");text(294,y+5,"ENHETSPRIS",6.5,true,"1 1 1");text(294,y-4,"EKS. MVA",6.5,true,"1 1 1");text(365,y,"EKS. MVA",8,true,"1 1 1");text(440,y,"INKL. MVA",8,true,"1 1 1");text(525,y,"MVA",7,true,"1 1 1");y-=38;};
 tableHeader();
 let subtotal=0,vat=0;const vatGroups=new Map();
 for(const [index,l] of (invoice.line_items||[]).entries()){
  // Continue after five products, repeating the table heading on every new page.
  if(index===5||y-35<82){start();tableHeader();}
  const qty=Number(l.quantity)||0,rate=Number(l.vatRate)||0,unitPrice=Number(l.unitPriceOre)||0;const net=Math.round(qty*unitPrice),lineVat=Math.round(net*rate/100);subtotal+=net;vat+=lineVat;vatGroups.set(rate,(vatGroups.get(rate)||0)+lineVat);const desc=String(l.description||"").slice(0,45);text(50,y,desc,8);text(237,y,String(qty)+" "+String(l.unit||"stk").slice(0,4),8);text(294,y,kr(unitPrice),7);text(365,y,kr(net),7);text(440,y,kr(net+lineVat),7,true);text(525,y,rate+"%",7);y-=21;rect(48,y+7,500,0.5,"0.85 0.83 0.79");}
 // Reserve the complete summary, payment box and note together.
 next(9+20*(1+vatGroups.size)+23+48+4+106+(invoice.notes?12:0));
 y-=9;row("Sum eks. MVA",kr(subtotal));for(const [rate,value] of vatGroups)row("MVA "+rate+" %",kr(value));y-=23;rect(42,y-19,510,42,"0.96 0.94 0.89");text(53,y-5,"Å BETALE - INKL. MVA",12,true);text(405,y-5,kr(subtotal+vat),13,true);y-=48;
 y-=4;rect(42,y-73,510,94,"0.97 0.96 0.94");text(53,y,"BETALINGSINFORMASJON",10,true,"0.65 0.46 0.19");text(53,y-23,"Kontonummer: 8450 46 22699",9,true);text(305,y-23,"Forfall: "+(invoice.due_date||"Ikke valgt"),9);text(53,y-43,issued?"Merk betalingen med fakturanummer "+invoice.invoice_number:"Fakturanummer tildeles ved utstedelse.",8);text(53,y-61,issued?"Takk for oppdraget!":"Dette er en kladd - ikke et betalingskrav.",8,true);y-=106;
 if(invoice.notes){next(12);text(48,y,String(invoice.notes).slice(0,100),7);y-=16}
 }
 pages.push(s);
 const objs=[null,Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),null,Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`),logo,Buffer.from("\nendstream")])];
 const ids=[];for(let i=0;i<pages.length;i++){let content=pages[i];content+="0.7 0.67 0.61 RG 0.5 w 48 66 m 548 66 l S\n";content+=`BT /F1 8 Tf 0.35 0.33 0.30 rg 1 0 0 1 48 49 Tm (Aadland Service - Org.nr. 937 781 873 MVA - Steinsvikvegen 12P, 5251 ${esc("Søreidgrend")}) Tj ET\n`;content+=`BT /F1 8 Tf 0.35 0.33 0.30 rg 1 0 0 1 48 35 Tm (noreply@aadland-service.no - 471 54 898 - Side ${i+1}/${pages.length}) Tj ET\n`;const id=objs.length;ids.push(id);objs.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents ${id+1} 0 R >>`));objs.push(Buffer.from(`<< /Length ${Buffer.byteLength(content,"latin1")} >>\nstream\n${content}endstream`,"latin1"))}
 objs[2]=Buffer.from(`<< /Type /Pages /Kids [${ids.map(x=>x+" 0 R").join(" ")}] /Count ${ids.length} >>`);
 const parts=[Buffer.from("%PDF-1.4\n")],offsets=[0];let pos=parts[0].length;for(let i=1;i<objs.length;i++){offsets[i]=pos;const b=Buffer.concat([Buffer.from(i+" 0 obj\n"),objs[i],Buffer.from("\nendobj\n")]);parts.push(b);pos+=b.length}const startX=pos;let x=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;for(let i=1;i<objs.length;i++)x+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";x+=`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${startX}\n%%EOF`;parts.push(Buffer.from(x));return Buffer.concat(parts);
}
