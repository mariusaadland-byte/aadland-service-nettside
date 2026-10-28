import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync("lib/vatReceiptParser.js","utf8").replace(/^export /gm,"");
const {parseNorwegianReceipt}=new Function(src+";return {parseNorwegianReceipt};")();

// Reconstructed receipt OCR from the paper-only photograph. Non-accounting
// details are removed. The first OCR pass mangles 25,00 into 257,00).
const first= [
 "Salgskvittering",
 "Julano Lagunen",
 "Org nr: 890 036 732 MVA",
 "TOTAL. NOK 1051.65",
 "Avrunding 0,35",
 "Kontant 1200.90",
 "Mva % Eks Mva Mva Salg",
 '257,00) "841,32 — 210,33 105165',
 "SUM 841,32 210,33 1051.55",
 "Dato : mandag 19. oktober 2026 18:43:05",
 "Kasse: 63599 Bong: 37889. (35179)"
].join("\n");
const jula=parseNorwegianReceipt(first);
assert.equal(jula.supplierName,"Julano Lagunen");
assert.equal(jula.documentNumber,"37889");
assert.equal(jula.documentDate,"2026-10-19");
assert.equal(jula.totalOre,105165,"TOTAL NOK takes precedence over a corrupted SUM gross column");
assert.deepEqual(jula.groups[25],{base:"841,32",vat:"210,33"});
assert.equal(jula.warnings.some(x=>/MVA-linjene stemmer ikke/.test(x)),false);

// Invalid VAT math or a mismatched independent total must never create VAT.
for(const raw of [
 "Butikk\nTOTAL NOK 1051,65\nMva % Eks Mva Mva Salg\n257,00 841,32 220,33\nDato 19.10.2026",
 "Butikk\nTOTAL NOK 1052,65\nMva % Eks Mva Mva Salg\n257,00 841,32 210,33\nDato 19.10.2026",
 "Butikk\nTOTAL NOK 1051,65\nVare 25,00 841,32 210,33\nDato 19.10.2026",
 "Butikk\nMva % Eks Mva Mva Salg\n257,00 841,32 210,33\nDato 19.10.2026",
 "Butikk\nTOTAL NOK 1051,65\nMva % Eks Mva Mva Salg\n257,00 841,32 210,33\n257,00 841,32 210,33\nDato 19.10.2026"
]){
 const p=parseNorwegianReceipt(raw);
 if(raw.includes("257,00 841,32 210,33\n257,00")){
  // Duplicate identical OCR rows are not a distinct conflicting result.
  assert.deepEqual(p.groups[25],{base:"841,32",vat:"210,33"});
 }else{
  assert.deepEqual(p.groups,{},"Reject guesses without complete VAT table / matching gross amount");
 }
}
const realRegular=parseNorwegianReceipt(
 "Testbutikk\nKvittering nr 32165\nDato 18.10.2026\nMVA 25 % Grunnlag 200,00 Avgift 50,00\nTOTAL NOK 250,00");
assert.deepEqual(realRegular.groups[25],{base:"200,00",vat:"50,00"},
 "Standard explicit 25% receipts still work");
console.log("Jula faktisk OCR-tekst bestått: skadet MVA-sats opprettet med totalavstemming; ugyldige rader avvist.");
