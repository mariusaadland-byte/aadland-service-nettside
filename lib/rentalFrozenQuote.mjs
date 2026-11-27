import {groupQuoteSnapshot} from "./rentalGroupQuote.mjs";
// Rebuild canonical snapshot from stored JSONB. Never hash raw JSONB key order.
export function checkFrozenGroupQuote(group){
 const s=group?.quote_snapshot;
 if(!s||s.version!==1||s.fulfillment!=="pickup"||s.termsVersion!==group.terms_version||!Array.isArray(s.rentals)||!s.rentals.length||!Array.isArray(s.goods))return null;
 try{
  const today=s.rentals.map(x=>x.startDate).sort()[0];
  if(typeof today!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
  const built=groupQuoteSnapshot({rentals:s.rentals.map(x=>({...x,available:true})),goods:s.goods,today});
  if(!built||built.digest!==group.quote_digest)return null;
  for(const [camel,snake] of [["rentalOre","rental_ore"],["salesOre","sales_ore"],["depositOre","deposit_ore"],["payableOre","payable_ore"]]){
   if(s[camel]!==built.snapshot[camel]||group[snake]!==built.snapshot[camel])return null;
  }
  return built;
 }catch{return null;}
}
