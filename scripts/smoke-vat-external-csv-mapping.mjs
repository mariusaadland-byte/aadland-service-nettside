import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const coreRaw=readFileSync("lib/vatPurchaseCsvImport.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {VAT_CSV_COLUMNS,parseVatImportCsv,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS}=new Function(
 "validateVatPurchaseInput",coreRaw+";return {VAT_CSV_COLUMNS,parseVatImportCsv,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS};")(()=>{});
const raw=readFileSync("lib/vatExternalCsvMapping.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {parseExternalVatCsv,initialVatColumnMapping,mapExternalVatRows,VAT_CSV_IMPORT_REQUIRED}=
 new Function("VAT_CSV_COLUMNS","MAX_VAT_CSV_BYTES","MAX_VAT_IMPORT_ROWS","parseVatImportCsv",
 raw+";return {parseExternalVatCsv,initialVatColumnMapping,mapExternalVatRows,VAT_CSV_IMPORT_REQUIRED};")(
 VAT_CSV_COLUMNS,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS,parseVatImportCsv
);
const headers=[
 "Bilagstype","Firma","Leverandørfaktura","Dato","Opprinnelig nummer",
 "Eks 25","MVA 25","Fradragsandel","Bilagsnummer","Varekjøp"
];
const cells=[["faktura","Megaflis","INV-22","25.10.2026","","1000,00","250,00",
 "100","Systemia bilag 123","Materialer til kunde"],
 ["kreditnota",'Byggern, "AS"',"KN-1","2026-10-25","INV-17",
 "400,00","100,00","50","Regnskap bilag 124","Retur av materialer"]];
const esc=x=>'"'+String(x).replace(/"/g,'""')+'"';
const csv=(del,head,data)=>[head,...data].map(row=>row.map(esc).join(del)).join("\r\n")+"\r\n";
const source=parseExternalVatCsv("\uFEFF"+csv(";",headers,cells));
assert.equal(source.separator,";");
assert.deepEqual(source.headers,headers);
assert.equal(source.rows.length,2);
assert.equal(source.rows[1][1],'Byggern, "AS"');
const mapping=Object.fromEntries(VAT_CSV_COLUMNS.map(field=>[field,""]));
Object.assign(mapping,{
 type:"Bilagstype",leverandor:"Firma",fakturanummer:"Leverandørfaktura",
 dokumentdato:"Dato",opprinnelig_faktura:"Opprinnelig nummer",
 grunnlag_25:"Eks 25",mva_25:"MVA 25",
 fradragsprosent:"Fradragsandel",bilagsreferanse:"Bilagsnummer",formal:"Varekjøp"
});
assert.equal(VAT_CSV_IMPORT_REQUIRED.length,7);
const rows=mapExternalVatRows(source,mapping);
assert.equal(rows.length,2);
assert.equal(rows[0].supplierName,"Megaflis");
assert.equal(rows[0].documentDate,"2026-10-25");
assert.equal(rows[0].groups[25].base,"1000,00");
assert.equal(rows[0].deductionPercent,"100");
assert.equal(rows[0].documentConfirmed,false);
assert.equal(rows[1].supplierName,'Byggern, "AS"');
assert.equal(rows[1].kind,"credit");
assert.equal(rows[1].originalDocumentNumber,"INV-17");
assert.equal(rows[1].deductionConfirmed,false);
assert.equal(rows[1].bankConditionConfirmed,false);
assert.ok(!("accessToken" in rows[0]));

const comma=parseExternalVatCsv(csv(",",headers,cells));
assert.equal(comma.separator,",");
assert.equal(mapExternalVatRows(comma,mapping)[0].groups[25].base,"1000,00");
const tabs=parseExternalVatCsv(csv("\t",headers,cells));
assert.equal(tabs.separator,"\t");
assert.equal(mapExternalVatRows(tabs,mapping)[1].kind,"credit");
const direct=parseExternalVatCsv(csv(";",VAT_CSV_COLUMNS,[
 ["faktura","Megaflis","INV-45","2026-10-25","",
 "100,00","25,00","","","","","","","100","Bilag 45","Materialer til kunde"]
]));
assert.equal(initialVatColumnMapping(direct.headers).grunnlag_25,"grunnlag_25");
assert.equal(initialVatColumnMapping(headers).mva_25,"");
assert.equal(mapExternalVatRows(direct,initialVatColumnMapping(direct.headers))[0].documentNumber,"INV-45");

assert.throws(()=>mapExternalVatRows(source,{...mapping,leverandor:""}),/leverandor/);
assert.throws(()=>mapExternalVatRows(source,{...mapping,mva_25:""}),/Koble minst ett par|Grunnlag og MVA/);
assert.throws(()=>mapExternalVatRows(source,{...mapping,mva_25:"Eks 25"}),/Samme eksportkolonne/);
assert.throws(()=>mapExternalVatRows(source,{...mapping,mva_25:"Not real"}),/finnes ikke/);
assert.throws(()=>mapExternalVatRows(source,{...mapping,unsupported:"X"}),/Ukjent målkolonne/);
assert.throws(()=>parseExternalVatCsv("K;K\nA;B"),/samme overskrift/);
assert.throws(()=>parseExternalVatCsv("K;Other\nA"),/kolonner/);
assert.throws(()=>parseExternalVatCsv("K;Other\n\"unterminated;word"),/CSV-tabell|anførselstegn/);
assert.throws(()=>parseExternalVatCsv("K;Other\nA;B\n".repeat(50000)),/256 KB/);
assert.throws(()=>parseExternalVatCsv(csv(";",headers,Array(51).fill(cells[0]))),/50/);
assert.throws(()=>parseExternalVatCsv("just a line"),/CSV-tabell/);

const ui=readFileSync("app/admin/faktura/mva/VatExternalCsvMapper.js","utf8");
const parent=readFileSync("app/admin/faktura/mva/VatPurchaseCsvImport.js","utf8");
const preview=readFileSync("app/api/admin/invoices/vat-import/route.js","utf8");
assert.ok(parent.includes("parseExternalVatCsv(content)"));
assert.ok(parent.includes("<VatExternalCsvMapper"));
assert.ok(parent.includes('setExternalSource(null)'));
assert.ok(parent.includes("const result=await checkRows(rows)"));
assert.ok(ui.includes("mapExternalVatRows(source,mapping)"));
assert.ok(ui.includes("Vi gjetter ikke MVA-sats"));
assert.ok(preview.includes("sameOriginGuard(req)"));
assert.ok(!preview.includes(".insert(")&&!preview.includes(".update("));
console.log("Regnskaps-CSV med feltmapping bestått: 3 skilletegn, norske beløp, kreditnota, obligatoriske felt, dublettsikker forhåndsvisning.");
