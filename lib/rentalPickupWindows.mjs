import {rentalDaysInclusive} from "./rentalCalendarSelection.mjs";
const keys=["sun","mon","tue","wed","thu","fri","sat"];
export function validRentalWindow(s){
 if(typeof s!=="string"||!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(s))return false;
 return s.slice(0,5)<s.slice(6);
}
export function parseRentalWindows(raw){
 try{
  const v=JSON.parse(raw||"{}"),out={};
  if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))return null;
  for(const k of keys){
   const a=v[k]??[];
   if(!Array.isArray(a)||a.length>24||a.some(x=>!validRentalWindow(x))||new Set(a).size!==a.length)return null;
   const sorted=[...a].sort();
   if(sorted.some((x,i)=>i>0&&sorted[i-1].slice(6)>x.slice(0,5)))return null;
   out[k]=sorted;
  }
  return out;
 }catch{return null;}
}
export function rentalWindowChoices(schedule,date,now=""){
 if(!rentalDaysInclusive(date,date)||!schedule)return [];
 const weekday=keys[new Date(date+"T12:00:00Z").getUTCDay()];
 if(now&&date<now.slice(0,10))return [];
 return (schedule[weekday]||[]).filter(x=>date!==now.slice(0,10)||x.slice(0,5)>now.slice(11,16));
}
export function rentalWindowConfig(env){
 if(env.RENTAL_PICKUP_WINDOWS_ENABLED!=="true")return {enabled:false,pickup:null,return:null};
 return {enabled:true,pickup:parseRentalWindows(env.RENTAL_PICKUP_WINDOWS_JSON),return:parseRentalWindows(env.RENTAL_RETURN_WINDOWS_JSON)};
}
export function validateRentalWindowRequest(b,config,fulfillment,start,end,now){
 const p=b?.pickupWindow??"",r=b?.returnWindow??"";
 if(!config.enabled||fulfillment!=="pickup")return p===""&&r===""?{}:null;
 if(!rentalWindowChoices(config.pickup,start,now).includes(p)||!rentalWindowChoices(config.return,end,now).includes(r))return null;
 if(start===end&&p.slice(6)>r.slice(0,5))return null;
 return {pickupWindow:p,returnWindow:r,windowStatus:"requested"};
}
export function rentalWindowSummary(c){
 if(c?.windowStatus!=="requested"||!validRentalWindow(c.pickupWindow)||!validRentalWindow(c.returnWindow))return "";
 return "Ønsket henting kl. "+c.pickupWindow.replace("-","–")+" · ønsket retur kl. "+c.returnWindow.replace("-","–")+" (må avtales)";
}
