import {rentalUnitId} from "./rentalUnitQr.mjs";
import {rentalDaysInclusive} from "./rentalCalendarSelection.mjs";
import {rentalTermsAccepted,RENTAL_TERMS_VERSION} from "./rentalTermsVersion.mjs";
import {validateRentalWindowRequest} from "./rentalPickupWindows.mjs";
export function manualRentalInput(b,today,config={enabled:false},now=""){
 if(!rentalUnitId(b?.itemId)||!rentalUnitId(b?.requestId)||!rentalTermsAccepted(b)||b.customerAccepted!==true||b.confirm!==true||b.startDate<today)return null;
 const days=rentalDaysInclusive(b.startDate,b.endDate);
 if(days<1||days>365)return null;
 const field=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\x00-\x1f]/.test(v)?v.trim():null;
 const name=field(b.name,120),email=field(b.email,254)?.toLowerCase(),phone=field(b.phone,40);
 if(!name||!email||!phone||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["phone","in_person"].includes(b.channel))return null;
 const windows=validateRentalWindowRequest(b,config,"pickup",b.startDate,b.endDate,now);
 if(windows===null)return null;
 const p=b.expectedPricing;
 if(!Number.isSafeInteger(p?.totalOre)||p.totalOre<1||!Number.isSafeInteger(p?.depositOre)||p.depositOre<0)return null;
 return {itemId:b.itemId.toLowerCase(),requestId:b.requestId.toLowerCase(),startDate:b.startDate,endDate:b.endDate,customer:{name,email,phone,...windows,fulfillment:"pickup",customerType:"private",siteOrigin:"https://www.aadlandutleie.no",bookingChannel:b.channel,termsVersion:RENTAL_TERMS_VERSION,termsAcceptanceSource:"recorded_by_admin"},expectedPricing:{totalOre:p.totalOre,depositOre:p.depositOre}};
}
export function manualRentalNumber(id){return rentalUnitId(id)?"AS-U-M-"+id.toUpperCase():null;}
export function manualRentalMatches(row,input){
 return !!row&&row.booking_number===manualRentalNumber(input.requestId)&&row.rental_item_id===input.itemId&&row.start_date===input.startDate&&row.end_date===input.endDate&&row.total_ore===input.expectedPricing.totalOre&&row.deposit_ore===input.expectedPricing.depositOre&&row.terms_version===RENTAL_TERMS_VERSION&&Object.entries(input.customer).every(([k,v])=>row.customer?.[k]===v);
}
