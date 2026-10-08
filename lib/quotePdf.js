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


function quoteWrap(value,max=78){
 const lines=[];
 for(const paragraph of String(value??"").replace(/\r/g,"").split("\n")){
  if(!paragraph.trim()){lines.push("");continue}
  let current="";
  for(const rawWord of paragraph.trim().split(/\s+/)){
   let word=rawWord;
   while(word.length>max){
    if(current){lines.push(current);current=""}
    lines.push(word.slice(0,max));
    word=word.slice(max);
   }
   const candidate=current?current+" "+word:word;
   if(candidate.length>max&&current){lines.push(current);current=word}else current=candidate;
  }
  if(current)lines.push(current);
 }
 return lines;
}
function quoteDate(value){
 if(!value)return "";
 const d=new Date(String(value).length===10?String(value)+"T12:00:00":value);
 return Number.isFinite(d.getTime())?d.toLocaleDateString("nb-NO",{timeZone:"Europe/Oslo"}):"";
}
function approximateTextWidth(value,size,bold=false){
 let width=0;
 for(const ch of String(value??"")){
  if(" il.,:;!'|".includes(ch))width+=0.28;
  else if("mwMW@%".includes(ch))width+=0.86;
  else if(/[0-9]/.test(ch))width+=0.56;
  else width+=bold?0.58:0.52;
 }
 return width*size;
}
const PALETTE={
 ink:[0.105,0.100,0.090],brown:[0.43,0.40,0.35],gold:[0.72,0.50,0.22],
 line:[0.85,0.83,0.79],cream:[0.975,0.966,0.947],white:[1,1,1],black:[0.065,0.065,0.058]
};

export function quotePdfFilename(quote){
 const ref=typeof quote==="object"?quote?.quote_number:quote;
 const version=typeof quote==="object"?Number(quote?.revision_number)||1:1;
 return "Tilbud-"+safeFile(ref)+(version>1?"-revisjon-"+version:"")+".pdf";
}

