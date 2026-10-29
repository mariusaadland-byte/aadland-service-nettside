// Align the receipt outline with the actual camera pixels displayed
// by a video element using object-fit: contain (portrait or landscape).
export function vatCameraVisibleFrame(stageWidth,stageHeight,videoWidth,videoHeight){
 const values=[stageWidth,stageHeight,videoWidth,videoHeight];
 if(values.some(n=>!Number.isFinite(n)||n<=0))return null;
 const scale=Math.min(stageWidth/videoWidth,stageHeight/videoHeight);
 const width=videoWidth*scale,height=videoHeight*scale;
 return {left:(stageWidth-width)/2,top:(stageHeight-height)/2,width,height};
}
