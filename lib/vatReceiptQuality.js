// Evaluate independent OCR passes without trusting any unverified field.
// Scores only decide which text is shown as a suggestion, never which values
// are booked. Conflicting document dates always require manual review.
export function vatReceiptScanQuality(scan){
 const p=scan?.parsed||{};
 const groupCount=Object.keys(p.groups||{}).length;
 const essential=[Boolean(p.supplierName),Boolean(p.documentDate),Number.isSafeInteger(p.totalOre)].filter(Boolean).length;
 const confidence=Number.isFinite(scan?.confidence)?Math.max(0,Math.min(100,scan.confidence)):null;
 return {
  essential,groupCount,
  score:(p.supplierName?2:0)+(p.documentNumber?1:0)+(p.documentDate?3:0)+
   (Number.isSafeInteger(p.totalOre)?3:0)+(groupCount?4+Math.min(groupCount-1,2):0)+
   (confidence===null?0:confidence/70)
 };
}
export function needsVatReceiptRetry(scan){
 const q=vatReceiptScanQuality(scan);
 return (Number.isFinite(scan?.confidence)&&scan.confidence<58)||
  q.essential<2||q.groupCount===0;
}
export function chooseVatReceiptScan(original,alternative){
 if(!alternative)return {...original,retried:false};
 const baseline=vatReceiptScanQuality(original);
 const next=vatReceiptScanQuality(alternative);
 const preferred=next.score>baseline.score+.35?alternative:original;
 let parsed=preferred.parsed;
 if(original.parsed?.documentDate&&alternative.parsed?.documentDate&&
    original.parsed.documentDate!==alternative.parsed.documentDate){
  parsed={...parsed,documentDate:"",
   warnings:["To ulike datoer ble lest fra samme kvittering. Sjekk dokumentdatoen manuelt.",...(parsed.warnings||[])]};
 }
 return {...preferred,parsed,retried:true};
}
