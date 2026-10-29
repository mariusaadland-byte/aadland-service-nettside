import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/vatSupplierInvoiceParser.js","utf8").replace(/^export /gm,"");
const {parseNorwegianSupplierInvoice,isLikelySupplierInvoice}=
 new Function(source+";return {parseNorwegianSupplierInvoice,isLikelySupplierInvoice};")();
// Anonymous fixture replicates a real-world two-page Norwegian wholesale invoice.
// The customer's actual uploaded PDF, name, organization number, invoice ID,
// bank account and payment reference are NOT committed into this repository.
const page1=[
 "FAKTURA",
 "RETURADRESSE: FJORDGROSSIST AS 880020011",
 "POSTBOKS 5000 - SENTRUM 5000 EKSEMPELBY",
 "KUNDEFIRMA AS Fjordgrossist AS",
 "Eksempelveien 12 Avd. Byggvarehandel Vest",
 "5000 EKSEMPELBY 5002 EKSEMPELSTED",
 "Fjordgrossist AS Foretaksregisteret NO000000000MVA",
 "Fakturanummer 880020011",
 "Fakturadato 14.09.2026",
 "Forfallsdato Bankkonto KID Å betale",
 "28.09.2026 1506.81.12345 00000008800200111 2 500,00",
 "Vårt ordrenr 99555501 Leveringsdato 12.09.2026",
 "Betalingsbet 14 dager etter leveringsdato Ordretotal (U/MVA) 2 000,00 NOK",
 "Linje Artikkelnr Beskrivelse MVA Salgsantall Prisantall Pris Beløp",
 "5 51122333 FESTEMATERIELL 25,00 % 1,000 STK 1,000 STK 250,00 250,00",
 "10 51122444 DIV VARER 25,00 % 1,000 STK 1,000 STK 250,00 250,00"
].join("\n");
const page2=[
 "FAKTURA",
 "880020011",
 "Linje Artikkelnr Beskrivelse MVA Salgsantall Prisantall Pris Beløp",
 "30 51122555 VENTILASJON 25,00 % 1,000 STK 1,000 STK 500,00 500,00",
 "MVA MVA Grunnlag MVA-beløp",
 "25,00 % 2 000,00 500,00 Nettobeløp NOK 2 000,00",
 "MVA NOK 500,00",
 "Å betale NOK 2 500,00",
 "Husk å oppgi KID ved betaling"
].join("\n");
const complete=parseNorwegianSupplierInvoice(page1+"\n"+page2);
assert.equal(isLikelySupplierInvoice(page1+"\n"+page2),true);
assert.equal(complete.supplierName,"Fjordgrossist AS",
 "Use supplier's legal registered name, not customer's name/address on the same visual row");
assert.equal(complete.documentNumber,"880020011");
assert.equal(complete.documentDate,"2026-09-14",
 "Do not confuse the purchase date with delivery or payment date");
assert.equal(complete.dueDate,"2026-09-28",
 "Payment header values are printed as the next row of a four-column table");
assert.equal(complete.totalOre,250000);
assert.deepEqual(complete.groups,{25:{base:"2000,00",vat:"500,00"}},
 "Use VAT totals on the second page, never prices from individual order lines");
assert.deepEqual(complete.warnings,[]);
const secondOnly=parseNorwegianSupplierInvoice(
 "RETURADRESSE: FJORDGROSSIST AS 880020011\n"+
 "KUNDEFIRMA AS Fjordgrossist AS\n"+
 "Fakturanummer 880020011\nFakturadato 14.09.2026\n"+
 "Forfallsdato Bankkonto KID Å betale\n"+
 "28.09.2026 1506.81.12345 00000008800200111 2 500,00\n"+
 "MVA MVA Grunnlag MVA-beløp\n"+
 "25,00 % 2 000,00 500,00 Nettobeløp NOK 2 000,00\n"+
 "Å betale NOK 2 500,00");
assert.equal(secondOnly.supplierName,"FJORDGROSSIST AS",
 "Sender's return address is a safe fallback when company register label is missing");
assert.equal(secondOnly.dueDate,"2026-09-28");
const mixedAmounts=parseNorwegianSupplierInvoice(page1+"\n"+page2.replace(
 "Å betale NOK 2 500,00","Å betale NOK 2 600,00"));
assert.deepEqual(mixedAmounts.groups,{},
 "Disagreeing totals between header and final VAT summary must not fill VAT automatically");
const notDate=parseNorwegianSupplierInvoice(page1.replace(
 "28.09.2026 1506.81.12345","31.02.2026 1506.81.12345")+"\n"+page2);
assert.equal(notDate.dueDate,"","Reject impossible due dates, not a random other date");
console.log("Grossistfaktura 2 sider bestått: juridisk avsender, fakturanummer, fakturadato, forfallstabell, sum på side 2 og 25 % MVA.");
