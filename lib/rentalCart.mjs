import {rentalUnitId} from "./rentalUnitQr.mjs";
import {rentalDaysInclusive} from "./rentalCalendarSelection.mjs";
export const RENTAL_CART_MAX_LINES=10;
export function rentalCartInput(body,today){
 if(!Array.isArray(body?.lines)||body.lines.length<1||body.lines.length>RENTAL_CART_MAX_LINES)return null;
 const seen=new Set(),lines=[];
 for(const x of body.lines){
  if(!rentalUnitId(x?.itemId)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20||typeof x.startDate!=="string"||x.startDate<today)return null;
  const days=rentalDaysInclusive(x.startDate,x.endDate),id=x.itemId.toLowerCase();
  if(days<1||days>365||seen.has(id))return null;
  seen.add(id);lines.push({itemId:id,startDate:x.startDate,endDate:x.endDate,quantity:x.quantity});
 }
 return lines;
}
export function rentalCartTotals(lines){
 if(!Array.isArray(lines)||!lines.length||lines.some(x=>!x.available))return null;
 let rentalOre=0,depositOre=0,quantity=0;
 for(const x of lines){
  if(!Number.isSafeInteger(x.totalOre)||x.totalOre<0||!Number.isSafeInteger(x.depositOre)||x.depositOre<0||!Number.isInteger(x.quantity)||x.quantity<1)return null;
  rentalOre+=x.totalOre;depositOre+=x.depositOre;quantity+=x.quantity;
 }
 if(!Number.isSafeInteger(rentalOre)||!Number.isSafeInteger(depositOre)||rentalOre>2147483647||depositOre>2147483647)return null;
 return {rentalOre,depositOre,quantity};
}