export async function buildQuotePdf(quote){
 if(!quote||!quote.id||!quote.quote_number)throw new Error("Tilbudet har ikke gyldig ID og tilbudsnummer.");
 const PAGE_W=595,PAGE_H=842,M=48,RIGHT=PAGE_W-M,WIDTH=PAGE_W-2*M;
 const logoPath=path.join(process.cwd(),"public","aadland-service-logo.webp");
 const {data:logoJpeg,info:logoInfo}=await sharp(logoPath)
  .resize({width:420,withoutEnlargement:true}).flatten({background:"#11110f"})
  .jpeg({quality:88}).toBuffer({resolveWithObject:true});
 const pages=[];
 let cmds="",y=0,pageNo=0;
 function t(x,yy,value,size=10,bold=false,color=PALETTE.ink){cmds+=textCmd(x,yy,value,size,bold,color)}
 function right(yy,value,size=10,bold=false,color=PALETTE.ink){const x=Math.max(M,RIGHT-approximateTextWidth(value,size,bold));t(x,yy,value,size,bold,color)}
 function box(x,yy,w,h,color){cmds+=rectCmd(x,yy,w,h,color)}
 function rule(yy,color=PALETTE.line){cmds+=lineCmd(M,yy,RIGHT,yy,color,0.6)}
 function startPage(){
  if(pageNo>0)pages.push(cmds);
  pageNo++;cmds="";
  box(0,0,PAGE_W,PAGE_H,PALETTE.white);
  box(0,756,PAGE_W,86,PALETTE.black);
  const desiredWidth=150;
  const naturalHeight=desiredWidth*logoInfo.height/logoInfo.width;
  const logoHeight=Math.min(64,naturalHeight);
  const logoWidth=logoHeight<naturalHeight?desiredWidth*logoHeight/naturalHeight:desiredWidth;
  const x=M,yLogo=765+(66-logoHeight)/2;
  cmds+="q "+logoWidth.toFixed(2)+" 0 0 "+logoHeight.toFixed(2)+" "+x+" "+yLogo.toFixed(2)+" cm /Logo Do Q\n";
  t(M+167,794,"TILBUD",11,true,[0.82,0.65,0.36]);
  t(M+167,778,"AADLAND SERVICE",8,true,[0.95,0.95,0.94]);
  right(792,"Org.nr. 937 781 873 MVA",7,false,[0.75,0.74,0.70]);
  y=729;
  if(pageNo>1){t(M,y,"FORTSETTELSE · "+quote.quote_number,8,true,PALETTE.gold);y-=23}
 }
 function ensure(height){
  if(y-height<75)startPage();
 }
 function label(value){
  ensure(31);
  y-=11;t(M,y,String(value||"").toUpperCase(),9,true,PALETTE.gold);
  y-=15;rule(y);y-=15;
 }
 function paragraph(value,{size=9,max=99,color=PALETTE.brown,gap=13,bottom=11}={}){
  const lines=quoteWrap(value,max);
  for(const line of lines){
   ensure(gap+3);
   if(line)t(M,y,line,size,false,color);
   y-=gap;
  }
  y-=bottom;
 }
 function heading(value){
  const lines=quoteWrap(value,37);
  for(const line of lines){ensure(31);t(M,y,line,22,true,PALETTE.ink);y-=29}
  y-=3;
 }
 function field(fieldLabel,value){
  if(!String(value??"").trim())return;
  const lines=quoteWrap(value,67);
  ensure(22);
  t(M,y,String(fieldLabel).toUpperCase(),8,true,PALETTE.brown);
  t(M+156,y,lines.shift()||"",9,true,PALETTE.ink);
  y-=18;
  for(const line of lines){ensure(17);t(M+156,y,line,9,false,PALETTE.brown);y-=15}
  rule(y+6);y-=6;
 }
 function textSection(sectionTitle,value){
  if(!String(value||"").trim())return;
  label(sectionTitle);
  paragraph(value,{size:9,max:99,gap:14,bottom:17});
 }
 function priceRow(row){
  const description=String(row?.description||"Uten beskrivelse");
  const qty=Math.max(0,Number(row?.quantity)||0),unit=String(row?.unit||"stk");
  const unitPrice=Math.max(0,Number(row?.unitPriceOre??row?.unit_price_ore)||0);
  const taxRate=Math.max(0,Number(row?.vatRate??row?.vat_rate)||0);
  const net=Math.round(qty*unitPrice);
  const descLines=quoteWrap(description,49);
  ensure(50);
  let first=true;
  for(const line of descLines){
   ensure(15);
   t(M+8,y,line,9,first,PALETTE.ink);
   if(first){
    t(M+305,y,String(qty)+" "+unit,8,false,PALETTE.brown);
    right(y,money(net),9,true,PALETTE.ink);
   }
   y-=14;first=false;
  }
  ensure(15);
  t(M+8,y,"Enhetspris eks. MVA: "+money(unitPrice)+" · MVA: "+taxRate+" %",8,false,PALETTE.brown);
  y-=17;rule(y+5);y-=12;
 }
 function financialRow(name,value,bold=false){
  ensure(21);t(M+240,y,name,bold?10:9,bold,PALETTE.brown);
  right(y,money(value),bold?11:9,true,PALETTE.ink);y-=22;
 }
 function paymentRow(row,total){
  const percent=Math.max(0,Number(row.percent)||0);
  const labelLines=quoteWrap(row.label||"Delbetaling",46);
  const triggerLines=quoteWrap(row.trigger||"",65);
  const height=32+labelLines.length*13+triggerLines.length*12;
  ensure(height+10);
  box(M,y-height+15,WIDTH,height,PALETTE.cream);
  t(M+12,y-9,String(percent)+" %",10,true,PALETTE.gold);
  right(y-9,money(Math.round(Number(total||0)*percent/100)),10,true,PALETTE.ink);
  let yy=y-27;
  for(const line of labelLines){t(M+12,yy,line,9,true,PALETTE.ink);yy-=13}
  for(const line of triggerLines){t(M+12,yy,line,8,false,PALETTE.brown);yy-=12}
  y-=height+6;
 }

 startPage();
 t(M,y,"TILBUD "+String(quote.quote_number),10,true,PALETTE.gold);y-=22;
 const version=Math.max(1,Number(quote.revision_number)||1);
 if(version>1){t(M,y,"REVISJON "+version,9,true,PALETTE.brown);y-=19}
 heading(quote.title||"Tilbud");

 label("Tilbudsinformasjon");
 field("Tilbudsnummer",quote.quote_number);
 field("Dato",quoteDate(quote.created_at));
 field("Gyldig til",quoteDate(quote.valid_until)||"Etter avtale");
 field("Tidligst oppstart",quoteDate(quote.planned_start_date)||"Avtales");
 paragraph("Tidligste oppstart er veiledende. Endelig oppstart avtales etter godkjenning.",{size:8,max:99,gap:12,bottom:6});

 const customer=quote.customer||{};
 label("Kunde");
 field("Navn",customer.name||"");
 field("Adresse",customer.address||"");
 field("Telefon",customer.phone||"");
 field("E-post",customer.email||"");
 textSection("Beskrivelse av oppdraget",quote.intro_text);

 label("Priser og arbeid");
 ensure(32);
 box(M,y-18,WIDTH,25,PALETTE.black);
 t(M+8,y-10,"BESKRIVELSE / ENHETSPRIS",8,true,[0.95,0.95,0.94]);
 t(M+305,y-10,"ANTALL",8,true,[0.95,0.95,0.94]);
 right(y-10,"SUM EKS. MVA",8,true,[0.95,0.95,0.94]);
 y-=33;
 const items=Array.isArray(quote.line_items)?quote.line_items:[];
 for(const item of items)priceRow(item);
 y-=7;
 financialRow("Sum eks. MVA",quote.subtotal_ex_vat_ore);
 financialRow("MVA",quote.vat_ore);
 ensure(69);
 box(M,y-43,WIDTH,46,PALETTE.black);
 t(M+14,y-26,"TOTALT INKL. MVA",10,true,[0.82,0.65,0.36]);
 right(y-28,money(quote.total_inc_vat_ore),15,true,PALETTE.white);
 y-=66;

 const paymentPlan=Array.isArray(quote.payment_plan)?quote.payment_plan:[];
 if(paymentPlan.length){
  label("Betalingsplan");
  paragraph("Delbetaling etter fremdrift:",{size:9,max:80,gap:13,bottom:3});
  for(const row of paymentPlan)paymentRow(row,quote.total_inc_vat_ore);
  y-=9;
 }
 textSection("Tilleggsinformasjon",quote.notes);
 textSection("Vilkår",quote.terms);
 label("Godkjenning ved papirversjon");
 paragraph("Tilbudet kan godkjennes digitalt via lenken i e-posten. Ved papirversjon kan kunden signere nedenfor.",{size:9,max:93,gap:13,bottom:14});
 for(const [fieldName,labelValue] of [["Sted og dato",""],["Kundens navn",""],["Signatur",""]]){
  ensure(43);
  t(M,y,fieldName,8,true,PALETTE.brown);
  cmds+=lineCmd(M+130,y-2,RIGHT,y-2,PALETTE.line,0.8);
  y-=34;
 }

 pages.push(cmds);
 const footer=(index,count)=>{
  let s=lineCmd(M,51,RIGHT,51,PALETTE.line,0.6);
  s+=textCmd(M,35,"Aadland Service · 471 54 898 · post@aadland-service.no",7,false,PALETTE.brown);
  s+=textCmd(RIGHT-65,35,"Side "+(index+1)+" / "+count,7,false,PALETTE.brown);
  return s;
 };
 const objects=[null,
  Buffer.from("<< /Type /Catalog /Pages 2 0 R >>","ascii"),null,
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","ascii"),
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>","ascii")
 ];
 objects.push(Buffer.concat([
  Buffer.from("<< /Type /XObject /Subtype /Image /Width "+logoInfo.width+" /Height "+logoInfo.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+logoJpeg.length+" >>\nstream\n","ascii"),
  logoJpeg,
  Buffer.from("\nendstream","ascii")
 ]));
 const pageIds=[];
 const count=pages.length;
 for(let i=0;i<pages.length;i++){
  const content=pages[i]+footer(i,count);
  const pageId=objects.length,contentId=pageId+1;
  pageIds.push(pageId);
  objects.push(Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+PAGE_W+" "+PAGE_H+"] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents "+contentId+" 0 R >>","ascii"));
  objects.push(Buffer.from("<< /Length "+Buffer.byteLength(content,"ascii")+" >>\nstream\n"+content+"endstream","ascii"));
 }
 objects[2]=Buffer.from("<< /Type /Pages /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>","ascii");
 const prefix=Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","binary");
 const parts=[prefix],offsets=[0];let offset=prefix.length;
 for(let id=1;id<objects.length;id++){
  offsets[id]=offset;
  const head=Buffer.from(id+" 0 obj\n","ascii"),body=objects[id],tail=Buffer.from("\nendobj\n","ascii");
  parts.push(head,body,tail);offset+=head.length+body.length+tail.length;
 }
 const xrefOffset=offset;
 let xref="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let id=1;id<objects.length;id++)xref+=String(offsets[id]).padStart(10,"0")+" 00000 n \n";
 xref+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+xrefOffset+"\n%%EOF";
 parts.push(Buffer.from(xref,"ascii"));
 return Buffer.concat(parts);
}
