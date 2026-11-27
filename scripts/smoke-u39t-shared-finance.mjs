import assert from "node:assert/strict";
import {rentalYearControl,sharedFinanceControl} from "../lib/sharedFinanceControl.mjs";
const row={id:"demo",grossOre:30000,rentalOre:25000,salesOre:5000,capturedAt:"2026-12-31T23:30:00Z",transfer:"payment_confirmed"};
const data={rows:[row],totals:{depositUnsettledOre:50000,depositMissingOre:0}};
assert.equal(rentalYearControl(data,2026).capturedOre,0);const r=rentalYearControl(data,2027);assert.equal(r.capturedOre,30000);assert.equal(r.depositUnsettledOre,50000);
assert.equal(rentalYearControl({...data,rows:[row,row]},2027),null);
const legacy={year:2027,total:{invoicedGrossOre:30000,recordedPaymentsThisYearOre:30000,outstandingOre:0,expenseGrossOre:10000,externalGrossOre:0}};
const x=sharedFinanceControl({year:2027,legacy,rental:r});assert.equal(x.common.invoicedOre,30000);assert.equal(x.rental.capturedOre,30000);assert.equal(x.combinedRevenueOre,null);assert.equal(x.serviceOnlyOre,null);assert.equal(x.unallocatedPurchaseOre,10000);assert.equal(sharedFinanceControl({year:2026,legacy,rental:r}).common,null);
console.log("U-39T shared control, Oslo year boundary and no double counting passed");
