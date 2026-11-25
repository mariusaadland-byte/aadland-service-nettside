import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// No Supabase access, customer quote mutations, emails or real billing.
const read=path=>readFileSync(path,"utf8");
const helperText=read("lib/calculatorQuoteLines.js");
const {
 CALCULATOR_TOLL_PRESETS,calculatorTollEstimate,quoteLinesFromCalculator
}=await import("data:text/javascript;base64,"+Buffer.from(helperText).toString("base64"));

const calc=read("app/admin/kalkulator/CalculatorClient.js");
const workClock=read("app/admin/arbeidsklokke/WorkClockClient.js");
const priceRoute=read("app/api/admin/quote-preferences/route.js");
const preview=read("app/admin/kalkulator/QuoteTransferPanel.js");

assert.ok(calc.includes('hourlyRate:"500"'));
assert.ok(workClock.includes('const DEFAULT_RATE=""'));
assert.ok(workClock.includes("Timepris inkl. mva"));
assert.ok(calc.includes('kmRate:"5.30"'));
assert.ok(workClock.includes('const DEFAULT_KM_RATE=""'));
assert.ok(priceRoute.includes("default_material_markup??15"));
assert.ok(calc.includes('materialMarkup:"15"'));
assert.ok(calc.includes('tollPreset:"none"'));
assert.ok(calc.includes('customToll:""'));
assert.ok(calc.includes("...DEFAULTS,...saved"),"Existing saved calculator inputs must survive the upgrade");
assert.ok(calc.includes("staleAutoToll")&&calc.includes('tollPreset:staleAutoToll?"none":saved.tollPreset??DEFAULTS.tollPreset'),"Untouched legacy default toll with empty distance must not survive");
assert.ok(calc.includes('saved.tollSelectionExplicit!==true'),"Explicitly selected old toll routes must survive");
assert.ok(calc.includes('tollSelectionExplicit:true'),"Every future toll selection is marked intentional");
assert.ok(calc.includes("setLegacyTollCleared(true)")&&calc.includes("Tidligere ble bom lagt til automatisk"),"Legacy migration must tell the owner about the correction");
assert.ok(calc.includes("calculatorTollEstimate(form)"),"UI summary uses same toll calculation as quote transfer");
assert.ok(helperText.includes("calculatorTollEstimate(form)"),"Transferred quote uses identical toll logic");
assert.ok(!calc.includes("const TOLL_PRESETS=["),"No separate UI hardcoded toll tariff list");
assert.ok(!helperText.includes("const tolls={"),"No separate transfer hardcoded toll tariff list");
assert.ok(preview.includes("quoteLinesFromCalculator(form,{includeExtras})"));
assert.ok(preview.includes("Kunde")&&preview.toLowerCase().includes("ingenting sendes"),"Transfer opens a draft without sending a customer message");
assert.equal(CALCULATOR_TOLL_PRESETS[0].id,"none");
assert.deepEqual(CALCULATOR_TOLL_PRESETS.map(x=>x.id),[
 "none","bergen-bjornafjorden-ordinary","bergen-bjornafjorden-rush",
 "bergen-bjornafjorden-ev","e39-ordinary","e39-ev",
 "bergen-ordinary","bergen-ordinary-rush","bergen-ev","custom"
]);
const prices=Object.fromEntries(CALCULATOR_TOLL_PRESETS.map(x=>[x.id,x.amount]));
assert.equal(prices["bergen-ordinary"],25.60);
assert.equal(prices["bergen-ordinary-rush"],51.20);
assert.equal(prices["bergen-ev"],17.60);
assert.equal(prices["e39-ordinary"],51.20);
assert.equal(prices["e39-ev"],35.84);
assert.equal(prices["bergen-bjornafjorden-ordinary"],76.80);
assert.equal(prices["bergen-bjornafjorden-rush"],102.40);
assert.equal(prices["bergen-bjornafjorden-ev"],53.44);

const defaults={
 hours:"8",hourlyRate:"500",fixedLabor:"",materialCost:"",
 materialItems:[],materialMarkup:"15",distanceOneWay:"",oneWayTrips:"2",
 kmRate:"5.30",tollPreset:"none",customToll:""
};
assert.equal(calculatorTollEstimate(defaults).toll,0,"No phantom 153.60 NOK toll on empty calculator");
const defaultQuote=quoteLinesFromCalculator(defaults,{includeExtras:true});
assert.equal(defaultQuote.length,1);
assert.equal(defaultQuote[0].unitPriceOre,40000,"500 incl VAT becomes 400 ex VAT");
assert.equal(defaultQuote[0].quantity,8);
const sumIncl=(lines)=>lines.reduce((total,line)=>{
 const ex=Math.round(line.quantity*line.unitPriceOre);
 return total+ex+Math.round(ex*line.vatRate/100);
},0);
assert.equal(sumIncl(defaultQuote),400000,"Default work price remains 4000 NOK incl VAT");
const noTolls=quoteLinesFromCalculator(defaults,{includeExtras:false});
assert.equal(noTolls.length,0,"Extras remain opt-in");

const withToll={...defaults,tollPreset:"bergen-bjornafjorden-ordinary"};
assert.equal(calculatorTollEstimate(withToll).toll,153.60,"Legacy saved route selected with no km remains unchanged");
const oldQuote=quoteLinesFromCalculator(withToll,{includeExtras:true});
assert.ok(oldQuote.some(x=>x.description.startsWith("Bompasseringer")),"Explicit preset must match UI even if km has not been entered");
assert.equal(sumIncl(oldQuote),415360,"Quote now includes the same explicit toll as calculator");

const route={...defaults,hours:"0",tollPreset:"e39-ev",distanceOneWay:"10",oneWayTrips:"2"};
assert.equal(calculatorTollEstimate(route).toll,71.68);
const invoiceLines=quoteLinesFromCalculator(route,{includeExtras:true});
const km=invoiceLines.find(x=>x.description.startsWith("Kjøring"));
const toll=invoiceLines.find(x=>x.description.startsWith("Bompasseringer"));
assert.equal(km.unitPriceOre,8480,"20 km x 5.30 NOK incl VAT");
assert.equal(toll.unitPriceOre,Math.round(71.68/1.25*100));
assert.equal(sumIncl(invoiceLines),Math.round((106+71.68)*100),"Route quote matches calculator incl VAT at cent level");

const custom={...defaults,hours:"0",tollPreset:"custom",customToll:"25,50",oneWayTrips:"4"};
assert.equal(calculatorTollEstimate(custom).toll,102);
assert.equal(sumIncl(quoteLinesFromCalculator(custom,{includeExtras:true})),10200);
assert.equal(calculatorTollEstimate({...defaults,tollPreset:"unknown"}).toll,0,"Invalid preset must never fall back to paid toll");
assert.equal(calculatorTollEstimate({...defaults,tollPreset:"none",oneWayTrips:"8"}).toll,0);
assert.equal(calculatorTollEstimate({...defaults,tollPreset:"custom",customToll:"0"}).toll,0);
assert.ok(calc.includes("Bergen innkrever i én retning, E39 i begge"));
assert.ok(calc.includes("5,30 kr/km er statens kilometergodtgjørelse, ikke en pålagt kundepris"));
console.log("S-18 bestått: ingen bom som standard, bevarte tidligere valg, én kilde for takster, samsvar med overførte tilbud, 500 kr inkl. mva og 5,30/km uendret.");
