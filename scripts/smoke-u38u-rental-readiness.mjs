import assert from "node:assert/strict";
import {releaseReadiness,RENTAL_RELEASE_BLOCKERS} from "../lib/rentalReleaseReadiness.mjs";
import {SIGNING_TESTS} from "../lib/signingTestSpecs.mjs";
import {runSigningTest} from "../lib/signingTestRunner.mjs";
const state=releaseReadiness();assert.equal(state.ready,false);assert.equal(state.open,10);
assert.equal(new Set(RENTAL_RELEASE_BLOCKERS.map(x=>x.id)).size,state.open);
for(const id of ["stock","damage","invoice","pdf"]){assert.ok(SIGNING_TESTS.some(x=>x.id===id));const r=await runSigningTest(id);assert.ok(r.passed,JSON.stringify(r));}
console.log("U-38U release readiness remains blocked; added synthetic tests passed");
