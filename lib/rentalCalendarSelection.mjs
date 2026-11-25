export function rentalDaysInclusive(start,end){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start||"")||!/^\d{4}-\d{2}-\d{2}$/.test(end||""))return 0;
 const a=new Date(start+"T12:00:00Z"),b=new Date(end+"T12:00:00Z");
 if(!Number.isFinite(+a)||!Number.isFinite(+b)||a.toISOString().slice(0,10)!==start||b.toISOString().slice(0,10)!==end||b<a)return 0;
 return Math.round((b-a)/86400000)+1;
}
export function rentalCalendarReady(data,itemId,month,requestKey){
 return data?.itemId===itemId&&data?.month===month&&data?.requestKey===requestKey&&Array.isArray(data?.unavailableDates);
}
export function validRentalCalendarQuote(result,itemId,start,end){
 const days=rentalDaysInclusive(start,end),p=result?.pricing;
 return result?.id===itemId&&result?.available===true&&days>0&&days<=365&&p?.days===days&&Number.isSafeInteger(p.totalOre)&&p.totalOre>=0&&Number.isSafeInteger(p.depositOre)&&p.depositOre>=0;
}
