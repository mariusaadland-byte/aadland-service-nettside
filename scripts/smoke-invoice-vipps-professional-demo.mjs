import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const routeSource=readFileSync("app/api/demo/vipps-receipt-pdf/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace("export async function GET","async function GET");
const pdfSource=readFileSync("lib/invoiceDraftPdf.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const mockSharp=()=>({
 resize(){return this;},flatten(){return this;},jpeg(){return this;},
 async toBuffer(){return {data:Buffer.from("mock-logo-image"),info:{width:400,height:100}};}
});
const generate=new Function("sharp","path",pdfSource+";return buildInvoiceDraftPdf;")(mockSharp,{join:()=>"/demo/logo.webp"});
const NextResponse=class {
 constructor(value,options){this.value=value;this.headers=options.headers;this.status=options.status||200;}
 static json(value,opts={}){return {body:value,status:opts.status||200};}
};
const get=new Function("NextResponse","buildInvoiceDraftPdf",routeSource+";return GET;")(NextResponse,generate);
const call=type=>get({url:"https://example.invalid/api/demo/vipps-receipt-pdf?type="+type});
for(const [type,partial] of [["partial",true],["full",false]]){
 const r=await call(type);
 assert.equal(r.status,200);
 assert.equal(r.headers["Content-Type"],"application/pdf");
 assert.match(r.headers["Content-Disposition"],/TEST-Aadland-Service/);
 assert.match(r.headers["X-Robots-Tag"],/noindex/);
 const pdf=Buffer.from(r.value).toString("latin1");
 assert.ok(pdf.startsWith("%PDF-1.4"));
 assert.match(pdf,/\/Count 1\b/,"Short demo receipts must fit on one professionally laid-out A4 page");
 assert.ok(pdf.includes("TESTDOKUMENT - IKKE GYLDIG"));
 assert.ok(pdf.includes("DEMO - INGEN FAKTURA UTSTEDT - INGEN BETALING UTFORT"));
 assert.ok(pdf.includes("Eksempelkunde"));
 assert.ok(pdf.includes("937 781 873"));
 assert.ok(pdf.includes("BETALING REGISTRERT"));
 assert.ok(pdf.includes("Vipps-referanse:"));
 assert.ok(pdf.includes("FAKTURABEL"));
 assert.ok(pdf.includes("DEMO-IKKE-EKTE-VIPPS-0001"));
 if(partial){
  assert.ok(pdf.includes("DELBETALING REGISTRERT"));
  assert.ok(pdf.includes("Dette er en delbetaling"));
  assert.ok(pdf.includes("GJENSTÅR"),"Partial demo receipt must show remaining balance");
  assert.ok(!pdf.includes("Fakturaen er fullt oppgjort"));
 }else{
  assert.ok(pdf.includes("Fakturaen er fullt oppgjort"));
  assert.ok(!pdf.includes("GJENSTÅR"),"Fully paid demo receipt must hide remaining balance");
  assert.ok(!pdf.includes("DELBETALING REGISTRERT"));
 }
}
const bad=await call("unknown");
assert.equal(bad.status,400,"Only fixed demo modes are supported");
assert.doesNotMatch(routeSource,/\b(db|getAdminUser|startInvoiceVipps|mail|Resend|fetch)\s*\(/,"Sample route must not touch customer data, payments or email");
const preview=readFileSync("app/admin/vipps/test/page.js","utf8");
assert.ok(preview.includes('href="/api/demo/vipps-receipt-pdf?type=partial"'));
assert.ok(preview.includes('href="/api/demo/vipps-receipt-pdf?type=full"'));
console.log("Ekte PDF-motor i testmodus bestått: logo, demo-merking, fakturalinjer, MVA, delbetaling, fullt oppgjør og sikker offentlig eksempelrute.");
