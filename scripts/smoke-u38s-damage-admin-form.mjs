import assert from "node:assert/strict";
import {damageAmountOre,damageFormPayload} from "../lib/damageAdminForm.mjs";
assert.equal(damageAmountOre("450,50"),45050);assert.equal(damageAmountOre("450"),45000);assert.equal(damageAmountOre("0"),null);assert.equal(damageAmountOre("1,001"),null);assert.equal(damageAmountOre("1e4"),null);assert.equal(damageAmountOre("99999999"),null);
const [id,groupId,bookingId]=Array.from({length:3},(_,i)=>"00000000-0000-4000-8000-00000000000"+(i+1)),photo="a".repeat(64),cost="b".repeat(64);
const args={id,selected:{groupId,bookingId},description:" Demo ",amount:"450,50",photos:[photo],cost};
assert.deepEqual(damageFormPayload(args),{id,group_id:groupId,booking_id:bookingId,description:"Demo",amount_ore:45050,photo_digests:[photo],cost_proof_digest:cost});
assert.equal(damageFormPayload({...args,cost:photo}),null);assert.equal(damageFormPayload({...args,photos:[]}),null);assert.equal(damageFormPayload({...args,photos:[photo,photo]}),null);assert.equal(damageFormPayload({...args,description:" "}),null);
console.log("U-38S admin damage form validation passed");
