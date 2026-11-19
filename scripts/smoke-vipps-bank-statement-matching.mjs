import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/vippsTripletexBankMatch.js").replace(/^export /gm,"");
const {BANK_MATCH_MAX_DAYS,bankMatchDateSpan,decimalToOre,
 normalizeBankStatementTransactions,vippsBankCandidates}=new Function(source+
 ";return {BANK_MATCH_MAX_DAYS,bankMatchDateSpan,decimalToOre,normalizeBankStatementTransactions,vippsBankCandidates};")();
assert.equal(BANK_MATCH_MAX_DAYS,31);
assert.equal(bankMatchDateSpan("2026-10-01","2026-10-31"),31);
assert.equal(bankMatchDateSpan("2026-10-01","2026-11-01"),null);
assert.equal(bankMatchDateSpan("2026-10-32","2026-11-01"),null);
assert.equal(decimalToOre(1.03),103);
assert.equal(decimalToOre(-0.06),-6);
assert.equal(decimalToOre(1.003),null);
const statements=[{id:92,accountId:192,fromDate:"2026-11-01",toDate:"2026-12-01"}];
const raw=[
 {id:5,bankStatement:{id:92},postedDate:"2026-11-20",amountCurrency:99,
  description:"Vipps oppgjør ASVP-1"},
 {id:6,bankStatement:{id:92},postedDate:"2026-11-20",amountCurrency:99,
  description:"Ordinær innbetaling"},
 {id:7,bankStatement:{id:92},postedDate:"2026-11-21",amountCurrency:-1.03,
  description:"Gebyr"}
];
const trans=normalizeBankStatementTransactions(statements,raw,192);
assert.equal(trans.length,3);
assert.equal(trans[2].amountOre,-103);
assert.throws(()=>normalizeBankStatementTransactions(statements,
 [{...raw[0],bankStatement:{id:91}}],192),/må kontrolleres/);
assert.throws(()=>normalizeBankStatementTransactions(
 [{...statements[0],accountId:150}],raw,192),/uklar bankkonto/);
assert.throws(()=>normalizeBankStatementTransactions(statements,[raw[0],raw[0]],192),/må kontrolleres/);
const payout={date:"2026-11-19",pspReference:"ASVP-1",amountOre:9900,
 transferStatus:"not_transferred"};
let matches=vippsBankCandidates([payout],trans,{from:"2026-11-01",to:"2026-11-19"});
assert.equal(matches[0].status,"ambiguous","equal amounts are never automatically confirmed");
matches=vippsBankCandidates([payout],[trans[0]],{from:"2026-11-01",to:"2026-11-19"});
assert.equal(matches[0].status,"possible_with_reference");
assert.equal(matches[0].candidate.id,5);
matches=vippsBankCandidates([payout],[trans[1]],{from:"2026-11-01",to:"2026-11-19"});
assert.equal(matches[0].status,"possible_amount_date");
matches=vippsBankCandidates([payout],[trans[2]],{from:"2026-11-01",to:"2026-11-19"});
assert.equal(matches[0].status,"not_found");
matches=vippsBankCandidates([payout,
 {...payout,pspReference:"ASVP-2"}],[trans[0]],{from:"2026-11-01",to:"2026-11-19"});
assert.equal(matches[0].status,"ambiguous","one bank credit cannot confirm multiple payouts");
assert.equal(matches[1].status,"ambiguous");
assert.throws(()=>vippsBankCandidates([payout,payout],[trans[0]],{
 from:"2026-11-01",to:"2026-11-19"}),/tvetydige/);
assert.throws(()=>vippsBankCandidates([payout],[trans[0],trans[0]],{
 from:"2026-11-01",to:"2026-11-19"}),/ufullstendige/);
const route=read("app/api/admin/tripletex/vipps-bank-match/route.js");
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes('mode==="accounts"'));
assert.ok(route.includes('tripletexRead("/bank/statement?accountId="'));
assert.ok(route.includes('"/bank/statement/transaction?bankStatementId="'));
assert.ok(route.includes("vippsBankCandidates"));
assert.ok(route.includes('unit","service"'));
assert.ok(!route.includes("export async function POST"));
assert.ok(!route.includes("tripletexCreateVippsSettlementVoucher"));
assert.ok(!route.includes(".insert(")&&!route.includes(".update(")&&!route.includes(".delete("));
const ui=read("app/admin/faktura/mva/tripletex/VippsBankMatchPanel.js");
assert.ok(ui.includes("Kontroller banktilgang i Tripletex"));
assert.ok(ui.includes("no_statement_coverage"));
assert.ok(ui.includes("Beløpstreff er ikke automatisk bekreftelse"));
assert.ok(!ui.includes("bankReceived:true"));
const parent=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(parent.includes("<VippsBankMatchPanel"));
console.log("Vipps bankmatch bestått: API-rettigheter, 31-dagersperiode, konto/øre, dublett, delt banktreff og ingen automatisk bokføring.");
