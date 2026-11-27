import assert from "node:assert/strict";
import {SIGNING_TESTS} from "../lib/signingTestSpecs.mjs";
import {runSigningTest} from "../lib/signingTestRunner.mjs";
for(const t of SIGNING_TESTS){const r=await runSigningTest(t.id);assert.equal(r.passed,true,JSON.stringify(r));}
assert.equal(await runSigningTest("bad"),null);
console.log("U-38J all six synthetic server test suites passed");
