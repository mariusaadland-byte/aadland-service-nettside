import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const geometry=read("lib/vatCameraVisibleFrame.js").replace(/^export /gm,"");
const {vatCameraVisibleFrame}=new Function(geometry+";return {vatCameraVisibleFrame};")();
for(const [stageW,stageH,videoW,videoH] of [
 [393,660,1080,1920], // tall iPhone with camera matching portrait
 [393,660,1920,1080], // landscape feed while holding portrait
 [844,340,1080,1920], // landscape phone / portrait camera
 [600,900,1600,1200], // tablet with landscape sensor
 [360,750,720,1280]
]){
 const frame=vatCameraVisibleFrame(stageW,stageH,videoW,videoH);
 assert.ok(frame);
 assert.ok(frame.left>=0&&frame.top>=0&&frame.width<=stageW+.001&&frame.height<=stageH+.001);
 assert.ok(Math.abs(frame.width/frame.height-videoW/videoH)<1e-10,
  "The paper outline must never be stretched when the video is letterboxed");
 assert.ok(Math.abs(frame.left*2+frame.width-stageW)<1e-8);
 assert.ok(Math.abs(frame.top*2+frame.height-stageH)<1e-8);
}
assert.deepEqual(vatCameraVisibleFrame(400,800,1000,2000),
 {left:0,top:0,width:400,height:800});
assert.equal(vatCameraVisibleFrame(0,800,1000,2000),null);
assert.equal(vatCameraVisibleFrame(400,0,1000,2000),null);
const camera=read("app/admin/faktura/mva/VatReceiptLiveCamera.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
assert.ok(camera.includes('import {createPortal} from "react-dom"'));
assert.ok(camera.includes('return createPortal(')&&camera.includes('document.body);'),
 "Portal prevents the nested admin form from clipping the camera viewport");
assert.ok(camera.includes('role="dialog"')&&camera.includes('aria-modal="true"'),
 "Fullscreen scanner must be accessible as a modal");
assert.ok(camera.includes("body.style.position=\"fixed\""),
 "Prevent iOS scrolling behind the camera");
assert.ok(camera.includes("window.scrollTo(0,scrollY)"),
 "Closing camera must restore scroll position");
assert.ok(camera.includes("window.addEventListener(\"keydown\",onKey)"));
assert.ok(camera.includes('querySelectorAll("button:not([disabled])")'),
 "Keyboard focus should remain within the camera");
assert.ok(camera.includes("onClick={onCancel}"),"Close camera from the top bar");
assert.ok(camera.includes("disabled={!ready||disabled||capturing}"),"No blank photo before ready");
assert.ok(camera.includes("onCapture(new File([blob]"),"Keep full camera JPEG capture");
assert.ok(camera.includes('stream.getTracks().forEach(track=>track.stop())'),
 "Camera tracks must stop after closing");
assert.ok(camera.includes("observer?.disconnect()"),
 "Clean up orientation/resize tracking on close");
assert.ok(camera.includes("setCorners(detectReceiptCorners(ctx.getImageData"),
 "Retain automatic green receipt outline");
assert.ok(camera.includes("style={{left:previewBox.left,top:previewBox.top,width:previewBox.width,height:previewBox.height}}"),
 "Draw outline only over rendered video, not black letterbox margins");
assert.ok(camera.includes("vatCameraVisibleFrame(stage.clientWidth,stage.clientHeight,video.videoWidth,video.videoHeight)"));
assert.ok(scanner.includes("<VatReceiptLiveCamera")&&scanner.includes("chooseSource(file)"),
 "Captured photo must feed the original OCR/attachment path");
assert.ok(scanner.includes('capture="environment"'),
 "Keep native iPhone camera fallback");
assert.ok(css.includes(".liveCameraFullscreen{"));
assert.ok(css.includes("position:fixed;inset:0;"));
assert.ok(css.includes("height:100dvh"),"Use mobile dynamic viewport height");
assert.ok(css.includes("env(safe-area-inset-top")&&css.includes("env(safe-area-inset-bottom"),
 "Do not hide controls under the iPhone notch or home indicator");
assert.ok(css.includes("object-fit:contain"),
 "Show the full camera feed without cropping or distortion");
assert.ok(css.includes(".liveCameraFooter")&&css.includes(".liveCameraCapture"),
 "Capture control must stay large and at the bottom");
console.log("Fullskjerm MVA-kamera bestått: 100dvh, iPhone-kanter, orientering, grønn ramme, originalfoto, lukk og opprydding.");
