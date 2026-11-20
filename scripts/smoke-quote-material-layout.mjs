import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const css=read("app/admin/tilbud/quoteEditorResponsive.css");
const editor=read("app/admin/tilbud/QuoteEditorClient.js");
const layout=read("app/admin/layout.js");
assert.ok(layout.includes('import "./tilbud/quoteEditorResponsive.css"'),
 "Layout fix must load through the admin layout");
assert.ok(editor.includes('className="admin quoteEditorPage"'));
assert.ok(editor.includes('className="quoteLineMarkupActions"'),
 "Markup action must be a full-width grid row, not a 84px column");
assert.ok(editor.includes('className="quoteProfitWarning quoteLineProfitWarning"'));
assert.ok(editor.includes('className="quoteSupplierSearch"'));
assert.ok(css.includes("grid-template-columns:34px repeat(4,minmax(0,1fr)) 34px"),
 "Replace previous nine-column grid with a compact responsive layout");
for(const [cls,column] of [
 ["quoteLineDescription","2/6"],["quoteLineType","2"],
 ["quoteLineQuantity","3"],["quoteLineUnit","4"],
 ["quoteLinePrice","5/7"],["quoteLineInternalCost","2/4"],
 ["quoteLineVat","4"],["quoteLineTotal","5/7"]
]){
 const from=css.indexOf(".quoteEditorPage .quoteLineEditor ."+cls+"{");
 assert.ok(from>=0,"Missing explicit desktop position "+cls);
 const declaration=css.slice(from,css.indexOf("}",from)+1);
 assert.ok(declaration.includes("grid-column:"+column+";"),
  "Incorrect desktop column for "+cls);
}
for(const cls of ["quoteLineMarkupActions","quoteLineProfitWarning","quoteSupplierSearch"]){
 assert.ok(css.includes(" .quoteEditorPage .quoteLineEditor ."+cls)||
   css.includes(".quoteEditorPage .quoteLineEditor ."+cls),
  "Missing safe full-width position "+cls);
}
assert.ok(css.includes("grid-column:2/-1;"),"Material actions cannot be narrow columns");
assert.ok(css.includes("grid-row:auto;"),"Optional rows must not overlap");
assert.ok(css.includes("@media(max-width:760px)"),"Must support mobile and zoomed browser");
assert.ok(css.includes("grid-template-columns:repeat(2,minmax(0,1fr))"),
 "Narrow screens need two columns");
assert.ok(css.includes("grid-column:1/-1;"),"Mobile material controls need full width");
assert.ok(css.includes(".quoteSupplierResult > button"),
 "Search action buttons need their own rows");
assert.ok(css.includes("width:100%;"),"Fields must fit inside columns");
assert.ok(css.includes("min-width:0;"),"Grid items must not force horizontal overflow");
assert.ok(css.includes("@media print"),"Keep private material controls out of print views");
assert.ok(!css.includes(".adminContrastRoot main.admin{"),
 "Do not accidentally break the admin dashboard grid");
const global=read("app/globals.css");
assert.ok(global.includes(".quoteLineEditor{display:grid;grid-template-columns:34px minmax(220px"),
 "Regression test must continue covering the old nine-column source");
console.log("Tilbudslayout: materiallinje, inputfelter, påslagsknapp, leverandørsøk og smale skjermer har egne rader uten overlapp – bestått.");
