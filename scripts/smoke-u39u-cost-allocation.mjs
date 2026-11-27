import assert from "node:assert/strict";
import {purchaseCostAllocation,validCostUnit} from "../lib/purchaseCostAllocation.mjs";
const doc={document_date:"2026-11-27",base_ore:10000,vat_ore:2500,kind:"purchase"};
const data=[{...doc,id:"a",cost_unit:"service"},{...doc,id:"b",cost_unit:"rental"},{...doc,id:"c",cost_unit:"shared"},{...doc,id:"d",cost_unit:null},{...doc,id:"e",kind:"credit",cost_unit:"rental"},{...doc,id:"f",voided_at:"2026-11-27",cost_unit:"shared"}];
const r=purchaseCostAllocation(data,2026);assert.equal(r.totalGrossOre,37500);assert.equal(r.buckets.rental.grossOre,0);assert.equal(r.buckets.unallocated.grossOre,12500);assert.equal(r.buckets.shared.count,1);
assert.equal(purchaseCostAllocation([...data,data[0]],2026),null);assert.equal(purchaseCostAllocation([{...doc,id:"g",cost_unit:"other"}],2026),null);assert.equal(validCostUnit("shared"),true);assert.equal(validCostUnit(""),false);
console.log("U-39U cost allocation, credits, voids and unknown categories passed");
