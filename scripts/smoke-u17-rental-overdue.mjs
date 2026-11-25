import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {rentalLateDays,rentalOverdue,rentalLateEstimate,extendOverdueAvailability,rentalOverlapOr} from "../lib/rentalOverdue.mjs";
const today="2026-11-25",b={status:"active",end_date:"2026-11-23",price_snapshot:{dailyPriceOre:45000}};
assert.equal(rentalLateDays(b.end_date,today),2);
assert.equal(rentalLateDays("2026-11-25",today),0);
assert.equal(rentalLateDays("2026-02-30",today),0);
assert.equal(rentalLateDays("2026-12-31","2027-01-02"),2);
assert.ok(rentalOverdue(b,today));
assert.ok(!rentalOverdue({...b,status:"returned"},today));
assert.deepEqual(rentalLateEstimate(b,today),{days:2,rateOre:45000,estimateOre:90000});
assert.equal(rentalLateEstimate({...b,price_snapshot:{}},today).estimateOre,null);
assert.equal(extendOverdueAvailability([b],today,"2026-12-01")[0].end_date,"2026-12-01");
assert.equal(extendOverdueAvailability([{...b,status:"confirmed"}],today,"2026-12-01")[0].end_date,b.end_date);
assert.equal(b.end_date,"2026-11-23");
assert.ok(rentalOverlapOr("2026-12-01",today).includes("status.eq.active"));
for(const p of ["app/api/rental/route.js","app/api/rental-bookings/route.js","app/api/rental/calendar/route.js","app/api/admin/rental-bookings/route.js"]){
 const src=readFileSync(p,"utf8");
 assert.ok(src.includes(".or(rentalOverlapOr(")&&src.includes("extendOverdueAvailability(countedRentalBookings("),p);
}
console.log("U-17 overdue day, estimate and availability precheck tests passed.");
