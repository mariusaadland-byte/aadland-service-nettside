import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const src=read("lib/externalInvoiceVatMath.js").replace(/^export /gm,"");
const {splitExternalInvoiceGrossByRate}=new Function(src+
 ";return {splitExternalInvoiceGrossByRate};")();
const actualInvoice=splitExternalInvoiceGrossByRate(1793755,25);
assert.deepEqual(actualInvoice,{
 baseOre:1435004,vatOre:358751,grossOre:1793755,vatRate:25
},"Real screenshot total 17 937,55 must produce 14 350,04 net and 3 587,51 VAT");
assert.deepEqual(splitExternalInvoiceGrossByRate(125000,25),{
 baseOre:100000,vatOre:25000,grossOre:125000,vatRate:25
});
for(const rate of [12,15,25]){
 const gross=125000;
 const split=splitExternalInvoiceGrossByRate(gross,rate);
 assert.equal(split.baseOre+split.vatOre,gross);
 assert.equal(split.vatOre,Math.round(split.baseOre*rate/100));
}
assert.equal(splitExternalInvoiceGrossByRate(125000,0),null);
assert.equal(splitExternalInvoiceGrossByRate(125000,""),null);
assert.equal(splitExternalInvoiceGrossByRate(125000,99),null);
assert.equal(splitExternalInvoiceGrossByRate(0,25),null);
assert.equal(splitExternalInvoiceGrossByRate(-1,25),null);
assert.equal(splitExternalInvoiceGrossByRate(NaN,25),null);
assert.equal(splitExternalInvoiceGrossByRate(1.234,25),null);
const panel=read("app/admin/faktura/eksterne/ExternalInvoiceTripletexPanel.js");
assert.ok(panel.includes("splitExternalInvoiceGrossByRate(total,rate)"));
assert.ok(panel.includes('if(kind==="rate")'));
assert.ok(panel.includes("calculateFromStoredTotal(value)"));
assert.ok(panel.includes("userChanged.current=true"));
assert.ok(panel.includes("setConfirmed(false)"));
assert.ok(panel.includes("!importAmountsMatch"));
assert.ok(panel.includes("Beregnet automatisk etter at du valgte "));
assert.ok(panel.includes('className="externalTripletexPanel"'));
assert.ok(panel.includes('className="externalTripletexPrimaryButton"'));
assert.ok(panel.includes("Beregnet inkl. MVA stemmer IKKE"));
for(const phrase of [
 "Beløp inkl. MVA (kr) – beregnet",
 "Fakturasum inkl. MVA på originalen (kr)",
 "Eksakt beløp eks. MVA (kr)"
])assert.ok(panel.includes(phrase));
const layout=read("app/admin/layout.js");
assert.ok(layout.includes('import "./adminContrast.css"'));
assert.ok(layout.includes('export const viewport={colorScheme:"light"'));
assert.ok(layout.includes('className="adminContrastRoot"'));
const root=read("app/layout.js");
assert.ok(root.includes('colorScheme:"dark"'),"Public storefront retains dark theme metadata");
const css=read("app/admin/adminContrast.css");
assert.ok(css.includes(".adminContrastRoot main.admin"));
assert.ok(css.includes("main.admin:not(:has(> aside.side))"),
 "Standalone one-column fix must not override admin dashboard sidebar grid");
assert.ok(css.includes("main.admin:has(> aside.side)"),
 "The real admin dashboard must retain its own grid structure");
assert.ok(css.includes("grid-template-columns:248px minmax(0,1fr)!important"),
 "Desktop admin sidebar must remain alongside the dashboard");
assert.ok(css.includes("display:block;\n  grid-template-columns:none!important"),
 "Mobile admin nav still uses its own drawer layout");
assert.ok(!/\.adminContrastRoot main\.admin\s*\{\s*grid-template-columns\s*:\s*minmax\(0,1fr\)!important/.test(css),
 "Never force the entire admin dashboard into a one-column grid");
const adminClient=read("app/admin/AdminClient.js");
assert.ok(adminClient.includes('<aside className={"side "+navStyles.sideContainer}>'));
assert.ok(adminClient.includes('<section className="adminmain">'));
assert.ok(adminClient.includes('className="stats adminOverviewStats"'));
assert.ok(css.includes("grid-template-columns:minmax(0,1fr)!important"));
assert.ok(css.includes("color-scheme:light"));
assert.ok(css.includes("::-webkit")===false||css.includes("-webkit-text-fill-color"));
assert.ok(css.includes("background-color:var(--admin-field,#fff)!important"));
assert.ok(css.includes("background-color:var(--admin-readonly,#edf3fa)!important"));
assert.ok(css.includes("button:disabled"));
assert.ok(css.includes("opacity:1!important"));
assert.ok(css.includes(".externalTripletexPrimaryButton:not(:disabled)"));
assert.ok(css.includes("#fff!important"));
assert.ok(css.includes("@media(max-width:650px)"));
assert.ok(!css.includes(".homeHero"));
const component=read("app/admin/faktura/eksterne/ExternalInvoiceRegisterClient.js");
assert.ok(component.includes('<main className="admin"'));
console.log("Felles adminkontrast og MVA-beregning bestått: 17 937,55 kr → 14 350,04 kr ekskl. + 3 587,51 kr MVA. PC, mobil, lys adminmodus, tydelige inndata, uendret offentlig side og sperre ved avvik.");
