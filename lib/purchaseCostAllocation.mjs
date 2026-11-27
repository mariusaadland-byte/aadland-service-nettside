export const costUnits={service:"Aadland Service",rental:"Aadland Utleie",shared:"Felles kostnad"};
export function validCostUnit(value){return typeof value==="string"&&Object.hasOwn(costUnits,value);}
export function purchaseCostAllocation(documents,year){
 if(!Array.isArray(documents)||!Number.isInteger(year)||year<2000||year>2100)return null;
 const buckets=Object.fromEntries(["service","rental","shared","unallocated"].map(k=>[k,{grossOre:0,count:0}]));
 const seen=new Set();
 for(const d of documents){
  if(!d?.id||seen.has(d.id)||typeof d.document_date!=="string")return null;
  seen.add(d.id);
  if(d.voided_at||d.document_date.slice(0,4)!==String(year))continue;
  const base=Number(d.base_ore),vat=Number(d.vat_ore);
  if(!["purchase","credit"].includes(d.kind)||![base,vat].every(Number.isSafeInteger)||base<=0||vat<0||!Number.isSafeInteger(base+vat)||d.cost_unit!=null&&!validCostUnit(d.cost_unit))return null;
  const b=buckets[d.cost_unit??"unallocated"];b.grossOre+=(d.kind==="credit"?-1:1)*(base+vat);b.count++;
  if(!Number.isSafeInteger(b.grossOre))return null;
 }
 const total=Object.values(buckets).reduce((n,b)=>n+b.grossOre,0);
 return Number.isSafeInteger(total)?{buckets,totalGrossOre:total}:null;
}
