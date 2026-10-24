import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const vat=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const {vatTermBounds}=new Function(vat+";return {vatTermBounds};")();
const inputRaw=readFileSync("lib/invoiceInputVat.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {validateVatPurchaseInput}=new Function("vatTermBounds",inputRaw+";return {validateVatPurchaseInput};")(vatTermBounds);
const raw=readFileSync("lib/vatPurchaseCsvImport.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {parseVatImportCsv,vatCsvTemplate,inspectVatImportRows,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS,VAT_CSV_COLUMNS}=
 new Function("validateVatPurchaseInput",raw+
 ";return {parseVatImportCsv,vatCsvTemplate,inspectVatImportRows,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS,VAT_CSV_COLUMNS};")(validateVatPurchaseInput);
assert.equal(MAX_VAT_IMPORT_ROWS,50);
assert.equal(MAX_VAT_CSV_BYTES,256*1024);
const template=vatCsvTemplate();
assert.ok(template.startsWith("\uFEFF"));
const example=parseVatImportCsv(template);
assert.equal(example.length,1);
assert.equal(example[0].kind,"purchase");
assert.equal(example[0].supplierName,"Eksempelleverandør AS");
assert.equal(example[0].documentNumber,"2026-123");
assert.equal(example[0].documentDate,"2026-10-24");
assert.equal(example[0].groups[25].vat,"250,00");
assert.equal(example[0].documentConfirmed,false,"CSV may not grant tax deduction by default");
assert.equal(inspectVatImportRows(example,[])[0].status,"invalid",
 "Example supplier from template is not a real invoice and may not import");
const header=VAT_CSV_COLUMNS.map(v=>'"'+v+'"').join(";");
const line=(vals)=>vals.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";");
const make=(supplier,number,kind="faktura",amount="100,00",tax="25,00")=>[
 kind,supplier,number,"2026-10-25",kind==="kreditnota"?"INV-ORIGINAL":"",
 amount,tax,"","","","","","","100","Regnskap bilag 12","Arbeid for kunde"
];
const rows=[make("Megaflis","INV-100"),make("=Uønsket; navn","INV-101"),make("Megaflis","INV-100"),
 make("Byggern","INV-103","kreditnota"),make("Byggern","INV-104","faktura","200,00","30,00"),
 make("Norsk Bygg","INV-105")];
const csv="\uFEFF"+header+"\r\n"+rows.map(line).join("\r\n")+"\r\n";
const parsed=parseVatImportCsv(csv);
assert.equal(parsed.length,6);
assert.equal(parsed[1].supplierName,"=Uønsket; navn","Quoted semicolon must stay part of supplier name");
assert.equal(parsed[3].kind,"credit");
const existing=[
 {id:"one",supplier_name:"Norsk Bygg",supplier_document_number:"INV-105",
  kind:"purchase",document_date:"2026-10-25",base_ore:10000,vat_ore:2500,
  deductible_vat_ore:2500,voided_at:null},
 {id:"two",supplier_name:"Byggern",supplier_document_number:"INV-103",
  kind:"purchase",document_date:"2026-10-25",base_ore:10000,vat_ore:2500,
  deductible_vat_ore:2500,voided_at:null},
 {id:"voided",supplier_name:"Old",supplier_document_number:"INV-9",
  kind:"purchase",document_date:"2026-10-25",base_ore:10000,vat_ore:2500,
  deductible_vat_ore:2500,voided_at:"2026-10-25T11:00:00Z"}
];
const result=inspectVatImportRows(parsed,existing);
assert.deepEqual(result.map(r=>r.status),
 ["duplicateInFile","new","duplicateInFile","review","invalid","existing"]);
assert.equal(result[1].baseOre,10000);
assert.equal(result[1].vatOre,2500);
assert.equal(result[1].deductibleVatOre,2500);
assert.match(result[4].message,/stem/);
assert.equal(result[5].status,"existing");
assert.ok(!JSON.stringify(result).includes("businessPurpose"),"No unnecessary private business purpose in preview response");
const oldButDifferent=[{...existing[0],base_ore:12000}];
const conflicting=inspectVatImportRows([parsed[5]],oldButDifferent);
assert.equal(conflicting[0].status,"conflict");
const ignored=inspectVatImportRows([{
 ...parsed[5],supplierName:"Old",documentNumber:"INV-9"
}],existing);
assert.equal(ignored[0].status,"new","Voided documents may be re-registered after verification");
const bank=inspectVatImportRows([{
 ...parsed[5],supplierName:"Bankkrevende",documentNumber:"INV-200",
 groups:{25:{base:"10000,00",vat:"2500,00"}},
}],[]);
assert.equal(bank[0].status,"new");
assert.equal(bank[0].requiresBankCheck,true);
assert.equal(inspectVatImportRows([{...parsed[5],deductionPercent:""}],[])[0].status,"invalid",
 "Missing deduction percentage must not silently become 0");
assert.throws(()=>parseVatImportCsv('wrong;headers\r\nx;y'),/kolonnene/);
assert.throws(()=>parseVatImportCsv(header+"\n"+make("A","B").join(";").replace(/^faktura/,'"faktura')),/anførselstegn/);
assert.throws(()=>parseVatImportCsv(header+"\r\n"+Array(51).fill(line(make("A","B"))).join("\r\n")) ,/Maks 50/);
assert.throws(()=>parseVatImportCsv(header+"\n"+line(["short"])),/kolonner/);
assert.throws(()=>parseVatImportCsv("a".repeat(MAX_VAT_CSV_BYTES+1)),/256 KB/);
assert.throws(()=>inspectVatImportRows([],[]),/1 og 50/);
const ui=readFileSync("app/admin/faktura/mva/VatPurchaseCsvImport.js","utf8");
const route=readFileSync("app/api/admin/invoices/vat-import/route.js","utf8");
const parent=readFileSync("app/admin/faktura/mva/InvoiceVatTermClient.js","utf8");
assert.ok(ui.includes('Last ned CSV-mal'));
assert.ok(ui.includes('Importer {selected.length}'));
assert.ok(ui.includes("deductionChecked")&&ui.includes("documentChecked"));
assert.ok(ui.includes('"/api/admin/invoices/vat-purchases"'),"Actual writes reuse existing verified registration API");
assert.ok(ui.includes("rerunPreview"),"Must rerun duplicate check before retries");
assert.ok(parent.includes("<VatPurchaseCsvImport"));
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes('is("voided_at",null)'));
assert.ok(!route.includes(".insert(")&&!route.includes(".update(")&&!route.includes("rpc("),"Preview API must remain read-only");
console.log("Import av leverandørbilag bestått: norsk CSV, siterte felt, 50 rader, duplikater, avvik, gammel kreditering, bankkrav og bekreftelse.");
