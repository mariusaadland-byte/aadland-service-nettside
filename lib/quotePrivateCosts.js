// Internal offer contribution calculations. All values are in øre, excluding VAT.
// This module NEVER adds costs to public quote lines.
const safeAmount=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=100000000?Math.round(n):null};
export function costMapFromLines(lines){
 const result={};
 for(const line of (Array.isArray(lines)?lines:[]).slice(0,120)){
  const id=String(line?.id||"").slice(0,100);
  if(!id||line?.internalUnitCostOre===""||line?.internalUnitCostOre==null)continue;
  const amount=safeAmount(line.internalUnitCostOre);
  if(amount!==null)result[id]=amount;
 }
 return result;
}
export function withPrivateCosts(lines,costs={}){
 return (Array.isArray(lines)?lines:[]).map(line=>({
  ...line,
  internalUnitCostOre:Object.prototype.hasOwnProperty.call(costs||{},line.id)&&safeAmount(costs[line.id])!==null
   ?safeAmount(costs[line.id]):""
 }));
}
export function calculateContribution(lines){
 let saleOre=0,costOre=0,coveredSaleOre=0,missing=0,known=0;
 const rows=[];
 for(const line of (Array.isArray(lines)?lines:[])){
  const quantity=Number(line?.quantity)||0,sale=Math.round(quantity*(Number(line?.unitPriceOre)||0));
  const price=line?.internalUnitCostOre;
  const hasCost=price!==""&&price!=null&&safeAmount(price)!==null;
  saleOre+=sale;
  if(!hasCost){if(String(line?.description||"").trim())missing++;continue}
  const cost=Math.round(quantity*safeAmount(price));costOre+=cost;coveredSaleOre+=sale;known++;
  rows.push({id:line?.id,costOre:cost,saleOre:sale,contributionOre:sale-cost});
 }
 return {saleOre,costOre,coveredSaleOre,contributionOre:coveredSaleOre-costOre,
  contributionPercent:coveredSaleOre>0?100*(coveredSaleOre-costOre)/coveredSaleOre:0,
  known,missing,complete:missing===0,rows};
}
