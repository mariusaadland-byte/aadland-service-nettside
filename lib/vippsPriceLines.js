// Calculate the complete customer total using the same per-line VAT rounding as quote/invoice APIs.
export function customerTotalOre(lines){
 if(!Array.isArray(lines)||lines.length===0||lines.length>120)return null;
 let total=0;
 for(const line of lines){
  const qty=Number(line.quantity),unit=Number(line.unitPriceOre),vat=Number(line.vatRate);
  if(line.unitPriceOre===""||line.unitPriceOre==null||!Number.isFinite(qty)||qty<=0||
     !Number.isSafeInteger(unit)||unit<0||unit>100000000||
     !Number.isFinite(vat)||vat<0||vat>100)return null;
  const net=Math.round(qty*unit);
  total+=net+Math.round(net*vat/100);
 }
 return Number.isSafeInteger(total)?total:null;
}

// Only materials and other goods/expenses may be marked up. An hourly rate is immutable.
// In old invoice drafts, carefully recognise unmistakable material/expense descriptions
// when line.type is missing. Never treat an untyped generic service as an expense.
const hourlyUnit=/^(t|time|timer|h|hour|hours)$/i;
const clearExpense=/\\b(materialer?|forbruksmateriell|vare(r|linje)?|festemidler|frakt|bompenger|transportkostnad|kjøregodtgjørelse|reiseutgifter)\\b/i;
const laborDescription=/\\b(arbeid|arbeidstimer?|timearbeid|tømrerarbeid|montering|arbeidslønn)\\b/i;
export function canAdjustVippsPriceLine(line){
 if(!line||typeof line!=="object")return false;
 if(hourlyUnit.test(String(line.unit||"").trim()))return false;
 const kind=String(line.type||"").trim().toLowerCase();
 if(kind==="work"||kind==="labor"||kind==="service")return false;
 if(kind==="material"||kind==="consumable")return true;
 if(kind==="other")return !laborDescription.test(String(line.description||""));
 return !kind&&clearExpense.test(String(line.description||""))&&!laborDescription.test(String(line.description||""));
}
export function hasAdjustableVippsPriceLine(lines){
 return Array.isArray(lines)&&lines.some(canAdjustVippsPriceLine);
}

// Change only an existing material or expense line. NEVER inflate the hour price.
// Keep the total including VAT at least as high as the desired ordinary agreed price;
// any extra cents are only from quantity/VAT rounding.
export function linesForCustomerTotal(lines,targetTotalOre){
 if(!Number.isSafeInteger(targetTotalOre)||targetTotalOre<=0||!Array.isArray(lines)||!lines.length)return null;
 const original=customerTotalOre(lines);
 if(original===null)return null;
 const candidates=lines.map((line,i)=>({line,i}))
  .filter(item=>canAdjustVippsPriceLine(item.line))
  .sort((a,b)=>{
   const priority=l=>l.type==="material"||l.type==="consumable"?0:1;
   return priority(a.line)-priority(b.line)||Math.abs(Number(a.line.quantity)-1)-Math.abs(Number(b.line.quantity)-1);
  }).map(item=>item.i);
 if(!candidates.length)return null;
 // Do not reduce any price when the requested amount is less than the existing price,
 // and do not add a second uplift when the user applies the same calculation again.
 if(original>=targetTotalOre)return {lineItems:lines.map(l=>({...l})),totalOre:original,adjustedLineIndex:candidates[0],roundingDifferenceOre:original-targetTotalOre};
 for(const index of candidates){
  const at=unitPriceOre=>{
   const updated=lines.map((line,i)=>i===index?{...line,unitPriceOre}:line);
   return {lineItems:updated,totalOre:customerTotalOre(updated)};
  };
  const max=at(100000000);
  if(max.totalOre===null||max.totalOre<targetTotalOre)continue;
  let low=Number(lines[index].unitPriceOre),high=100000000;
  while(low<high){
   const mid=Math.floor((low+high)/2);
   if(at(mid).totalOre>=targetTotalOre)high=mid;
   else low=mid+1;
  }
  const result=at(low);
  return {...result,adjustedLineIndex:index,roundingDifferenceOre:result.totalOre-targetTotalOre};
 }
 return null;
}
