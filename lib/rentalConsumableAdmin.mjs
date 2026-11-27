import {rentalUnitId} from "./rentalUnitQr.mjs";
const bounded=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clean=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(v)?v.trim():null;
export function consumableAdminInput(x){
 const name=clean(x?.name,120),sku=clean(x?.sku,80);
 if(!name||!sku||!rentalUnitId(x.rentalItemId)||!bounded(x.priceOre,1,2147483647)||!(x.costOre===null||bounded(x.costOre,0,2147483647))||!bounded(x.threshold,0,1000000)||typeof x.active!=="boolean")return null;
 return {name,sku,rental_item_id:x.rentalItemId.toLowerCase(),price_ore:x.priceOre,cost_ore:x.costOre,low_stock_threshold:x.threshold,active:x.active};
}
export const revisionInput=v=>bounded(v,0,2147483646);
export function stockAdjustmentInput(x){
 if(!rentalUnitId(x?.id)||!rentalUnitId(x?.requestId)||!revisionInput(x.revision)||!bounded(x.delta,-1000000,1000000)||x.delta===0||!["purchase","count","loss","supplier_return","other"].includes(x.reason))return null;
 const note=clean(x.note,300);
 if(!note||((x.reason==="purchase")&&x.delta<0)||(["loss","supplier_return"].includes(x.reason)&&x.delta>0))return null;
 return {id:x.id.toLowerCase(),requestId:x.requestId.toLowerCase(),revision:x.revision,delta:x.delta,reason:x.reason,note};
}
export function stockStatus(p){return !p.active?"inactive":p.stock_quantity===0?"empty":p.stock_quantity<=p.low_stock_threshold?"low":"ok";}
export function parseOre(s){
 if(typeof s!=="string"||!/^\d{1,8}(?:[,.]\d{1,2})?$/.test(s.trim()))return null;
 const [a,b=""]=s.trim().replace(",",".").split(".");
 const n=Number(a)*100+Number(b.padEnd(2,"0"));
 return bounded(n,0,2147483647)?n:null;
}
