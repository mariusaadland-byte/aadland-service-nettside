import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const parserSource=read("lib/vatReceiptParser.js").replace(/^export /gm,"");
const {parseNorwegianReceipt,receiptAmountOre}=new Function(parserSource+
 ";return {parseNorwegianReceipt,receiptAmountOre};")();
assert.equal(receiptAmountOre("1 250,50"),125050);
assert.equal(receiptAmountOre("1.250,50"),125050);
assert.equal(receiptAmountOre("1250,50"),125050);
assert.equal(receiptAmountOre("1,250.50"),125050);
assert.equal(receiptAmountOre("1250.50"),125050);
assert.equal(receiptAmountOre("1.250.50"),null,"Ambiguous separators must not be accepted");
assert.equal(parseNorwegianReceipt(["TESTBUTIKK","25.10.2026","Sum","125,00","MVA 25% 100,00 25,00"].join("\n")).totalOre,12500);
assert.equal(parseNorwegianReceipt(["TESTBUTIKK","25.10.2026","Sum eks mva 100,00","Mva totalt 25,00"].join("\n")).totalOre,null);
assert.equal(parseNorwegianReceipt(["TESTBUTIKK","25.10.2026","MVA 25% 1,000.00 250.00","Total 1,250.00"].join("\n")).groups[25].base,"1000,00");

assert.equal(receiptAmountOre("dårlig"),null);
const sample=[
 "MEGAFLIS BERGEN AS","Org nr 912 345 678","Kvittering nr 540018",
 "Dato 25.10.2026","MVA 25 % Grunnlag 1 000,00 Avgift 250,00",
 "Totalt inkl mva 1 250,00","Betalt med kort 1 250,00"
].join("\n");
const p=parseNorwegianReceipt(sample);
assert.equal(p.supplierName,"MEGAFLIS BERGEN AS");
assert.equal(p.documentNumber,"540018");
assert.equal(p.documentDate,"2026-10-25");
assert.equal(p.totalOre,125000);
assert.equal(p.groups[25].base,"1000,00");
assert.equal(p.groups[25].vat,"250,00");
const inferred=parseNorwegianReceipt([
 "Byggern","Kvittering nr 456789","22.10.2026","MVA 25 %: 50,00","Totalt 250,00"
].join("\n"));
assert.equal(inferred.groups[25].base,"200,00");
assert.equal(inferred.groups[25].vat,"50,00");
const ambiguous=parseNorwegianReceipt([
 "BUTIKK","Dato 23.10.2026","Total 125,00","Ingen MVA-linjer"
].join("\n"));
assert.equal(Object.keys(ambiguous.groups).length,0,"Never infer MVA from gross alone");
const incorrect=parseNorwegianReceipt([
 "Byggern","25.10.2026","MVA 25% 100,00 25,00","Total 160,00"
].join("\n"));
assert.equal(Object.keys(incorrect.groups).length,0,"Mismatched receipt sum never pre-fills VAT");
assert.ok(incorrect.warnings.some(x=>x.includes("stemmer ikke")));
const invalidDate=parseNorwegianReceipt("Butikken\nDato 31.02.2026\nMVA 25% 100,00 25,00\nSum 125,00");
assert.equal(invalidDate.documentDate,"");
const ui=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const ocr=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(ui.includes("<VatReceiptScanner"));
assert.ok(ui.includes("setReceiptFile(file||null)"));
assert.ok(ui.includes("attachToDocument(documentId,receiptFile)"));
assert.ok(ui.includes("retryAttachment"));
assert.ok(ui.includes("setScanBusy"));
assert.ok(ocr.includes('capture="environment"'));
assert.ok(ocr.includes('application/pdf'));
assert.ok(ocr.includes("createVatReceiptReader"));
assert.ok(ocr.includes("parseNorwegianReceipt"));
assert.ok(ocr.includes("onBusyChange?.(false)"));
assert.ok(ocr.includes('image/heic')&&ocr.includes('image/heif'));
assert.ok(ocr.includes('source.size>MAX_SOURCE_SIZE'));
assert.ok(ocr.includes('source.size<=MAX_SIZE'));
assert.ok(ocr.includes('converted:true'));
assert.ok(ocr.includes('toBlob(resolve,"image/jpeg"'));
assert.ok(ocr.includes('URL.revokeObjectURL(url)'));
assert.ok(ocr.includes('Originalfotoet beholdes som bilagsvedlegg'));
assert.ok(ocr.includes('preserveAttachment:true'),"Do not replace accounting original with OCR copy");
assert.ok(ocr.includes('cropJob&&<VatReceiptCropper'));
assert.ok(ui.includes('receiptIsCopy'));
assert.ok(ui.includes('JPEG-kopi'));
const cropLogicSource=read("lib/vatReceiptCrop.js").replace(/^export /gm,"");
const {detectReceiptBounds,cropReceiptPixels,fullReceiptBounds,clampReceiptBounds}=
 new Function(cropLogicSource+";return {detectReceiptBounds,cropReceiptPixels,fullReceiptBounds,clampReceiptBounds};")();
