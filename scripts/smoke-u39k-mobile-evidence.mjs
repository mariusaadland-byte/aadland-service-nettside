import assert from "node:assert/strict";
import {scanRentalUnit} from "../lib/rentalScanInput.mjs";
import {bankEvidenceInput,bankImageDigest} from "../lib/groupBankEvidence.mjs";
const id="00000000-0000-4000-8000-000000000001";
assert.equal(scanRentalUnit("https://www.aadlandutleie.no/admin/utleie/enheter/"+id),id);assert.equal(scanRentalUnit("https://evil.invalid/"+id),null);
const p={groupId:id,kind:"deposit",reference:" DEMO ",amountOre:50000};assert.equal(bankEvidenceInput(p).reference,"DEMO");assert.equal(bankEvidenceInput({...p,kind:"record_refund"}),null);
const bytes=Buffer.alloc(40);bytes.set([255,216,255]);assert.equal(bankImageDigest(bytes).length,64);assert.equal(bankImageDigest(Buffer.alloc(40)),null);
console.log("U-39K QR and bank evidence input contract passed");
