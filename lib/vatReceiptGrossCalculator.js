// Read-only suggestions: no VAT is booked from OCR without a user review.
const rates=[0,12,15,25];
const str=n=>(n/100).toFixed(2).replace(".",",");

export function parseVatGrossInput(value){
 const text=String(value??"").trim().replace(/[\s\u00a0]/g,"");
 if(!text)return null;
 let raw=text;
 if(/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw))raw=raw.replace(/\./g,"").replace(",",".");
 else if(/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(raw))raw=raw.replace(/,/g,"");
 else if(/^\d+(?:[,.]\d{1,2})?$/.test(raw))raw=raw.replace(",",".");
 else return null;
 const [whole,decimals=""]=raw.split(".");
 const cents=Number(whole)*100+Number(decimals.padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents>=0?cents:null;
}

export function vatSplitFromGross(totalOre,rate){
 if(rate===null||rate===undefined||rate==="")return null;
 const pct=Number(rate);
 if(!Number.isSafeInteger(totalOre)||totalOre<=0||!Number.isInteger(pct)||!rates.includes(pct))return null;
 const baseOre=Math.round(totalOre*100/(100+pct));
 const vatOre=totalOre-baseOre;
 if(baseOre<=0||Math.abs(vatOre-Math.round(baseOre*pct/100))>5)return null;
 return {base:str(baseOre),vat:str(vatOre)};
}

// Only an explicitly stated VAT percentage or a recognized VAT TABLE rate
// is evidence. Never assume 25% for a whole receipt based on its shop name,
// item price, "25" text, discount, or gross amount alone.
export function singleReceiptVatRate(text){
 const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const found=new Set();
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/\b(?:rabatt|discount|spare)\b/i.test(line))continue;
  const named=/\b(?:mva|moms|vat)\s*(?:sats|rate|prosent)?\s*[:=-]?\s*(0|12|15|25)(?:[,.]00)?\s*%/ig;
  const preceding=/\b(0|12|15|25)(?:[,.]00)?\s*%\s*(?:mva|moms|vat)\b/ig;
  for(const regex of [named,preceding]){
   for(const m of line.matchAll(regex))found.add(Number(m[1]));
  }
  // Column headers vary (e.g. "Mva % Eks Mva Mva Salg").
  if(/\b(?:mva|moms|vat)\s*%/i.test(line)&&
     /\b(?:eks|grunnlag|netto)\b/i.test(line)){
   for(const candidate of lines.slice(i+1,i+4)){
    if(/^(?:sum|total|dato|kontant|kasse|betalt)\b/i.test(candidate))break;
    const rate=candidate.match(/^(0|12|15|25)(?:[,.]00)?(?:\s*%|\s+)(?=\S)/);
    if(rate)found.add(Number(rate[1]));
   }
  }
 }
 return found.size===1?[...found][0]:null;
}

export function completeVatReceiptAmounts(parsed,ocrText){
 const gross=parsed?.totalOre;
 if(!Number.isSafeInteger(gross)||gross<=0)return parsed;
 if(Object.keys(parsed.groups||{}).length)return parsed;
 // A conflict is not a missing field. Do not recover rejected/conflicting OCR.
 if((parsed.warnings||[]).some(w=>/ulike totalbeløp|MVA-tallene var forskjellige|MVA-grunnlaget.*stemmer ikke|MVA-linjene stemmer ikke|beløpene må kontrolleres/i.test(w)))
  return parsed;
 const rate=singleReceiptVatRate(ocrText),split=vatSplitFromGross(gross,rate);
 if(!split)return parsed;
 return {
  ...parsed,groups:{[rate]:split},warnings:[
   ...(parsed.warnings||[]).filter(w=>!/Kunne ikke lese sikkert grunnlag og MVA-sats/.test(w)),
   "Eks. MVA og MVA er beregnet fra gjenkjent totalsum og "+rate+" % MVA. Kontroller at hele kvitteringen har denne satsen."
  ]
 };
}
