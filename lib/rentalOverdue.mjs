export function rentalLateDays(end,today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(end||"")||!/^\d{4}-\d{2}-\d{2}$/.test(today||""))return 0;
 const a=new Date(end+"T12:00:00Z"),b=new Date(today+"T12:00:00Z");
 if(!Number.isFinite(+a)||!Number.isFinite(+b)||a.toISOString().slice(0,10)!==end||b.toISOString().slice(0,10)!==today)return 0;
 return Math.max(0,Math.round((b-a)/86400000));
}
export function rentalOverdue(b,today){
 return b?.status==="active"&&!(b.archivedAt||b.archived_at)&&rentalLateDays(b.endDate||b.end_date,today)>0;
}
export function rentalLateEstimate(b,today){
 const days=rentalOverdue(b,today)?rentalLateDays(b.endDate||b.end_date,today):0;
 const rate=b.priceSnapshot?.dailyPriceOre??b.price_snapshot?.dailyPriceOre;
 const value=days*rate;
 return {days,rateOre:Number.isSafeInteger(rate)&&rate>0?rate:null,estimateOre:Number.isSafeInteger(rate)&&rate>0&&Number.isSafeInteger(value)?value:null};
}
// Keep outstanding physical equipment unavailable through the requested window.
// This is an application precheck, not a substitute for the transaction lock.
export function extendOverdueAvailability(rows,today,through){
 return (rows||[]).map(b=>b.status==="active"&&rentalLateDays(b.end_date,today)>0&&b.end_date<through?{...b,end_date:through}:b);
}
export function rentalOverlapOr(from,today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error("Invalid rental dates");
 return "end_date.gte."+from+",and(status.eq.active,end_date.lt."+today+")";
}
