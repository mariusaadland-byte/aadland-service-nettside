import assert from "node:assert/strict";
import {costHistoryInput,costHistoryRows} from "../lib/purchaseCostHistory.mjs";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",requestId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",b={id,requestId,expectedRevision:0,unit:"rental",reason:"Utleieverktøy",confirmed:true};
assert.equal(costHistoryInput(b).unit,"rental");assert.equal(costHistoryInput({...b,expectedRevision:-1}),null);assert.equal(costHistoryInput({...b,confirmed:false}),null);
const r={id,document_date:"2026-11-27",supplier_name:"Demo",supplier_document_number:"1",kind:"credit",base_ore:10000,vat_ore:2500,voided_at:null,cost_unit:"shared",cost_revision:1};
assert.equal(costHistoryRows([r],2026)[0].grossOre,-12500);assert.equal(costHistoryRows([r,r],2026),null);
console.log("U-39V cost history validation passed");
