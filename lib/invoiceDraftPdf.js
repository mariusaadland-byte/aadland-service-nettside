import sharp from "sharp";
import path from "path";
const esc=v=>String(v??"").replace(/[–—]/g,"-").replace(/[^\x20-\x7eæøåÆØÅ]/g,"?").replace(/[\\()]/g,"\\$&").replace(/[æøåÆØÅ]/g,ch=>"\\"+ch.charCodeAt(0).toString(8));
const kr=v=>((Number(v)||0)/100).toLocaleString("nb-NO",{minimumFractionDigits:2,maximumFractionDigits:2})+" kr";
export async function buildInvoiceDraftPdf(invoice){
 const {data:logo,info}=await sharp(path.join(process.cwd(),"public","aadland-service-logo.webp")).resize({width:400,withoutEnlargement:true}).flatten({background:"#111111"}).jpeg({quality:82}).toBuffer({resolveWithObject:true});
 const W=595,H=842,pages=[];let y=0,s="";
 const text=(x,yy,v,size=10,bold=false,color="0.13 0.12 0.11")=>{s+=`BT /${bold?"F2":"F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${yy} Tm (${esc(v)}) Tj ET\n`};
 const rect=(x,yy,w,h,rgb)=>{s+=`${rgb} rg ${x} ${yy} ${w} ${h} re f\n`};
 const start=()=>{if(s)pages.push(s);s="";rect(0,0,W,H,"1 1 1");rect(0,742,W,100,"0.06 0.06 0.06");s+="q 130 0 0 "+(130*info.height/info.width).toFixed(1)+" 42 752 cm /Logo Do Q\n";text(265,790,"FAKTURAKLADD",19,true,"0.81 0.63 0.32");text(265,767,"IKKE UTSTEDT - IKKE TIL BETALING",8,true,"1 1 1");y=714;};
 const row=(a,b)=>{text(48,y,a,9);text(365,y,b,9,true);y-=20};
 const next=(need=35)=>{if(y-need<94)start()};
 start();text(48,y,"FAKTURAMOTTAKER",10,true,"0.65 0.46 0.19");y-=21;
 for(const line of [invoice.customer?.name,...String(invoice.customer?.address||"").split("\n")]){if(line){text(48,y,line,10);y-=17}}
 y-=16;text(48,y,"FAKTURADETALJER",10,true,"0.65 0.46 0.19");y-=22;
 row("Fakturanummer","Tildeles ved utstedelse");row("Forfallsdato",invoice.due_date||"Ikke valgt");row("Betalingsreferanse","Tildeles ved utstedelse");
 y-=20;text(48,y,invoice.title||"Oppdrag",13,true);y-=28;
 rect(42,y-11,510,29,"0.09 0.09 0.08");text(50,y,"BESKRIVELSE",9,true,"1 1 1");text(380,y,"ANTALL",9,true,"1 1 1");text(466,y,"SUM EKS. MVA",8,true,"1 1 1");y-=38;
 let subtotal=0,vat=0;
 for(const l of invoice.line_items||[]){next(47);const net=Math.round((Number(l.quantity)||0)*(Number(l.unitPriceOre)||0));subtotal+=net;vat+=Math.round(net*(Number(l.vatRate)||0)/100);const desc=String(l.description||"").slice(0,53);text(50,y,desc,9);text(380,y,String(l.quantity||0)+" "+String(l.unit||"stk").slice(0,6),8);text(466,y,kr(net),8,true);y-=16;text(50,y,"MVA "+(Number(l.vatRate)||0)+" %",7,false,"0.5 0.47 0.42");y-=25;rect(48,y+10,500,0.5,"0.85 0.83 0.79");}
 next(140);y-=9;row("Sum eks. MVA",kr(subtotal));row("MVA",kr(vat));rect(42,y-19,510,42,"0.96 0.94 0.89");text(53,y-5,"TOTALT",15,true);text(405,y-5,kr(subtotal+vat),15,true);y-=65;
 next(90);text(48,y,"BETALINGSINFORMASJON",10,true,"0.65 0.46 0.19");y-=23;row("Kontonummer","8450 46 22699");text(48,y,"Denne kladden er ikke et betalingskrav.",9,true);y-=22;
 if(invoice.notes){next(60);text(48,y,String(invoice.notes).slice(0,80),8);y-=20}
 pages.push(s);
 const objs=[null,Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),null,Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`),logo,Buffer.from("\nendstream")])];
 const ids=[];for(let i=0;i<pages.length;i++){let content=pages[i];content+="0.7 0.67 0.61 RG 0.5 w 48 66 m 548 66 l S\n";content+=`BT /F1 8 Tf 0.35 0.33 0.30 rg 1 0 0 1 48 49 Tm (Aadland Service - Org.nr. 937 781 873 MVA - Steinsvikvegen 12P, 5251 Soreidgrend) Tj ET\n`;content+=`BT /F1 8 Tf 0.35 0.33 0.30 rg 1 0 0 1 48 35 Tm (noreply@aadland-service.no - 471 54 898 - Side ${i+1}/${pages.length}) Tj ET\n`;const id=objs.length;ids.push(id);objs.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents ${id+1} 0 R >>`));objs.push(Buffer.from(`<< /Length ${Buffer.byteLength(content,"latin1")} >>\nstream\n${content}endstream`,"latin1"))}
 objs[2]=Buffer.from(`<< /Type /Pages /Kids [${ids.map(x=>x+" 0 R").join(" ")}] /Count ${ids.length} >>`);
 const parts=[Buffer.from("%PDF-1.4\n")],offsets=[0];let pos=parts[0].length;for(let i=1;i<objs.length;i++){offsets[i]=pos;const b=Buffer.concat([Buffer.from(i+" 0 obj\n"),objs[i],Buffer.from("\nendobj\n")]);parts.push(b);pos+=b.length}const startX=pos;let x=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;for(let i=1;i<objs.length;i++)x+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";x+=`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${startX}\n%%EOF`;parts.push(Buffer.from(x));return Buffer.concat(parts);
}
