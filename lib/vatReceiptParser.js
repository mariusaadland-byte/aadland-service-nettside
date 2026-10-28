// Conservative draft suggestions from locally-recognized Norwegian receipt text.
// No amounts are booked from these suggestions without manual validation.
const rates=[0,12,15,25];
const cleanLine=value=>String(value||"").replace(/\u00a0/g," ").replace(/[\t ]+/g," ").trim();
const amountPattern=/(?<![\d])(?:\d{1,3}(?:[ .\u00a0,]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
export function receiptAmountOre(value){
 // Receipts may have Norwegian 1.250,50, English 1,250.50 or 1250.50.
 // Never discard the only decimal delimiter, or 1250.50 becomes 125050.
 const raw=cleanLine(value).replace(/\s/g,"");
 let normalized;
 if(/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(raw))normalized=raw.replace(/\./g,"").replace(",",".");
 else if(/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(raw))normalized=raw.replace(/,/g,"");
 else if(/^\d+[,.]\d{2}$/.test(raw))normalized=raw.replace(",",".");
 else return null;
 const [whole,decimals]=normalized.split(".");
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

// A receipt may contain purchase, print and expiry dates. Ignore unrelated
// dates and refuse to auto-fill if several purchase dates seem possible.
export function receiptDocumentDate(lines,warnings=[]){
 const preferred=/\b(?:kjøpsdato|kvitteringsdato|fakturadato|purchased\s+on)\b/i;
 const labelled=/\b(?:dato|date)\b/i;
 const excluded=/\b(?:forfall(?:sdato)?|utskriftsdato|print(?:ed)?|utløpsdato|utløper|bestillingsdato|leveringsdato|registreringsdato|gyldig|byttefrist|returfrist|bestilt|due\s+date|valid\s+until|expiry)\b/i;
 const dateOnly=/^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})(?:\s+(?:kl\.?\s*)?\d{1,2}[:.]\d{2}(?::\d{2})?)?$/i;
 const strong=[],ordinary=[],standalone=[];
 for(let i=0;i<lines.length;i++){
  const line=cleanLine(lines[i]);
  if(excluded.test(line))continue;
  const label=preferred.test(line)?"strong":labelled.test(line)?"ordinary":null;
  let date=isoDate(line);
  // OCR can split "Dato:" and the date over separate lines.
  if(!date&&label&&i+1<lines.length&&dateOnly.test(lines[i+1]))
   date=isoDate(lines[i+1]);
  if(!date)continue;
  if(label==="strong")strong.push(date);
  else if(label==="ordinary")ordinary.push(date);
  else if(dateOnly.test(line))standalone.push(date);
 }
 const dates=strong.length?strong:ordinary.length?ordinary:standalone;
 const unique=[...new Set(dates)];
 if(unique.length===1)return unique[0];
 if(unique.length>1)warnings.push("Fant flere mulige dokumentdatoer. Velg riktig dato fra kvitteringen.");
 return "";
}
function supplier(lines){
 const skip=/^(?:kvittering|faktura|original|kundekopi|kopi|kasse|dato|tid|terminal|betaling|kontant|vipps|bank|kort|sum|total|betalt|mva|org(?:anisasjons(?:nummer|nr)?)?\.?\s*(?:nr\.?)?|takk|velkommen|www\.|https?:|butikk\s*nr|telefon|tlf\.?)/i;
 for(const line of lines.slice(0,11)){
  if(line.length<3||line.length>100||skip.test(line)||/^\d/.test(line))continue;
  if(/^[-\W\d]+$/.test(line))continue;
  if((line.match(/\d/g)||[]).length>line.length/3)continue;
  // Reject obvious OCR noise, rather than copying a garbled "supplier"
  // directly into accounting fields (e.g. "p EERO ES, NNN ~, Uh Wa").
  if(/[~^{}|]/.test(line))continue;
  if((line.match(/[,;:]/g)||[]).length>=2)continue;
  if((line.match(/[A-Za-zÆØÅæøåÀ-ÿ]/g)||[]).length<Math.max(4,line.length*.55))continue;
  if(!(line.match(/[A-Za-zÆØÅæøåÀ-ÿ]{3,}/g)||[]).length)continue;
  if((line.match(/\b[A-Za-zÆØÅæøå]\b/g)||[]).length>=3)continue;
  return line.slice(0,160);
 }
 return "";
}
function documentNumber(lines){
 const matcher=/\b(?:faktura(?:\s*(?:nr\.?|nummer))?|kvittering(?:s?\s*(?:nr\.?|nummer))?|kvitt\.?\s*(?:nr\.?)?|bong?\s*nr\.?|bilag\s*(?:nr\.?|nummer)|ordrenr\.?|ordre\s*nr\.?|bon\s*nr\.?|receipt\s*(?:no\.?|nr\.?))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/._-]{2,45})/i;
 for(const line of lines){
  const match=line.match(matcher);
  if(match&&!/^(?:nr|nummer|dato)$/i.test(match[1])&&!/^20\d\d[-/.]\d\d/.test(match[1]))
   return match[1].replace(/[.;:,]+$/,"").slice(0,90);
 }
 return "";
}
function totalFrom(lines){
 // Scan from the receipt's bottom, but never treat net or VAT subtotals
 // as the gross amount. OCR sometimes splits the amount onto the next line.
 const gross=/(?:\b(?:å\s*betale|a\s*betale|total(?:t)?|sum(?:\s*inkl\.?\s*mva)?|beløp\s*(?:betalt|å\s*betale)|betalt\s*(?:med|kr)?\s*$)\b)/i;
 const excludes=/(?:\bmva\s*(?:totalt|sum)\b|\bsum\s*mva\b|\bavgift\s*totalt\b|\b(?:netto|eks(?:kl)?\.?\s*mva|rabatt|vekslepenger)\b)/i;
 for(let i=lines.length-1;i>=0;i--){
  const line=lines[i];
  if(excludes.test(line)||!gross.test(line))continue;
  const found=amounts(line);
  if(found.length)return found.at(-1);
  // Only look at the immediately following line if it contains just one
  // money amount. Otherwise do not guess from another purchase line.
  if(i+1<lines.length&&!excludes.test(lines[i+1])){
   const next=lines[i+1],nextNumbers=amounts(next);
   if(nextNumbers.length===1&&/^(?:(?:nok|kr)\s*)?[0-9\s.,]+(?:\s*(?:kr|nok))?$/i.test(next))return nextNumbers[0];
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

// OCR often splits the MVA rate, taxable base and MVA amount onto different
// rows. Only accept neighboring rows with a clearly indicated VAT rate, and
// still reconcile the complete result against the printed gross total.
function isVatRateLine(line,previous,rate){
 const pct=new RegExp("(^|\\D)"+rate+"(?:[,.]00)?\\s*%(?!\\d)");
 if(pct.test(line))return true;
 const label=new RegExp("\\b(?:mva|moms|vat)\\s*(?:sats|%|prosent)\\s*[:=-]?\\s*"+rate+"(?:[,.]00)?\\s*%?(?=\\D|$)","i");
 if(label.test(line))return true;
 const numberOnly=new RegExp("^"+rate+"(?:[,.]00)?$");
 return numberOnly.test(line)&&/\b(?:mva|moms|vat)\s*%/i.test(previous);
}
function nearbyVatPair(lines,index,rate){
 const root=lines[index],found=chooseVatPair(amounts(root),rate);
 if(found)return found;
 const following=lines.slice(index+1,index+4);
 // Prefer explicitly named amounts, never unrelated product prices.
 const baseLine=following.find(x=>/\b(?:grunnlag|netto|eks(?:kl)?\.?\s*mva)\b/i.test(x));
 const vatLine=following.find(x=>/\b(?:mva|avgift|moms)\b/i.test(x)&&!/\b(?:grunnlag|mva\s*sats|mva\s*%)/i.test(x));
 const base=baseLine?amounts(baseLine).at(-1):null;
 const vat=vatLine?amounts(vatLine).at(-1):null;
 if(Number.isSafeInteger(base)&&Number.isSafeInteger(vat)&&base>0&&
    Math.abs(vat-Math.round(base*rate/100))<=5)return {baseOre:base,vatOre:vat};
 // Typical receipt tables: MVA rate on one row, then net and tax values
 // on the next. Require a nearby VAT specification header.
 const context=lines.slice(Math.max(0,index-4),index+1).join(" ");
 if(!/\b(?:mva|moms|merverdiavgift|avgift)\b/i.test(context))return null;
 for(const line of following.slice(0,2)){
  if(/\b(?:sum|total|betalt|kontant|kort|rabatt|vare|pris)\b/i.test(line))break;
  const numbers=amounts(line);
  const pair=chooseVatPair(numbers,rate);
  if(pair)return pair;
 }
 // Sometimes OCR creates a separate line for each column amount.
 const first=following[0],second=following[1];
 if(first&&second&&/^(?:kr\s*)?[\d\s.,]+$/.test(first)&&
    /^(?:kr\s*)?[\d\s.,]+$/.test(second)){
  const two=[...amounts(first),...amounts(second)];
  if(two.length===2)return chooseVatPair(two,rate);
 }
 return null;
}

export function parseNorwegianReceipt(text){
 const lines=String(text||"").replace(/\r/g,"").split("\n").map(cleanLine).filter(Boolean).slice(0,250);
 const warnings=[];
 if(lines.length<2)warnings.push("Fant for lite tekst. Prøv et skarpere bilde eller fyll inn manuelt.");
 const documentDate=receiptDocumentDate(lines,warnings);
 if(!documentDate)warnings.push("Kontroller dokumentdatoen manuelt.");
 const totalOre=totalFrom(lines);
 const detected=[];
 for(const rate of rates){
  const indices=lines.map((line,index)=>isVatRateLine(line,lines[index-1]||"",rate)?index:-1)
   .filter(index=>index>=0);
  const rows=indices.map(index=>lines[index]);
  let found=null;
  for(const index of indices){
   const pair=nearbyVatPair(lines,index,rate);
   if(pair){found=pair;break;}
  }
  if(!found&&rows.length){
   const isolated=rows.filter(l=>/\b(?:mva|moms|avgift)\b/i.test(l)).map(l=>amounts(l)).filter(a=>a.length===1).map(a=>a[0]);
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
