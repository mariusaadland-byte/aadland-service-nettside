import {rentalHandoverChecklist} from "./rentalHandover.mjs";
export const RENTAL_SIGNING_VERSION="2026-11-27";
export const RENTAL_SIGNING_TEXT="Jeg bekrefter at jeg har lest og gjennomgått denne kontrollrapporten. Signeringen bekrefter gjennomgangen, ikke at jeg godtar et pengekrav, fraskriver meg rettigheter eller at betaling er gjennomført.";
export function rentalSigningReview(booking,next,accessory,control){
 if(!["active","returned"].includes(next)||!accessory?.customer||accessory.error)return null;
 const phase=next==="active"?accessory.customer.accessoryHandover:accessory.customer.accessoryReturn;
 if(!phase)return null;
 const fields=rentalHandoverChecklist(next);
 if(!fields.every(([k])=>control?.checks?.[k]===true))return null;
 const note=String(control.note??"").trim();
 if(note.length>700)return null;
 return {version:RENTAL_SIGNING_VERSION,bookingId:booking.id,bookingNumber:booking.bookingNumber??booking.booking_number,itemName:booking.itemName??booking.rental_items?.name??"",startDate:booking.startDate??booking.start_date,endDate:booking.endDate??booking.end_date,phase:next,checks:fields.map(([,label])=>label),accessories:phase.rows??[],legacy:phase.legacy===true,deviation:control.deviation===true||accessory.deviation===true,note,statement:RENTAL_SIGNING_TEXT};
}
export function rentalSigningInput(review,input){
 if(!review||input?.agreed!==true||input?.witnessed!==true||input.review!==JSON.stringify(review))return null;
 const name=typeof input.name==="string"?input.name.trim():"";
 if(name.length<2||name.length>120||/[\x00-\x1f\x7f]/.test(name))return null;
 return {name,review};
}
export function rentalSignatureSummary(value){
 if(!value||typeof value!=="object")return {};
 const result={};
 for(const phase of ["active","returned"]){const x=value[phase];if(x?.version===RENTAL_SIGNING_VERSION&&typeof x.recordedAt==="string"&&typeof x.name==="string")result[phase]={name:x.name,recordedAt:x.recordedAt,method:"typed_in_person",digest:x.digest};}
 return result;
}
