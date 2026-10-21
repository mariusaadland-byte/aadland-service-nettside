import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const code=readFileSync("lib/rentalAvailability.js","utf8");
const {peakRentalBookings}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const booking=(start,end)=>({start_date:start,end_date:end});
const separate=[booking("2026-11-01","2026-11-02"),booking("2026-11-04","2026-11-05")];
assert.equal(peakRentalBookings(separate,"2026-11-01","2026-11-05"),1,"Different days must not consume two units at once");
assert.equal(peakRentalBookings(separate,"2026-11-01","2026-11-05",1),2,"Buffers can make separate bookings overlap");
assert.equal(peakRentalBookings([booking("2026-11-01","2026-11-03"),booking("2026-11-03","2026-11-05")],"2026-11-01","2026-11-05"),2,"End dates count as occupied days");
assert.equal(peakRentalBookings(separate,"2026-11-03","2026-11-03"),0);
assert.equal(peakRentalBookings([],"2026-11-01","2026-11-05"),0);
assert.equal(peakRentalBookings([booking("2026-10-31","2026-10-31")],"2026-11-01","2026-11-01",1),1);
assert.equal(peakRentalBookings([booking("2026-11-02","2026-11-02")],"2026-11-01","2026-11-01",1),1);
assert.equal(peakRentalBookings([booking("2026-11-02","2026-11-02")],"2026-11-01","2026-11-01",0),0);
const source=readFileSync("app/api/rental/calendar/route.js","utf8");
const validMonth=new Function(source.slice(source.indexOf("function validMonth("),source.indexOf("function shiftDate("))+"return validMonth;")();
for(const month of ["2026-00","2026-13","0000-01","2026-1","wrong"])assert.equal(validMonth(month),false);
assert.equal(validMonth("2026-12"),true);
// Compare the sweep calculation against a direct per-day count across fixtures.
for(let size=0;size<15;size++){
 const rows=Array.from({length:size},(_,i)=>booking(`2026-11-${String(1+(i*7)%20).padStart(2,"0")}`,`2026-11-${String(3+(i*7)%20).padStart(2,"0")}`));
 for(const buffer of [0,1,2]){
  const first=Date.parse("2026-11-01T12:00:00Z"),last=Date.parse("2026-11-30T12:00:00Z"),day=86400000;
  let direct=0;for(let t=first;t<=last;t+=day)direct=Math.max(direct,rows.filter(r=>Date.parse(r.start_date+"T12:00:00Z")-buffer*day<=t&&Date.parse(r.end_date+"T12:00:00Z")+buffer*day>=t).length);
  assert.equal(peakRentalBookings(rows,"2026-11-01","2026-11-30",buffer),direct);
 }
}
console.log("Utleiekapasitet bestått: samtidige leier, flere eksemplarer, inklusive datoer, buffer og gyldig måned.");
