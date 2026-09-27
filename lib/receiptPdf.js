import sharp from "sharp";
import path from "path";

function pdfText(value){
 const source=String(value??"")
  .replace(/[\u00A0\u202F]/g," ")
  .replace(/[–—]/g,"-")
  .replace(/…/g,"...")
  .replace(/[“”]/g,'"')
  .replace(/[‘’]/g,"'")
  .replace(/•/g,"-");
 const map={"æ":0xe6,"Æ":0xc6,"ø":0xf8,"Ø":0xd8,"å":0xe5,"Å":0xc5,"é":0xe9,"É":0xc9,"ö":0xf6,"Ö":0xd6,"ä":0xe4,"Ä":0xc4,"ü":0xfc,"Ü":0xdc,"·":0xb7};
 let out="";
 for(const ch of source){
  if(ch==="\\"){out+="\\\\";continue}
  if(ch==="("){out+="\\(";continue}
  if(ch===")"){out+="\\)";continue}
  const code=ch.charCodeAt(0);
  if(code>=32&&code<=126){out+=ch;continue}
  const byte=map[ch];
  if(byte!=null){out+="\\"+byte.toString(8).padStart(3,"0");continue}
  out+="?";
 }
 return out;
}
function money(ore){
 return new Intl.NumberFormat("nb-NO",{minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100)+" kr";
}
function dateTime(value){
 const d=value instanceof Date?value:new Date(value||Date.now());
 return d.toLocaleString("nb-NO",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Oslo"});
}
function safeFile(value){
 return String(value||"kvittering").replace(/[^a-z0-9_-]+/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")||"kvittering";
}
function wrap(value,max=78){
 const paragraphs=String(value||"").split(/\r?\n/);
 const lines=[];
 for(const paragraph of paragraphs){
  if(!paragraph.trim()){lines.push("");continue}
  const words=paragraph.trim().split(/\s+/);
  let line="";
  for(const word of words){
   const candidate=line?line+" "+word:word;
   if(candidate.length>max&&line){lines.push(line);line=word}else line=candidate;
  }
  if(line)lines.push(line);
 }
 return lines;
}
function rgb([r,g,b]){return `${r} ${g} ${b} rg`}
function textCmd(x,y,value,size=10,bold=false,color=[0.12,0.12,0.11]){
 return `BT /${bold?"F2":"F1"} ${size} Tf ${rgb(color)} ${x} ${y} Td (${pdfText(value)}) Tj ET\n`;
}
function rectCmd(x,y,w,h,color){
 return `${rgb(color)} ${x} ${y} ${w} ${h} re f\n`;
}
function lineCmd(x1,y1,x2,y2,color=[0.86,0.84,0.80],width=0.6){
 return `${color[0]} ${color[1]} ${color[2]} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

export function receiptPdfFilename(orderNumber){
 return "Kvittering-"+safeFile(orderNumber)+".pdf";
}

export async function buildReceiptPdf({
 test=false,
 orderNumber,
 customerName,
 customerEmail="",
 customerPhone="",
 customerAddress="",
 fulfillmentLabel="",
 reference,
 items=[],
 shippingOre=0,
 totalOre=0,
 paidAt=new Date(),
 orderNote="",
 quoteNumber="",
 quoteNote="",
 vatRate=25
}){
 const PAGE_W=595,PAGE_H=842,M=48,CONTENT_W=PAGE_W-M*2;
 const logoPath=path.join(process.cwd(),"public","aadland-service-logo.webp");
 const {data:logoJpeg,info:logoInfo}=await sharp(logoPath)
  .resize({width:420,withoutEnlargement:true})
  .flatten({background:"#11110f"})
  .jpeg({quality:92})
  .toBuffer({resolveWithObject:true});
 const pages=[];
 let cmds="",y=0,pageNo=0;

 function startPage(){
  if(cmds)pages.push(cmds);
  pageNo+=1;cmds="";
  cmds+=rectCmd(0,0,PAGE_W,PAGE_H,[1,1,1]);
  cmds+=rectCmd(0,760,PAGE_W,82,[0.065,0.065,0.058]);
  cmds+="q 148 0 0 77 "+M+" 762 cm /Logo Do Q\n";
  cmds+=textCmd(M+162,788,"BETALINGSBEKREFTELSE",9,true,[0.82,0.65,0.36]);
  cmds+=textCmd(PAGE_W-M-116,794,"Org.nr. 937 781 873 MVA",7,false,[0.62,0.61,0.57]);
  y=727;
  if(pageNo>1){
   cmds+=textCmd(M,y,"Kvittering "+String(orderNumber||""),9,true,[0.52,0.40,0.18]);y-=22;
  }
 }
 function ensure(height){
  if(y-height<72){startPage()}
 }
 function heading(label){
  ensure(28);cmds+=textCmd(M,y,String(label||"").toUpperCase(),8,true,[0.54,0.41,0.17]);y-=18;
 }
 function infoRow(label,value){
  ensure(25);
  cmds+=textCmd(M+10,y,String(label||"").toUpperCase(),8,true,[0.48,0.46,0.42]);
  const v=String(value||"");
  const approx=Math.max(0,CONTENT_W-190);
  const lines=wrap(v,Math.max(26,Math.floor(approx/6.2)));
  cmds+=textCmd(M+185,y,lines[0]||"",9,true,[0.13,0.13,0.12]);
  y-=19;
  for(const extra of lines.slice(1)){ensure(17);cmds+=textCmd(M+185,y,extra,8,false,[0.30,0.29,0.27]);y-=16}
  cmds+=lineCmd(M,y+6,PAGE_W-M,y+6);y-=5;
 }
 function noteBlock(label,value){
  const lines=wrap(value,76);
  const h=35+lines.length*14;
  ensure(h);
  cmds+=rectCmd(M,y-h+8,CONTENT_W,h,[0.97,0.96,0.93]);
  cmds+=rectCmd(M,y-h+8,3,h,[0.80,0.63,0.33]);
  cmds+=textCmd(M+14,y-12,String(label||"").toUpperCase(),8,true,[0.54,0.41,0.17]);
  let yy=y-31;
  for(const line of lines){cmds+=textCmd(M+14,yy,line,9,false,[0.30,0.29,0.27]);yy-=14}
  y-=h+9;
 }
 function footer(){
  cmds+=lineCmd(M,48,PAGE_W-M,48,[0.88,0.86,0.82],0.5);
  cmds+=textCmd(M,31,"Aadland Service · 471 54 898 · post@aadland-service.no · www.aadland-service.no",7,false,[0.45,0.43,0.40]);
  cmds+=textCmd(PAGE_W-M-45,31,String(pageNo),7,false,[0.45,0.43,0.40]);
 }

 startPage();
 if(test){
  cmds+=rectCmd(M,y-25,238,24,[1,0.97,0.90]);
  cmds+=textCmd(M+10,y-17,"TEST - INGEN BETALING REGISTRERT",8,true,[0.48,0.34,0.12]);
  y-=42;
 }
 cmds+=textCmd(M,y,"KVITTERING "+String(orderNumber||"—"),8,true,[0.54,0.41,0.17]);y-=28;
 cmds+=textCmd(M,y,"Betaling mottatt",24,true,[0.10,0.10,0.09]);
 cmds+=rectCmd(PAGE_W-M-74,y-4,74,26,[0.91,0.96,0.92]);
 cmds+=textCmd(PAGE_W-M-56,y+5,"BETALT",9,true,[0.18,0.42,0.22]);y-=25;
 for(const line of wrap("Hei "+String(customerName||"kunde")+". Vi har registrert betalingen. Her er en utskriftsvennlig kvittering med detaljene for bestillingen.",78)){
  cmds+=textCmd(M,y,line,10,false,[0.39,0.38,0.35]);y-=15;
 }
 y-=8;

 heading("Kvitteringsinformasjon");
 infoRow("Ordrenummer",orderNumber||"—");
 infoRow("Betalingsdato",dateTime(paidAt));
 infoRow("Referanse",reference||"—");
 if(quoteNumber)infoRow("Tilbudsnummer",quoteNumber);
 y-=12;

 const customerRows=[
  ["Kunde",customerName],
  ["E-post",customerEmail],
  ["Telefon",customerPhone],
  ["Adresse",customerAddress],
  ["Levering",fulfillmentLabel]
 ].filter(([,value])=>String(value||"").trim());
 if(customerRows.length){
  heading("Kunde og levering");
  for(const [label,value] of customerRows)infoRow(label,value);
  y-=12;
 }

 heading("Bestilling");
 const rows=Array.isArray(items)?items:[];
 for(const item of rows){
  const qty=Math.max(1,Number(item?.quantity)||1);
  const unit=Number(item?.unitPriceOre)||0;
  const details=(Array.isArray(item?.details)?item.details:[]).filter(d=>String(d?.value||"").trim());
  const nameLines=wrap(item?.name||"Produkt",48);
  const detailLines=details.flatMap(d=>wrap((d?.label?d.label+": ":"")+String(d?.value||""),62));
  const rowHeight=31+nameLines.length*13+detailLines.length*12;
  ensure(rowHeight);
  let rowY=y;
  for(const line of nameLines){cmds+=textCmd(M,rowY,line,11,true,[0.13,0.13,0.12]);rowY-=13}
  for(const line of detailLines){cmds+=textCmd(M,rowY,line,8,false,[0.43,0.41,0.38]);rowY-=12}
  cmds+=textCmd(M,rowY-2,"Antall: "+qty+" · Stykkpris: "+money(unit),8,false,[0.43,0.41,0.38]);
  cmds+=textCmd(PAGE_W-M-86,y,money(unit*qty),10,true,[0.13,0.13,0.12]);
  y-=rowHeight;
  cmds+=lineCmd(M,y+7,PAGE_W-M,y+7);y-=4;
 }
 if(Number(shippingOre)>0){
  ensure(28);
  cmds+=textCmd(M,y,"Frakt / levering",10,false,[0.30,0.29,0.27]);
  cmds+=textCmd(PAGE_W-M-86,y,money(shippingOre),10,true,[0.13,0.13,0.12]);
  y-=22;cmds+=lineCmd(M,y+6,PAGE_W-M,y+6);y-=10;
 }

 if(orderNote)noteBlock("Merknad til bestillingen",orderNote);
 if(quoteNote)noteBlock(quoteNumber?"Notat fra tilbud "+quoteNumber:"Notat fra tilbud",quoteNote);

 const rate=Math.max(0,Number(vatRate)||0);
 const gross=Math.max(0,Number(totalOre)||0);
 const net=rate>0?Math.round(gross/(1+rate/100)):gross;
 const vat=Math.max(0,gross-net);
 ensure(105);
 cmds+=textCmd(M+270,y,"Sum eks. MVA",9,false,[0.42,0.40,0.37]);
 cmds+=textCmd(PAGE_W-M-86,y,money(net),9,true,[0.25,0.24,0.22]);y-=18;
 cmds+=textCmd(M+270,y,"MVA "+rate+"%",9,false,[0.42,0.40,0.37]);
 cmds+=textCmd(PAGE_W-M-86,y,money(vat),9,true,[0.25,0.24,0.22]);y-=30;
 cmds+=rectCmd(M,y-40,CONTENT_W,40,[0.065,0.065,0.058]);
 cmds+=textCmd(M+16,y-25,"TOTALT BETALT",9,true,[0.82,0.65,0.36]);
 cmds+=textCmd(PAGE_W-M-112,y-27,money(gross),17,true,[1,1,1]);
 y-=62;
 for(const line of wrap("Dette dokumentet er en betalingsbekreftelse fra Aadland Service. Ta kontakt dersom noe ikke stemmer.",86)){
  cmds+=textCmd(M,y,line,8,false,[0.48,0.46,0.42]);y-=12;
 }

 footer();
 if(cmds)pages.push(cmds);

 const objects=[null,
  Buffer.from("<< /Type /Catalog /Pages 2 0 R >>","ascii"),
  null,
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","ascii"),
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>","ascii")
 ];
 const logoObject=Buffer.concat([
  Buffer.from("<< /Type /XObject /Subtype /Image /Width "+logoInfo.width+" /Height "+logoInfo.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+logoJpeg.length+" >>\nstream\n","ascii"),
  logoJpeg,
  Buffer.from("\nendstream","ascii")
 ]);
 objects.push(logoObject);
 const pageIds=[];
 for(const pageContent of pages){
  const pageId=objects.length;
  const contentId=pageId+1;
  pageIds.push(pageId);
  objects.push(Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+PAGE_W+" "+PAGE_H+"] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents "+contentId+" 0 R >>","ascii"));
  objects.push(Buffer.from("<< /Length "+Buffer.byteLength(pageContent,"ascii")+" >>\nstream\n"+pageContent+"endstream","ascii"));
 }
 objects[2]=Buffer.from("<< /Type /Pages /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>","ascii");

 const prefix=Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","binary");
 const parts=[prefix],offsets=[0];
 let offset=prefix.length;
 for(let id=1;id<objects.length;id++){
  offsets[id]=offset;
  const head=Buffer.from(id+" 0 obj\n","ascii");
  const body=objects[id];
  const tail=Buffer.from("\nendobj\n","ascii");
  parts.push(head,body,tail);
  offset+=head.length+body.length+tail.length;
 }
 const xrefOffset=offset;
 let xref="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let id=1;id<objects.length;id++)xref+=String(offsets[id]).padStart(10,"0")+" 00000 n \n";
 xref+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+xrefOffset+"\n%%EOF";
 parts.push(Buffer.from(xref,"ascii"));
 return Buffer.concat(parts);
}
