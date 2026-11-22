import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const scanner=readFileSync("app/admin/faktura/mva/VatReceiptScanner.js","utf8");
const camera=readFileSync("app/admin/faktura/mva/VatReceiptLiveCamera.js","utf8");
// No browser code may silently persist or override OS privacy decisions.
// Instead keep the existing allowed media stream active while moving to the next page.
assert.ok(scanner.includes("keepOpenAfterCapture={multiMode}"));
assert.ok(scanner.includes("pageNumber={multiPages.length+1}"));
assert.ok(scanner.includes("addMultiSources([file]);"));
assert.ok(scanner.includes("if(multiPages.length+1>=VAT_MULTI_PAGE_LIMIT)setLiveCamera(false);"));
assert.ok(scanner.includes("onCancel={()=>setLiveCamera(false)}"));
assert.ok(camera.includes("if(keepOpenAfterCapture){"));
assert.ok(camera.includes("setPhoto(null);setCorners(null);"));
assert.ok(camera.includes("await onCapture(photo.file)"));
assert.ok(camera.includes("✓ Ferdig med bilder"));
assert.ok(camera.includes('if(stream){stream.getTracks().forEach(track=>track.stop());streamRef.current=null;}'),
 "The camera must stop on finish, cancel or unmount.");
assert.ok(camera.includes("const stream=await navigator.mediaDevices.getUserMedia("),
 "The camera still needs browser-controlled permission.");
const accept=camera.slice(camera.indexOf("async function acceptPhoto(){"),camera.indexOf("function retakePhoto(){"));
assert.ok(!accept.includes("getUserMedia("),"Accepting a page may not re-request camera permissions");
assert.ok(!accept.includes("stream.getTracks()"),"Accepting a page may not close the active camera stream");
assert.ok(scanner.includes("Nettstedsinnstillinger")&&scanner.includes("Kamera til Tillat"),
 "The user must be shown the site-level Safari settings workaround.");
assert.ok(scanner.includes("kan iPhone likevel spørre på nytt"),
 "Never promise persistent permissions for installed iPhone web apps.");
console.log("Kamera: samme strøm gjennom flersidig skanning, frigjøring ved lukking, Safari-veiledning og enkeltskanning bevart.");
