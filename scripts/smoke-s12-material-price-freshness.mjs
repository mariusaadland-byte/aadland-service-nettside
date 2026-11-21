import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/materialPriceFreshness.js","utf8");
const {supplierPriceFreshness,supplierPriceNotice}=await import("data:text/javascript,"+encodeURIComponent(source));
const now=Date.parse("2026-11-21T12:00:00Z");
const status=(id,lastImportAt,productCount)=>supplierPriceFreshness({id,lastImportAt,productCount},now);
const old=status("byggern","2026-10-08T21:27:37Z",8991);
assert.equal(old.priceStatus,"needs-review");
assert.equal(old.priceReviewRequired,true);
assert.ok(old.priceAgeDays>=43);
assert.match(supplierPriceNotice({...old,name:"Bygger’n",lastImportAt:"2026-10-08T21:27:37Z"}),/bekreft dagens innkjøpspris/);
assert.equal(status("ahlsell",null,0).priceStatus,"missing");
assert.equal(status("byggern","2026-11-20T10:00:00Z",10).priceStatus,"imported");
assert.equal(status("byggern","2026-11-01T12:00:00Z",0).priceStatus,"missing");
assert.equal(status("egne-varer",null,1).priceStatus,"manual");
assert.equal(status("byggern","not-a-date",1).priceStatus,"unknown");
const catalog=readFileSync("app/api/admin/material-catalog/route.js","utf8");
assert.match(catalog,/supplierPriceFreshness/);
assert.match(catalog,/freshnessBySupplier\.get\(row\.supplier_id\)/);
const suppliers=readFileSync("app/api/admin/material-suppliers/route.js","utf8");
assert.match(suppliers,/supplierPriceFreshness/);
for(const path of ["app/admin/tilbud/QuoteCatalogSearch.js","app/admin/kalkulator/CalculatorClient.js","app/admin/material-ai/MaterialAiClient.js","app/admin/tilbud/QuoteEditorClient.js"]){
 const text=readFileSync(path,"utf8");
 assert.match(text,/priceReviewRequired|supplierPriceNotice|priceStatus/);
}
console.log("S-12: importalder, manglende leverandørprislister og varsling kontrollert.");
