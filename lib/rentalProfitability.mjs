export function parseRentalCost(value){
 if(typeof value!=="string"||!/^\d{1,9}([.,]\d{1,2})?$/.test(value.trim()))return null;
 const n=Math.round(Number(value.trim().replace(",","."))*100);
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function rentalProfitability(v){
 const fields=["purchase","daily","variable","fixed","earned","spent"];
 const amounts=Object.fromEntries(fields.map(k=>[k,parseRentalCost(v?.[k])]));
 if(Object.values(amounts).some(x=>x===null)||amounts.purchase<=0||amounts.daily<=0||typeof v.days!=="string"||!/^\d{1,2}$/.test(v.days.trim()))return null;
 const days=Number(v.days);
 if(days>30)return null;
 const dailyContribution=amounts.daily-amounts.variable;
 const monthlyRevenue=amounts.daily*days;
 const monthlyContribution=dailyContribution*days-amounts.fixed;
 const recovered=amounts.earned-amounts.spent;
 const remaining=Math.max(0,amounts.purchase-recovered);
 const months=remaining===0?0:monthlyContribution>0?remaining/monthlyContribution:null;
 const projectedDays=months===null?null:Math.ceil(months*days);
 const breakEvenDays=dailyContribution>0?Math.ceil(amounts.fixed/dailyContribution):null;
 return {dailyContribution,monthlyRevenue,monthlyContribution,recovered,remaining,months,projectedDays,breakEvenDays,paidBack:remaining===0};
}
export function rentalProductReceipts(rows,count){
 if(!Array.isArray(rows)||!Number.isInteger(count)||rows.length!==count)return null;
 let net=0;
 for(const b of rows){
  const c=b.payment_captured_ore,r=b.payment_refunded_ore;
  if(!Number.isSafeInteger(c)||!Number.isSafeInteger(r)||c<0||r<0||r>c)return null;
  net+=c-r;
  if(!Number.isSafeInteger(net))return null;
 }
 return net;
}
