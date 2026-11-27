export function rentalAppointmentTime(value){
 return typeof value==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)?value:null;
}
export function rentalAppointmentValues(customer){
 return {pickupTime:rentalAppointmentTime(customer?.pickupTime)||"",returnTime:rentalAppointmentTime(customer?.returnTime)||""};
}
export function rentalAppointmentInput(booking,input){
 if(!booking||booking.archived_at||!["new","confirmed","active"].includes(booking.status)||!input||input.customerAgreed!==true)return null;
 if(typeof input.pickupTime!=="string"||typeof input.returnTime!=="string")return null;
 const pickupTime=input.pickupTime===""?"":rentalAppointmentTime(input.pickupTime);
 const returnTime=input.returnTime===""?"":rentalAppointmentTime(input.returnTime);
 if(pickupTime===null||returnTime===null)return null;
 if(booking.status==="active"&&pickupTime!==rentalAppointmentValues(booking.customer).pickupTime)return null;
 if(booking.start_date===booking.end_date&&pickupTime&&returnTime&&returnTime<=pickupTime)return null;
 return {pickupTime,returnTime};
}
export function rentalAppointmentLabel(date,time){
 return date+(rentalAppointmentTime(time)?" kl. "+time:" · klokkeslett avtales");
}
