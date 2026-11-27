import {rentalUnitId} from "./rentalUnitQr.mjs";
import {rentalCartInput} from "./rentalCart.mjs";
import {consumableInput} from "./rentalConsumables.mjs";
import {rentalTermsAccepted} from "./rentalTermsVersion.mjs";
import {groupQuoteSnapshot,sameGroupQuote} from "./rentalGroupQuote.mjs";
export function groupReservationInput(body,today){
 if(!rentalUnitId(body?.requestId)||!rentalTermsAccepted(body)||typeof body.quoteDigest!=="string"||!/^[a-f0-9]{64}$/.test(body.quoteDigest))return null;
 const rentals=rentalCartInput(body,today),goods=consumableInput(body.consumables);
 if(!rentals||!goods)return null;
 // Deliberately no browser-provided totals or customer identity.
 return {requestId:body.requestId.toLowerCase(),quoteDigest:body.quoteDigest,rentals:rentals.sort((a,b)=>a.itemId.localeCompare(b.itemId)),goods:goods.sort((a,b)=>a.id.localeCompare(b.id))};
}
export function groupReservationPlan({input,serverRentals,serverGoods,today}){
 if(!input||!Array.isArray(serverRentals)||!Array.isArray(serverGoods))return null;
 const snapshot=groupQuoteSnapshot({rentals:serverRentals,goods:serverGoods,today});
 if(!snapshot||!sameGroupQuote(input.quoteDigest,snapshot))return null;
 const x=snapshot.snapshot;
 const actualRentals=x.rentals.map(({itemId,startDate,endDate,quantity})=>({itemId,startDate,endDate,quantity}));
 const actualGoods=x.goods.map(({id,quantity})=>({id,quantity}));
 if(JSON.stringify(input.rentals)!==JSON.stringify(actualRentals)||JSON.stringify(input.goods)!==JSON.stringify(actualGoods))return null;
 const units=[];
 for(const r of x.rentals){
  if(r.totalOre%r.quantity!==0||r.depositOre%r.quantity!==0)return null;
  for(let i=1;i<=r.quantity;i++)units.push({itemId:r.itemId,startDate:r.startDate,endDate:r.endDate,unit:i,totalOre:r.totalOre/r.quantity,depositOre:r.depositOre/r.quantity});
 }
 return {requestId:input.requestId,quoteDigest:snapshot.digest,snapshot:x,units,itemLocks:x.rentals.map(r=>r.itemId),goodsLocks:x.goods.map(r=>r.id)};
}
// Never used to authorize public access or a real payment.
export function reservationReplay(existing,{customerId,requestId,quoteDigest}){
 if(!existing)return "new";
 return existing.customerId===customerId&&existing.requestId===requestId&&existing.quoteDigest===quoteDigest?"same":"conflict";
}
