import {rentalDaysInclusive} from "./rentalCalendarSelection.mjs";
const isOre=v=>Number.isSafeInteger(v)&&v>=0;
const optionalRate=v=>isOre(v)&&v>0;
export function calculateRentalPrice(item,start,end){
 const days=rentalDaysInclusive(start,end);
 if(days<1||days>365||!optionalRate(item.dailyPriceOre)||!isOre(item.depositOre))return null;
 const dailyTotal=days*item.dailyPriceOre;
 let total=dailyTotal,basis="daily";
 if(optionalRate(item.weeklyPriceOre)&&days>=7){
  const weekly=Math.floor(days/7)*item.weeklyPriceOre+(days%7)*item.dailyPriceOre;
  if(weekly<total){total=weekly;basis="weekly";}
 }
 // Preserve existing eligibility: up to 3 days, touching Friday, Saturday or Sunday.
 if(optionalRate(item.weekendPriceOre)&&days<=3){
  const x=new Date(start+"T12:00:00Z").getUTCDay(),y=new Date(end+"T12:00:00Z").getUTCDay();
  if([x,y].some(v=>v===0||v===5||v===6)&&item.weekendPriceOre<total){total=item.weekendPriceOre;basis="weekend";}
 }
 const discount=Number(item.longTermDiscountPercent||0);
 if(!Number.isFinite(discount)||discount<0||discount>100)return null;
 const beforeDiscountOre=total;
 if(item.longTermDays&&days>=item.longTermDays&&discount>0){
  total=Math.round(total*(1-discount/100));basis+="+longterm";
 }
 // The database stores monetary amounts as signed integer øre.
 if(!isOre(total)||total>2147483647||item.depositOre>2147483647)return null;
 return {days,totalOre:total,depositOre:item.depositOre,basis,beforeDiscountOre,discountOre:beforeDiscountOre-total};
}
export function rentalQuoteMatches(expected,price){
 return !!expected&&!!price&&Number.isSafeInteger(expected.totalOre)&&Number.isSafeInteger(expected.depositOre)&&expected.totalOre===price.totalOre&&expected.depositOre===price.depositOre;
}
