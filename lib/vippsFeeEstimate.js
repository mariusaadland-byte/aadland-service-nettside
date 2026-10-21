// Estimates for pricing only. Settlement reports and the merchant agreement are authoritative.
export const VIPPS_STANDARD_RATE_BPS=299;
export const VIPPS_STANDARD_FIXED_ORE=100;
const MAX_ORE=10_000_000_000;
function validTerms(rateBps,fixedOre){return Number.isInteger(rateBps)&&rateBps>=0&&rateBps<10000&&Number.isSafeInteger(fixedOre)&&fixedOre>=0&&fixedOre<=MAX_ORE;}
export function vippsFeeEstimate(amountOre,{rateBps=VIPPS_STANDARD_RATE_BPS,fixedOre=VIPPS_STANDARD_FIXED_ORE}={}){
 if(!Number.isSafeInteger(amountOre)||amountOre<0||amountOre>MAX_ORE||!validTerms(rateBps,fixedOre))return null;
 const feeOre=amountOre===0?0:Math.round(amountOre*rateBps/10000)+fixedOre;
 return {amountOre,feeOre,payoutOre:amountOre-feeOre};
}
export function vippsPriceForPayout(targetOre,terms={}){
 if(!Number.isSafeInteger(targetOre)||targetOre<=0||targetOre>MAX_ORE)return null;
 const maximum=vippsFeeEstimate(MAX_ORE,terms);if(!maximum||maximum.payoutOre<targetOre)return null;
 // Find the lowest price that meets the target after rounding the fee to whole øre.
 let low=1,high=MAX_ORE;
 while(low<high){const mid=Math.floor((low+high)/2);if(vippsFeeEstimate(mid,terms).payoutOre>=targetOre)high=mid;else low=mid+1;}
 return vippsFeeEstimate(low,terms);
}

function validPaymentShares(shares){
 if(!Array.isArray(shares)||!shares.length||shares.length>8)return null;
 const nums=shares.map(Number);
 if(nums.some(x=>!Number.isFinite(x)||x<0||x>100)||Math.abs(nums.reduce((a,b)=>a+b,0)-100)>0.01)return null;
 return nums.filter(x=>x>0);
}
export function vippsFeeEstimateForPayments(amountOre,paymentPercentages=[100],terms={}){
 const shares=validPaymentShares(paymentPercentages);
 if(!shares||!Number.isSafeInteger(amountOre)||amountOre<0)return null;
 let remaining=amountOre,feeOre=0,count=0;
 for(let i=0;i<shares.length;i++){
  const part=i===shares.length-1?remaining:Math.min(remaining,Math.round(amountOre*shares[i]/100));
  remaining-=part;
  if(part<=0)continue;
  const estimate=vippsFeeEstimate(part,terms);
  if(!estimate)return null;
  feeOre+=estimate.feeOre;
  count++;
 }
 return {amountOre,feeOre,payoutOre:amountOre-feeOre,paymentCount:count};
}
export function vippsPriceForPayoutWithPayments(targetOre,paymentPercentages=[100],terms={}){
 if(!Number.isSafeInteger(targetOre)||targetOre<=0||targetOre>MAX_ORE)return null;
 const top=vippsFeeEstimateForPayments(MAX_ORE,paymentPercentages,terms);
 if(!top||top.payoutOre<targetOre)return null;
 let low=1,high=MAX_ORE;
 while(low<high){
  const mid=Math.floor((low+high)/2);
  if(vippsFeeEstimateForPayments(mid,paymentPercentages,terms).payoutOre>=targetOre)high=mid;
  else low=mid+1;
 }
 return vippsFeeEstimateForPayments(low,paymentPercentages,terms);
}
