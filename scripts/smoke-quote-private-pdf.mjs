import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import sharp from "sharp";
import path from "node:path";

const costSource=readFileSync("lib/quotePrivateCosts.js","utf8");
const {costMapFromLines,withPrivateCosts,calculateContribution}=await import("data:text/javascript;base64,"+Buffer.from(costSource).toString("base64"));
const priced=[{id:"a",type:"material",description:"Bord",quantity:2,unitPriceOre:12500,internalUnitCostOre:10000},{id:"b",type:"work",description:"Arbeid",quantity:3,unitPriceOre:40000,internalUnitCostOre:""}];
const mapped=costMapFromLines(priced);
assert.deepEqual(mapped,{a:10000},"Only known internal costs should be stored");
const recovered=withPrivateCosts([{id:"a",description:"Bord"},{id:"b",description:"Arbeid"}],mapped);
assert.equal(recovered[0].internalUnitCostOre,10000);
assert.equal(recovered[1].internalUnitCostOre,"");
const margin=calculateContribution(priced);
assert.equal(margin.coveredSaleOre,25000);
assert.equal(margin.costOre,20000);
assert.equal(margin.contributionOre,5000);
assert.equal(margin.contributionPercent,20);
assert.equal(margin.missing,1);
assert.equal(margin.complete,false);
assert.equal(calculateContribution([{id:"z",description:"Gratis",quantity:1,unitPriceOre:0,internalUnitCostOre:0}]).complete,true);
assert.equal(costMapFromLines([{id:"bad",internalUnitCostOre:-50}]).bad,undefined,"Negative costs must be discarded");

const pageCode=readFileSync("lib/drawingPdfPages.js","utf8").replace('import "server-only";',"");
const pageUrl="data:text/javascript;base64,"+Buffer.from(pageCode).toString("base64");
globalThis.__quoteSmokeSharp=sharp;globalThis.__quoteSmokePath=path;
const pdfCode=readFileSync("lib/quotePdf.js","utf8")
 .replace('import sharp from "sharp";','const sharp=globalThis.__quoteSmokeSharp;')
 .replace('import path from "path";','const path=globalThis.__quoteSmokePath;')
 .replace('from "./drawingPdfPages";','from "'+pageUrl+'";');
const {buildQuotePdf,quotePdfFilename}=await import("data:text/javascript;base64,"+Buffer.from(pdfCode).toString("base64"));
const secret="KUN_INTERNT_DYRT_93762184018";
const quote={
 id:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",quote_number:"TILB-2026-9999",title:"Tilbud tak og terrasse",
 customer:{name:"Testkunde",email:"test@example.org",address:"Eksempelveien 1"},
 line_items:[
  {id:"a",type:"material",description:"Terrassebord i trykkimpregnert tre",quantity:2,unit:"stk",unitPriceOre:12500,vatRate:25,internalUnitCostOre:830044123,internalNote:secret}
 ],
 internalCosts:{a:830044123},internalNote:secret,
 subtotal_ex_vat_ore:25000,vat_ore:6250,total_inc_vat_ore:31250,
 payment_plan:[{id:"deposit",label:"Forskudd",percent:25,trigger:"Ved aksept"},{id:"completion",label:"Sluttoppgjoer",percent:75,trigger:"Ved ferdigstillelse"}],
 created_at:"2026-10-09T00:00:00Z",valid_until:"2026-11-08",planned_start_date:"2026-10-21",intro_text:"Tilbud på montering.",notes:"",terms:"Arbeidet leveres etter avtale."
};
const pdf=await buildQuotePdf(quote,[]);
const data=pdf.toString("latin1");
assert.equal(pdf.subarray(0,8).toString("ascii"),"%PDF-1.4");
assert.ok(data.includes("%%EOF"),"PDF must end correctly");
assert.ok(data.includes("TILB-2026-9999"),"Quote number missing");
assert.ok(data.includes("TOTALT INKL. MVA"),"Customer total is missing");
assert.ok(data.includes("312,50 kr"),"Customer sales total is wrong");
assert.ok(data.includes("62,50 kr"),"VAT must be shown");
assert.ok(!data.includes(secret),"Private cost note leaked to customer PDF");
assert.ok(!data.includes("830044123"),"Private cost in øre leaked to customer PDF");
assert.equal(quotePdfFilename(quote),"Tilbud-TILB-2026-9999.pdf");
assert.ok((data.match(/\/Type \/Page \/Parent/g)||[]).length>=1,"PDF should have at least one page");

const longQuote={...quote,line_items:Array.from({length:36},(_,i)=>({
 id:"item-"+i,type:"material",description:"Terrassebord og materialer for del "+(i+1)+" med lengre beskrivelse for enhet og montering",
 quantity:2,unit:"stk",unitPriceOre:12500,vatRate:25
})),subtotal_ex_vat_ore:900000,vat_ore:225000,total_inc_vat_ore:1125000};
const longPdf=await buildQuotePdf(longQuote,[]);
assert.ok((longPdf.toString("latin1").match(/\/Type \/Page \/Parent/g)||[]).length>1,"Long quote must page-break");
assert.ok(longPdf.toString("latin1").includes("%%EOF"));
console.log("Intern kalkyle og kundens PDF bestått: priser, 25 % MVA, paginering, filnavn, skjulte kostnader.");
