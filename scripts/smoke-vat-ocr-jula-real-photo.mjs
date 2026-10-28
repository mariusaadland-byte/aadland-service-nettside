import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const parse=new Function(read("lib/vatReceiptParser.js").replace(/^export /gm,"")+
 ";return parseNorwegianReceipt;")();
const full=[
 "(JULA)","Salgskvittering","JulaNo Lagunen",
 "TOTAL NOK 1 051,65","Avrunding -0,35","Kontant 1 100,00",
 "Mva % Eks Mva Mva Salg",
 "25,00 841,32 210,33 1 051,65",
 "SUM 841,32 210,33 1 051,65",
 "Dato: mandag 19. oktober 2026 18:43:05",
 "Kasse: 63519 Bong: 12345 (67890)"
].join("\n");
const p=parse(full);
assert.equal(p.supplierName,"JULA");
assert.equal(p.documentDate,"2026-10-19");
assert.equal(p.documentNumber,"12345");
assert.equal(p.totalOre,105165);
assert.deepEqual(p.groups[25],{base:"841,32",vat:"210,33"});
assert.deepEqual(p.warnings,[]);
// Local Tesseract testing of a Jula-style photo showed that the sum column
// can become illegible while its VAT base and VAT amount remain readable.
// The parser must never mistake "210,33" for the purchase total.
const faded=[
 "Salgskvittering","JulaNo Lagunen","TOTAL NOK 1",
 "Mva % Eks Mva Mva","25,00 841,32 210,33 Å",
 "SUM 841,32 210,33",
 "Dato mandag 19. oktober 2026 18:43",
 "Kasse 63599 Bong: 12345 (67890)"
].join("\n");
const partial=parse(faded);
assert.equal(partial.supplierName,"JulaNo Lagunen");
assert.equal(partial.documentDate,"2026-10-19");
assert.equal(partial.documentNumber,"12345");
assert.equal(partial.totalOre,null);
assert.deepEqual(partial.groups[25],{base:"841,32",vat:"210,33"});
assert.match(partial.warnings.join(" "),/totalbeløpet/i);
assert.equal(parse("TEST\nDato mandag 31. februar 2026").documentDate,"");
assert.equal(parse("TEST\nMva % Eks Mva Mva\n25,00 841,32 220,33\nSUM 841,32 220,33").groups[25],undefined,
 "Incorrect 25 percent math must be rejected");
const image=read("lib/vatOcrImage.js");
assert.ok(image.includes("detectReceiptCorners(pixels)"),"Detect actual paper shape before OCR");
assert.ok(image.includes("rectifyForVatOcr(img,corners,onProgress)"),"Perspective correction before reading");
assert.ok(image.includes("getImageData"),"Read original colors for high-quality deskew");
assert.ok(image.includes("return rectified"),"Use OCR-only corrected image");
assert.ok(image.includes("const geometry=vatOcrGeometry"),"Retain uncorrected fallback");
const dimensionsSource=image.replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const vatAutoPerspectiveDimensions=new Function("detectReceiptBounds","detectReceiptCorners",
 "validReceiptCorners","receiptCornerArea","receiptPerspectiveMatrix","receiptScanDimensions",
 dimensionsSource+";return vatAutoPerspectiveDimensions;")(
 ()=>null,()=>null,c=>Array.isArray(c)&&c.length===4,
 c=>.23,()=>[],()=>({width:650,height:1900})
);
const corners=[{x:.25,y:.12},{x:.66,y:.10},{x:.72,y:.90},{x:.29,y:.92}];
const dims=vatAutoPerspectiveDimensions(corners,1152,1536);
assert.ok(dims.width>180&&dims.height>280&&dims.width*dims.height<=2301000);
console.log("Jula-kvitteringsregresjon bestått: norsk dato, 25 % MVA, totalsum og sikre OCR-forbedringer.");
