import assert from "node:assert/strict";
import {orderActions} from "../lib/groupOrderActions.mjs";
const row={signed:true,phase:"payment",groupStatus:"payment_pending",payment:"pending",depositOre:50000,depositRecorded:false,units:[]};
assert.deepEqual(orderActions(row),["deposit"]);assert.deepEqual(orderActions({...row,depositRecorded:true}),["prepare"]);assert.deepEqual(orderActions({...row,depositRecorded:true,reportId:"r"}),["capture"]);assert.deepEqual(orderActions({...row,phase:"review"}),[]);
const returned={phase:"settlement",groupStatus:"fulfilled",returned:1,totalUnits:1,blocked:0,damageCount:0,units:[{condition:"ok",released:true}]};
assert.deepEqual(orderActions(returned),["plan"]);assert.deepEqual(orderActions({...returned,damageCount:1}),[]);assert.deepEqual(orderActions({...returned,settlement:{requestId:"x",closed:false}}),["record_refund"]);
console.log("U-39J action visibility passed");
