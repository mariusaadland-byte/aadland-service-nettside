import assert from "node:assert/strict";
import {runSigningTest} from "../lib/signingTestRunner.mjs";
import {releaseReadiness} from "../lib/rentalReleaseReadiness.mjs";
const result=await runSigningTest("finance");assert.ok(result?.passed,JSON.stringify(result));assert.equal(result.checks.length,7);
assert.equal(releaseReadiness().ready,false);assert.equal(releaseReadiness().open,10);
console.log("U-39W finance synthetic checks passed; launch remains blocked");
