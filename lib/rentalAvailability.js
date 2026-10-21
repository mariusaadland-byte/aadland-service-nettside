// Count the largest number of simultaneous bookings, not all bookings
// touched by a longer requested period. Dates are inclusive UTC day keys.
export function peakRentalBookings(bookings,startDate,endDate,bufferDays=0){
 const day=86400000;
 const start=Date.parse(startDate+"T12:00:00Z"),end=Date.parse(endDate+"T12:00:00Z");
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new Error("Ugyldig datoperiode.");
 const buffer=Math.max(0,Math.floor(Number(bufferDays)||0))*day;
 const events=new Map();
 for(const booking of bookings||[]){
  const first=Math.max(start,Date.parse(booking.start_date+"T12:00:00Z")-buffer);
  const last=Math.min(end,Date.parse(booking.end_date+"T12:00:00Z")+buffer);
  if(!Number.isFinite(first)||!Number.isFinite(last)||last<first)continue;
  events.set(first,(events.get(first)||0)+1);
  events.set(last+day,(events.get(last+day)||0)-1);
 }
 let active=0,peak=0;
 for(const [,change] of [...events].sort(([a],[b])=>a-b)){active+=change;peak=Math.max(peak,active)}
 return peak;
}
