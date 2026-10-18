import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/calculatorQuoteLines.js","utf8");
const {quoteLinesFromCalculator,unitSaleExVat,CATALOG_QUOTE_TRANSFER_KEY}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
assert.equal(CATALOG_QUOTE_TRANSFER_KEY,"aadlandQuoteMaterialsTransferV1");
const form={
 project:"Test kunde",materialMarkup:"20",
 materialItems:[
  {name:"TERRASSEBORD",sku:"123",unit:"LM",costExVat:100,qty:"4",saleExVat:""},
  {name:"GIPSPLATE",sku:"456",unit:"STK",costExVat:140,qty:"3",saleExVat:"200"}
 ],
 hours:"8",hourlyRate:"500",distanceOneWay:"10",oneWayTrips:"2",kmRate:"5.30",
 tollPreset:"custom",customToll:"50",materialCost:"125"
};
const goods=quoteLinesFromCalculator(form);
assert.equal(goods.length,2,"No unwanted default work/travel lines");
assert.deepEqual(goods.map(x=>x.quantity),[4,3]);
assert.deepEqual(goods.map(x=>x.unitPriceOre),[12000,20000]);
assert.equal(goods[0].vatRate,25);
assert.equal(goods[0].unit,"LM");
assert.match(goods[0].description,/Varenr\. 123/);
assert.equal(unitSaleExVat({costExVat:100,saleExVat:""},20),120);
assert.equal(unitSaleExVat({costExVat:100,saleExVat:"130"},20),130);
const extras=quoteLinesFromCalculator(form,{includeExtras:true});
assert.equal(extras.length,6);
assert.ok(extras.some(x=>x.type==="work"&&x.quantity===8&&x.unitPriceOre===40000),"work inc-to-ex-VAT");
assert.ok(extras.some(x=>x.description==="Andre materialer"&&x.unitPriceOre===12000),"other material markup");
assert.ok(extras.some(x=>x.description.includes("20 km")&&x.unitPriceOre===8480),"travel VAT conversion");
assert.ok(extras.some(x=>x.description.includes("Bompasseringer")&&x.unitPriceOre===8000),"tolls VAT conversion");
const custom=quoteLinesFromCalculator({materialItems:[{name:"Egen vare",unit:"stk",costExVat:"19,90",qty:"2",saleExVat:""}],materialMarkup:"20"});
assert.equal(custom[0].unitPriceOre,2388,"Norwegian comma decimals");
assert.equal(quoteLinesFromCalculator({materialItems:[{name:"",qty:"1"},{name:"Navn",qty:"0"}]}).length,0);
assert.equal(quoteLinesFromCalculator({materialItems:[]}).length,0);
console.log("Tilbudsoverføring bestått: søkte varer, mengder, 20 % påslag, manuelle priser og valgfritt arbeid/reise.");

const quoteEditorSource=readFileSync("app/admin/tilbud/QuoteEditorClient.js","utf8");
const quoteCatalogSource=readFileSync("app/admin/tilbud/QuoteCatalogSearch.js","utf8");
assert.ok(quoteCatalogSource.includes("useState(initialMarkup)"),"Material markup must restore the saved preference");
assert.ok(quoteCatalogSource.includes("localStorage.setItem(MARKUP_STORAGE_KEY,markup)"),"Material markup preference must persist");
assert.ok(quoteCatalogSource.includes("defaultMarkupPercent??15"),"Quote search must load the shared supplier markup");
assert.ok(quoteCatalogSource.includes("async function saveMarkup()"),"Quote search must allow saving supplier markup");
const materialCatalogRoute=readFileSync("app/api/admin/material-catalog/route.js","utf8");
assert.ok(materialCatalogRoute.includes("export async function PATCH(req)"),"Supplier markup must have a save endpoint");
assert.ok(materialCatalogRoute.includes("user.role!==\"owner\""),"Only owner may update shared markup");
assert.ok(quoteEditorSource.includes("Array.isArray(data.drawings)?data.drawings:[]"),"quote editor must validate drawing list");
assert.ok(quoteEditorSource.includes("typeof row.name===\"string\"?row.name:\"Tegning\""),"quote editor must sanitize drawing labels");