const image=(width,height,background,receipt=null)=>{
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const isPaper=receipt&&x>=receipt.x&&x<receipt.x+receipt.w&&y>=receipt.y&&y<receipt.y+receipt.h;
  const shade=isPaper?244:background;
  const p=(y*width+x)*4;
  pixels[p]=shade;pixels[p+1]=shade;pixels[p+2]=shade;pixels[p+3]=255;
 }
 return {width,height,data:pixels};
};
const detected=detectReceiptBounds(image(160,200,55,{x:24,y:18,w:112,h:165}));
assert.ok(detected,"White receipt against dark background should be found");
assert.ok(detected.x<=24/160&&detected.x+detected.w>=135/160,"X includes paper");
assert.ok(detected.y<=18/200&&detected.y+detected.h>=182/200,"Y includes paper");
assert.equal(detectReceiptBounds(image(160,200,255,{x:24,y:18,w:112,h:165})),null,
 "White background must not silently auto-crop");
assert.equal(detectReceiptBounds(image(160,200,45)),null,"Dark image must not auto-crop");
assert.deepEqual(cropReceiptPixels(200,100,{x:.1,y:.2,w:.7,h:.6}),{x:20,y:20,width:140,height:60});
assert.deepEqual(clampReceiptBounds({x:-.5,y:0,w:2,h:2}),fullReceiptBounds());
const cropUI=read("app/admin/faktura/mva/VatReceiptCropper.js");

assert.ok(cropUI.includes('onPointerDown={startDrag}'));
assert.ok(cropUI.includes('data-corner={i}'));
assert.ok(cropUI.includes('detectReceiptCorners(ctx.getImageData'));
assert.ok(cropUI.includes('await onApply(preview,{cropped:true})'));
assert.ok(cropUI.includes('Ferdig opprettet kvittering: bare papiret'));
assert.ok(cropUI.includes('Vis bare kvitteringen'));
assert.ok(cropUI.includes('receiptPerspectiveMatrix(corners)'));
assert.ok(cropUI.includes('getImageData(0,0,srcW,srcH)'));
const {detectReceiptCorners,fullReceiptCorners,validReceiptCorners,receiptCornerArea,
 receiptPerspectiveMatrix,receiptPerspectivePoint,receiptScanDimensions}=
 new Function(cropLogicSource+";return {detectReceiptCorners,fullReceiptCorners,validReceiptCorners,receiptCornerArea,receiptPerspectiveMatrix,receiptPerspectivePoint,receiptScanDimensions};")();
assert.ok(validReceiptCorners(fullReceiptCorners()));
assert.equal(validReceiptCorners([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]),false);
assert.equal(receiptCornerArea(fullReceiptCorners()),1);
const tilt=[{x:.20,y:.14},{x:.77,y:.09},{x:.86,y:.84},{x:.14,y:.91}];
assert.ok(validReceiptCorners(tilt));
const perspective=receiptPerspectiveMatrix(tilt);
assert.ok(perspective);
for(const [i,[u,v]] of [[0,0],[1,0],[1,1],[0,1]].entries()){
 const mapped=receiptPerspectivePoint(perspective,u,v);
 assert.ok(Math.abs(mapped.x-tilt[i].x)<1e-8);
 assert.ok(Math.abs(mapped.y-tilt[i].y)<1e-8);
}
const dims=receiptScanDimensions(tilt,1200,1600);
assert.ok(dims.width>100&&dims.height>100&&dims.width*dims.height<=5200000+2000);
const whitePaper=detectReceiptCorners(image(160,200,55,{x:24,y:18,w:112,h:165}));
assert.ok(whitePaper&&validReceiptCorners(whitePaper),"Only the white paper quadrilateral should be detected");
assert.ok(whitePaper[0].x<.20&&whitePaper[0].y<.14);
assert.ok(whitePaper[2].x>.8&&whitePaper[2].y>.8);
assert.equal(detectReceiptCorners(image(160,200,255,{x:24,y:18,w:112,h:165})),null);
assert.equal(detectReceiptCorners(image(160,200,45)),null);
assert.ok(ocr.includes("setImageForCrop({file,originalName:source.name"));
assert.ok(ocr.includes('if(file.type!=="application/pdf")'));
assert.ok(ocr.includes("onSelected(null)"));
assert.ok(ocr.includes("await recognizeSelected(file,"),"OCR must run directly from the camera image");
assert.ok(ocr.includes("await recognizeSelected(croppedFile"),"Optional crop must still rescan");
console.log("MVA-kvitteringstest bestått: mobilkamera, PDF, norsk OCR, MVA-kontroll og sikker vedleggskobling.");
