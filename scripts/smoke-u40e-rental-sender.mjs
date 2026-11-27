import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/rentalEmailConfig.js","utf8");
const body=source.slice(source.indexOf("export function rentalEmailFrom()"),source.indexOf("export function rentalResendApiKey()")).replace("export function","function");
const from=new Function(body+";return rentalEmailFrom();")();
assert.equal(from,"Aadland Utleie <noreplay@aadlandutleie.no>");
for(const path of ["lib/rentalConfirmationEmail.js","lib/rentalGroupConfirmationEmail.js","app/api/admin/test-rental-receipt/route.js"]){assert.ok(readFileSync(path,"utf8").includes("rentalEmailFrom()"),path);}
console.log("Rental sender is fixed to owner-specified address");
