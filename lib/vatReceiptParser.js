// Conservative draft suggestions from locally-recognized Norwegian receipt text.
// No amounts are booked from these suggestions without manual validation.
const rates=[0,12,15,25];
const cleanLine=value=>String(value||"").replace(/\u00a0/g," ").replace(/[\t ]+/g," ").trim();
const amountPattern=/(?<![\d])(?:\d{1,3}(?:[ .]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
export function receiptAmountOre(value){
 const raw=cleanLine(value).replace(/[\s.]/g,"").replace(",",".");
 if(!/^\d+\.\d{2}$/.test(raw))return null;
 const [whole,decimals]=raw.split(".");
 const n=Number(whole)*100+Number(decimals);
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
const amounts=line=>[...String(line).matchAll(amountPattern)].map(m=>receiptAmountOre(m[0])).filter(Number.isSafeInteger);
const moneyInput=ore=>(ore/100).toFixed(2).replace(".",",");
function isoDate(line){
 const input=String(line);
 let match=input.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
 let y,m,d;
 if(match){[,y,m,d]=match;}
 else {
  match=input.match(/\b([0-2]?\d|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d{2}|\d{2})\b/);
  if(!match)return "";
  d=match[1];m=match[2];y=match[3].length===2?"20"+match[3]:match[3];
 }
 const date=y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
 const parsed=new Date(date+"T12:00:00Z");
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:"";
}
function supplier(lines){
 const skip=/^(?:kvittering|faktura|original|kundekopi|kopi|kasse|dato|tid|terminal|betaling|kontant|vipps|bank|kort|sum|total|betalt|mva|org(?:anisasjons)?\.?\s*nr|takk|velkommen|www\.|https?:|butikk\s*nr)/i;
 for(const line of lines.slice(0,11)){
  if(line.length<3||line.length>100||skip.test(line)||/^\d/.test(line))continue;
  if(/^[-\W\d]+$/.test(line))continue;
  if((line.match(/\d/g)||[]).length>line.length/3)continue;
  return line.slice(0,160);
 }
 return "";
}
function documentNumber(lines){
 const matcher=/\b(?:faktura(?:\s*(?:nr\.?|nummer))?|kvittering(?:s?\s*(?:nr\.?|nummer))?|bilag\s*(?:nr\.?|nummer)|ordrenr\.?|ordre\s*nr\.?|bon\s*nr\.?|receipt\s*(?:no\.?|nr\.?))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/._-]{2,45})/i;
 for(const line of lines){
  const match=line.match(matcher);
  if(match&&!/^(?:nr|nummer|dato)$/i.test(match[1])&&!/^20\d\d[-/.]\d\d/.test(match[1]))
   return match[1].replace(/[.;:,]+$/,"").slice(0,90);
 }
 return "";
}
function totalFrom(lines){
 for(let i=lines.length-1;i>=0;i--){
  const line=lines[i];
  if(/\b(?:mva\s*(?:totalt|sum)|sum\s*mva|avgift\s*totalt|eks(?:kl)?\.?\s*mva)\b/i.test(line))continue;
  if(/\b(?:a\s*betale|å\s*betale|totalt?\s*(?:inkl\.?\s*mva)?|sum\s*(?:inkl\.?\s*mva)?|beløp\s*(?:betalt|å\s*betale)|betalt\s*(?:med|kr)?\s*$)\b/i.test(line)){
   const nums=amounts(line);
   if(nums.length)return nums.at(-1);
  }
 }
 return null;
}
function chooseVatPair(numbers,rate){
 if(numbers.length<2)return null;
 const a=numbers.at(-2),b=numbers.at(-1);
 if(a>0&&Math.abs(b-Math.round(a*rate/100))<=5)return {baseOre:a,vatOre:b};
 if(b>0&&Math.abs(a-Math.round(b*rate/100))<=5)return {baseOre:b,vatOre:a};
 return null;
}
export function parseNorwegianReceipt(text){
 const lines=String(text||"").replace(/\r/g,"").split("\n").map(cleanLine).filter(Boolean).slice(0,250);
 const warnings=[];
 if(lines.length<2)warnings.push("Fant for lite tekst. Prøv et skarpere bilde eller fyll inn manuelt.");
 const dateLines=lines.filter(line=>/\b(?:fakturadato|kvitteringsdato|kjøpsdato|dato)\b/i.test(line));
 const documentDate=[...dateLines,...lines].map(isoDate).find(Boolean)||"";
 if(!documentDate)warnings.push("Kontroller dokumentdatoen manuelt.");
 const totalOre=totalFrom(lines);
 const detected=[];
 for(const rate of rates){
  const rows=lines.filter(line=>new RegExp("(?:^|\\D)"+rate+"\\s*%(?:\\D|$)").test(line)&&
    (/(?:mva|avgift|grunnlag|eks\.?\s*mva|inkl\.?\s*mva)/i.test(line)||
     /(?:mva|merverdiavgift)/i.test(lines.slice(0,40).join(" "))));
  let found=null;
  for(const line of rows){
   const nums=amounts(line);
   const pair=chooseVatPair(nums,rate);
   if(pair){found=pair;break;}
  }
  if(!found&&rows.length){
   const isolated=rows.map(l=>amounts(l)).filter(a=>a.length===1).map(a=>a[0]);
   if(isolated.length===1&&rates.some(r=>r===rate)&&totalOre!=null&&rate>0){
    const vatOre=isolated[0],baseOre=totalOre-vatOre;
    if(baseOre>0&&Math.abs(vatOre-Math.round(baseOre*rate/100))<=5)
     found={baseOre,vatOre};
   }
  }
  if(found)detected.push({rate,...found});
 }
 let groups={};
 for(const pair of detected){
  groups[pair.rate]={base:moneyInput(pair.baseOre),vat:moneyInput(pair.vatOre)};
 }
 const parsedGross=detected.reduce((n,p)=>n+p.baseOre+p.vatOre,0);
 if(totalOre!=null&&detected.length&&Math.abs(parsedGross-totalOre)>5){
  groups={};
  warnings.push("De leste MVA-linjene stemmer ikke med totalbeløpet. Beløp er derfor ikke fylt inn.");
 }else if(!detected.length){
  warnings.push("Kunne ikke lese sikkert grunnlag og MVA-sats. Fyll inn beløpene fra kvitteringen.");
 }
 if(totalOre==null)warnings.push("Totalbeløpet ble ikke tydelig lest. Kontroller summen på kvitteringen.");
 const name=supplier(lines),number=documentNumber(lines);
 if(!name)warnings.push("Leverandøren ble ikke gjenkjent.");
 if(!number)warnings.push("Bilags-/kvitteringsnummer ble ikke sikkert lest. Skriv det fra kvitteringen.");
 return {supplierName:name,documentNumber:number,documentDate,totalOre,
  groups,warnings,linesRead:lines.length};
}
