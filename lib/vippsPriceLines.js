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

// Adjust an existing line price rather than adding a separate "Vipps fee" line.
// The confirmed price is part of the ordinary customer agreement and persists on saving.
export function linesForCustomerTotal(lines,targetTotalOre){
 if(!Number.isSafeInteger(targetTotalOre)||targetTotalOre<=0||!Array.isArray(lines)||!lines.length||customerTotalOre(lines)===null)return null;
 const rank=(l)=> (l.type==="work"?0:l.type==="other"?1:2)*1e7+Math.abs(Number(l.quantity)-1);
 const index=lines.map((line,i)=>i).sort((a,b)=>rank(lines[a])-rank(lines[b]))[0];
 const at=unitPriceOre=>{
  const updated=lines.map((line,i)=>i===index?{...line,unitPriceOre}:line);
  return {lineItems:updated,totalOre:customerTotalOre(updated)};
 };
 const bottom=at(0),top=at(100000000);
 if(bottom.totalOre===null||top.totalOre===null||targetTotalOre<bottom.totalOre||targetTotalOre>top.totalOre)return null;
 let low=0,high=100000000;
 while(low<high){
  const mid=Math.floor((low+high)/2);
  if(at(mid).totalOre>=targetTotalOre)high=mid;
  else low=mid+1;
 }
 const result=at(low);
 return {...result,adjustedLineIndex:index,roundingDifferenceOre:result.totalOre-targetTotalOre};
}
