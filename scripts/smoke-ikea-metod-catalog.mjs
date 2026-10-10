import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("lib/ikeaMetodCatalog.js","utf8");
const url="data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const {IKEA_METOD_MODULES, IKEA_METOD_SOURCES, validateIkeaMetodCatalog}=await import(url);
assert.equal(validateIkeaMetodCatalog(),true,"METOD catalog must validate");
assert.equal(new Set(IKEA_METOD_MODULES.map(item=>item.id)).size,IKEA_METOD_MODULES.length,"module ids must be unique");
const find=id=>IKEA_METOD_MODULES.find(item=>item.id===id);
assert.deepEqual([find("metod-base-600").width,find("metod-base-600").depth,find("metod-base-600").height],[600,600,800]);
assert.deepEqual([find("metod-wall-600-800").width,find("metod-wall-600-800").depth,find("metod-wall-600-800").height],[600,370,800]);
assert.deepEqual([find("metod-corner-88").width,find("metod-corner-88").depth],[875,875]);
assert.deepEqual([find("metod-corner-128").width,find("metod-corner-128").depth],[1275,675]);
assert.ok(IKEA_METOD_MODULES.some(item=>item.type==="tallcab"&&item.height===2200));
assert.ok(IKEA_METOD_MODULES.every(item=>item.source&&item.source.startsWith("https://www.ikea.com/")));
assert.ok(IKEA_METOD_SOURCES.corner88.includes("40596748"));
assert.ok(IKEA_METOD_SOURCES.corner128.includes("40596753"));
console.log(`IKEA METOD-katalog bestått: ${IKEA_METOD_MODULES.length} moduler, unike ID-er, benke-/veggskap, høyskap og begge hjørnevarianter.`);
