// Duration in work_time_entries remains gross stamped minutes.
// A separately stored deduction subtracts break time only for net work/billing.
export function netWorkMinutes(grossMinutes,deductedMinutes=0){
 const gross=Number(grossMinutes),minus=Number(deductedMinutes);
 if(!Number.isSafeInteger(gross)||gross<0||!Number.isSafeInteger(minus)||minus<0)return null;
 return gross-minus;
}
export function validDeductedMinutes(value){
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0&&n<=100000?n:null;
}
export function clockAfterDeduction(grossSaved,startedAt,nowMs,deductedMinutes=0){
 const gross=Number(grossSaved),minus=Number(deductedMinutes);
 const start=new Date(startedAt).getTime();
 const elapsed=Number.isFinite(start)&&Number.isFinite(nowMs)?
  Math.max(0,Math.floor((nowMs-start)/1000)):0;
 const rawSeconds=(Number.isSafeInteger(gross)&&gross>=0?gross*60:0)+elapsed-
  (Number.isSafeInteger(minus)&&minus>=0?minus*60:0);
 const seconds=Math.abs(rawSeconds);
 const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
 return (rawSeconds<0?"−":"")+[h,m,s].map(x=>String(x).padStart(2,"0")).join(":");
}

// The user enters deductions as decimal HOURS (Norwegian comma supported).
// The database still stores exact whole minutes, so lunch and earlier
// registrations keep their original values.
export function parseDeductionHours(value){
 const text=String(value??"").trim().replace(/\s/g,"");
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(text))return null;
 const amount=Number(text.replace(",","."));
 if(!Number.isFinite(amount))return null;
 const minutes=Math.round(amount*60);
 return validDeductedMinutes(minutes);
}
export function formatDeductionHours(minutes){
 const n=Number(minutes);
 if(!Number.isSafeInteger(n)||n<0)return "0";
 return new Intl.NumberFormat("nb-NO",{maximumFractionDigits:2})
  .format(n/60);
}
