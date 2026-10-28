import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/vatReceiptGrossCalculator.js").replace(/^export /gm,"");
const {parseVatGrossInput,vatSplitFromGross,singleReceiptVatRate,completeVatReceiptAmounts}=
 new Function(source+";return {parseVatGrossInput,vatSplitFromGross,singleReceiptVatRate,completeVatReceiptAmounts};")();
assert.equal(parseVatGrossInput("1 051,65"),105165);
assert.equal(parseVatGrossInput("1051.65"),105165);
assert.equal(parseVatGrossInput("1.051,65"),105165);
assert.equal(parseVatGrossInput("1,051.65"),105165);
assert.equal(parseVatGrossInput("100"),10000);
for(const x of ["","1.2.3","1e3","-200","999.123"])assert.equal(parseVatGrossInput(x),null);
assert.deepEqual(vatSplitFromGross(105165,25),{base:"841,32",vat:"210,33"});
assert.deepEqual(vatSplitFromGross(11200,12),{base:"100,00",vat:"12,00"});
assert.deepEqual(vatSplitFromGross(11500,15),{base:"100,00",vat:"15,00"});
assert.deepEqual(vatSplitFromGross(10000,0),{base:"100,00",vat:"0,00"});
assert.equal(vatSplitFromGross(105165,null),null,"Unknown MVA rate must never default to 0");
assert.equal(vatSplitFromGross(105165,""),null);
assert.equal(vatSplitFromGross(105165,23),null);
assert.equal(vatSplitFromGross(0,25),null);
assert.equal(singleReceiptVatRate("Jula\nTOTAL NOK 1051.65\nMva % Eks Mva Mva Salg\n25,00 uleselig\nDato 19.10.2026"),25);
assert.equal(singleReceiptVatRate("Butikk\nTOTAL NOK 125,00\nMVA 25 %\nDato 19.10.2026"),25);
assert.equal(singleReceiptVatRate("Butikk\nTOTAL NOK 125,00\n25 % MVA\nDato 19.10.2026"),25);
assert.equal(singleReceiptVatRate("Butikk\nTOTAL NOK 125,00\nMVA 25 %\nMVA 15 %"),null);
assert.equal(singleReceiptVatRate("Butikk\nTOTAL NOK 125,00\n25 % rabatt\nDato 19.10.2026"),null);
assert.equal(singleReceiptVatRate("Butikk\nTOTAL NOK 125,00\nVare 25,00 kr\nDato 19.10.2026"),null);
const base={supplierName:"JULA",documentDate:"2026-10-19",totalOre:105165,groups:{},
 warnings:["Kunne ikke lese sikkert grunnlag og MVA-sats. Fyll inn beløpene fra kvitteringen."]};
const result=completeVatReceiptAmounts(base,"Jula\nTOTAL NOK 1051,65\nMva % Eks Mva Mva Salg\n25,00 [uleselig]");
assert.deepEqual(result.groups[25],{base:"841,32",vat:"210,33"});
assert.match(result.warnings.join(" "),/beregnet fra gjenkjent totalsum/i);
assert.equal(result.warnings.some(w=>/Kunne ikke lese sikkert grunnlag/.test(w)),false);
assert.deepEqual(completeVatReceiptAmounts(base,"Jula\nTOTAL 1051,65\n25 % rabatt").groups,{},
 "No inferred tax when the OCR rate is unknown");
assert.deepEqual(completeVatReceiptAmounts({...base,totalOre:null},"MVA 25 %").groups,{},
 "No inferred tax if gross is unknown");
assert.deepEqual(completeVatReceiptAmounts({...base,warnings:["To ulike totalbeløp ble lest."]},"MVA 25 %").groups,{},
 "Do not fill rejected conflicting OCR values");
assert.deepEqual(completeVatReceiptAmounts({...base,groups:{25:{base:"841,32",vat:"210,33"}}},"MVA 25 %").groups[25],
 {base:"841,32",vat:"210,33"},"Never replace already read tax amounts");

const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");
assert.ok(scanner.includes("completeVatReceiptAmounts(recognized.parsed||parseNorwegianReceipt(recognized.text),recognized.text)"));
assert.ok(form.includes("const [grossInput,setGrossInput]=useState"));
assert.ok(form.includes("if(!grossManuallyEdited.current)"));
assert.ok(form.includes("const autoFill=Boolean(vatRateChoice)&&(grossCalculated.current||!anyAmounts)"),
 "If rate is chosen first, gross amount must automatically fill the net and VAT");
assert.ok(form.includes("const pair=autoFill?vatSplitFromGross(parseVatGrossInput(raw),vatRateChoice):null"),
 "Once enabled, recompute values as user changes the gross sum");
assert.ok(form.includes('if(key==="vat")manualVatRates.current.add(rate)'),
 "Manual tax corrections must be protected");
assert.ok(form.includes('manualVatRates.current.has(rate)'),
 "Typing a net amount must not overwrite an explicitly corrected tax amount");
assert.ok(form.includes('moneyInput(Math.round(baseOre*rate/100))'),
 "Entering net amount must immediately compute tax at the selected rate");
assert.ok(form.includes('setVatRateChoice(rate);rateManuallyChosen.current=true'));
assert.ok(form.includes('if(rate)calculateFromGross(rate,true)'),
 "Choosing rate calculates immediately when amounts are empty");
assert.ok(form.includes('Beregn eks. MVA og MVA'));
assert.ok(form.includes('editedGrossMismatch||(ocrGrossMismatch&&!ocrMismatchChecked)'),
 "Prevent submitting stale amounts after gross total was corrected");
assert.ok(form.includes('setForm(x=>({...x,groups:{...blank(),[rate]:pair}'),
 "Gross amount must fill both net and VAT amounts");
assert.ok(form.includes("documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false"));
assert.ok(css.includes(".grossCalculator")&&css.includes(".grossCalcButton"));
console.log("MVA fra totalsum bestått: Jula 1051,65 = 841,32 + 210,33; 0/12/15/25; ingen ukjent sats eller motstridende OCR; totalsumfelt og mobilvisning.");
