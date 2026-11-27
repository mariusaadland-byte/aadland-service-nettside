import {createHash} from "node:crypto";
import {rentalCartInput} from "./rentalCart.mjs";
import {saleSnapshot} from "./rentalStockSettlement.mjs";
import {RENTAL_TERMS_VERSION} from "./rentalTermsVersion.mjs";
const max=2147483647, amount=v=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const clean=v=>typeof v==="string"&&v.trim().length>0&&v.length<=180&&!/[\x00-\x1f\x7f]/.test(v);
export function groupQuoteSnapshot({rentals,goods=[],today}){
 const validated=rentalCartInput({lines:rentals},today);
 if(!validated||!Array.isArray(goods))return null;
 let rentalOre=0,depositOre=0;
 const lines=[];
 for(let i=0;i<validated.length;i++){
  const x=validated[i],r=rentals[i];
  if(r.available!==true||!clean(r.name)||!amount(r.totalOre)||!amount(r.depositOre))return null;
  rentalOre+=r.totalOre;depositOre+=r.depositOre;
  if(!amount(rentalOre)||!amount(depositOre))return null;
  lines.push({...x,name:r.name,totalOre:r.totalOre,depositOre:r.depositOre});
 }
 const sale=goods.length?saleSnapshot(goods):{lines:[],grossOre:0};
 if(!sale||!amount(rentalOre+sale.grossOre+depositOre)||rentalOre+sale.grossOre<=0)return null;
 const salesOre=sale.grossOre,payableOre=rentalOre+salesOre;
 const snapshot={version:1,termsVersion:RENTAL_TERMS_VERSION,fulfillment:"pickup",rentals:lines.sort((a,b)=>a.itemId.localeCompare(b.itemId)),goods:sale.lines,rentalOre,salesOre,payableOre,depositOre};
 return {snapshot,digest:createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")};
}
// Requires a fresh server quote under the order transaction locks. Digest alone
// is neither proof of price acceptance nor an authorization to reserve/pay.
export function sameGroupQuote(expected,actual){
 return typeof expected==="string"&&/^[a-f0-9]{64}$/.test(expected)&&actual?.digest===expected;
}
// This is only a decision model. Inputs must be authenticated and persisted
// by a future server workflow, never taken from browser or redirect.
export function groupPaymentDecision({status,expectedOre,capturedOre,reservedOre=0,currency,expectedReference,reference}){
 if(!["held","payment_pending","confirmed","released","fulfilled"].includes(status)||!amount(expectedOre)||expectedOre<=0||!amount(capturedOre)||!amount(reservedOre)||currency!=="NOK"||typeof expectedReference!=="string"||!expectedReference||reference!==expectedReference)return "review";
 if(status==="released")return capturedOre>0||reservedOre>0?"review_late_payment":"no_change";
 if(capturedOre!==expectedOre)return capturedOre===0?"await_capture":"review";
 if(status==="confirmed"||status==="fulfilled")return "no_change";
 return "confirm_once";
}
