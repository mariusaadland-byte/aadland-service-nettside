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
