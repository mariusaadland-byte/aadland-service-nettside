import {rentalDaysInclusive} from "./rentalCalendarSelection.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const appointmentKinds={pickup:"Henting",return:"Retur",either:"Henting eller retur"};
export function validAppointmentTime(value){return typeof value==="string"&&/^([01]\d|2[0-3]):(00|30)$/.test(value);}
export function appointmentSlotInput(b,today){
 if(!rentalUnitId(b?.requestId)||typeof b.date!=="string"||rentalDaysInclusive(b.date,b.date)!==1||b.date<today||rentalDaysInclusive(today,b.date)>365||!validAppointmentTime(b.time)||!Object.hasOwn(appointmentKinds,b.kind))return null;
 return {id:b.requestId.toLowerCase(),slot_date:b.date,slot_time:b.time+":00",kind:b.kind};
}
export function appointmentAssignment(b){
 return rentalUnitId(b?.slotId)&&rentalUnitId(b?.bookingId)&&["pickup","return"].includes(b.kind)?{slotId:b.slotId.toLowerCase(),bookingId:b.bookingId.toLowerCase(),kind:b.kind}:null;
}
export function appointmentMatches(slot,input){return !!slot&&slot.id===input.id&&slot.slot_date===input.slot_date&&slot.slot_time===input.slot_time&&slot.kind===input.kind;}
