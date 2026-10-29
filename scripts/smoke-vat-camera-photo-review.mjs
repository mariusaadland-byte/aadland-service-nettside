import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=p=>readFileSync(p,"utf8");
const camera=get("app/admin/faktura/mva/VatReceiptLiveCamera.js");
const scanner=get("app/admin/faktura/mva/VatReceiptScanner.js");
const css=get("app/admin/faktura/mva/VatSimpleForm.module.css");
const form=get("app/admin/faktura/mva/InputVatRegisterClient.js");
const take=camera.slice(camera.indexOf("async function takePicture(){"),camera.indexOf("async function acceptPhoto(){"));
const accept=camera.slice(camera.indexOf("async function acceptPhoto(){"),camera.indexOf("function retakePhoto(){"));
const retake=camera.slice(camera.indexOf("function retakePhoto(){"),camera.indexOf("if(!mounted)return null"));
assert.ok(take.includes('new File([blob],"kvittering-kamera.jpg"'),
 "Camera should retain a real JPEG file");
assert.ok(take.includes("setPhoto({file,url})"),"Camera screenshot should open review view");
assert.ok(!take.includes("onCapture("),"Taking a photo may not replace the selected bookkeeping receipt");
assert.ok(accept.includes("await onCapture(photo.file)"),"Only accepting image may send it to OCR");
assert.ok(accept.includes("capturingRef.current=true"),"Prevent double acceptance");
assert.ok(retake.includes("setPhoto(null)"),"Allow second photo without leaving fullscreen");
assert.ok(!retake.includes("onCapture(")&&!retake.includes("onSelected("),
 "Retake must not touch previous receipt or stored OCR data");
assert.ok(camera.includes('URL.createObjectURL(blob)'),"Make the high-resolution photograph visible");
assert.ok(camera.includes('URL.revokeObjectURL(photo.url)'),"Clean up private image URL on retake/close");
assert.ok(camera.includes("reviewRef.current||video.readyState<2"),
 "Pause repeated edge detection while reviewing photo");
assert.ok(camera.includes("photo&&<img className={styles.liveCameraPhotoReview}"));
assert.ok(camera.includes('alt="Bildet du nettopp tok av kvitteringen.'),"Accessible photo preview");
assert.ok(camera.includes('onClick={retakePhoto}'),"Expose Ta på nytt");
assert.ok(camera.includes('onClick={acceptPhoto}'),"Expose Bruk bildet");
assert.ok(camera.includes("disabled={disabled||capturing}"),"Do not allow retake during acceptance");
assert.ok(camera.includes("onClick={onCancel}"),"Close still works in preview");
assert.ok(camera.includes('role="dialog"')&&camera.includes('aria-modal="true"'));
assert.ok(camera.includes('getUserMedia(')&&camera.includes('stream.getTracks().forEach(track=>track.stop())'));
assert.ok(css.includes(".liveCameraPhotoReview")&&css.includes("object-fit:contain"),
 "Preview must show whole paper without distortion or cropping");
assert.ok(css.includes(".liveCameraReviewActions")&&css.includes(".liveCameraRetake"));
assert.ok(css.includes("safe-area-inset-bottom"),"Keep review controls clear of iPhone home indicator");
assert.ok(scanner.includes('onCapture={file=>{setLiveCamera(false);void chooseSource(file);}}'),
 "Only accepted photo is handed to original OCR flow");
assert.ok(form.includes("setReceiptFile(file||null)"),
 "Retaining original receipt remains controlled by the parent accounting form");
console.log("Kvitteringskamera forhåndsvisning bestått: Ta på nytt eller Bruk bildet, original beholdes til bekreftelse, sikker iPhone-opprydding.");
