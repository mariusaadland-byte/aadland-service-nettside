// Browser-side OCR worker lifecycle, isolated so language loading and failures can be tested.
// Tesseract.js v5 accepts an array of language codes, not a "+"-joined string.
export async function recognizeVatReceiptImages(tess,images,onProgress=()=>{}){
 if(!Array.isArray(images)||!images.length)throw Error("Ingen bilder ble klargjort for tekstlesing.");
 if(typeof tess?.createWorker!=="function")throw Error("Tekstleseren ble ikke lastet riktig.");
 let worker;
 const report=message=>{
  if(message?.status==="recognizing text")
   onProgress("Leser kvitteringen: "+Math.round((message.progress||0)*100)+" %");
 };
 try{
  onProgress("Laster norsk kvitteringsleser …");
  try{
   worker=await tess.createWorker(["nor","eng"],1,{logger:report});
  }catch(primaryError){
   // Some iOS networks refuse one of the language packs. Retrying with
   // English also recognizes many numbers and headings on Norwegian receipts.
   onProgress("Norsk språkfil kunne ikke lastes. Prøver engelsk tekstleser …");
   try{worker=await tess.createWorker("eng",1,{logger:report});}
   catch{
    throw Error("Tekstleseren kunne ikke startes. Sjekk internettforbindelsen og prøv igjen i Safari.");
   }
  }
  let text="";
  for(let i=0;i<images.length;i++){
   onProgress("Leser bilde "+(i+1)+" av "+images.length+" …");
   const result=await worker.recognize(images[i]);
   text+="\n"+String(result?.data?.text||"");
  }
  return text;
 }finally{
  if(worker)await worker.terminate();
 }
}


// A page-local reader can reuse one loaded language model for consecutive
// receipts. The single-shot helper above remains for existing callers/tests.
export function createVatReceiptReader(tess){
 let worker=null,starting=null,progress=()=>{},running=false;
 const logger=message=>{
  if(message?.status==="recognizing text")
   progress("Leser kvitteringen: "+Math.round((message.progress||0)*100)+" %");
 };
 async function start(){
  if(worker)return worker;
  if(!starting){
   starting=(async()=>{
    try{
     worker=await tess.createWorker(["nor","eng"],1,{logger});
    }catch{
     progress("Norsk språkpakke kunne ikke lastes. Prøver engelsk …");
     worker=await tess.createWorker("eng",1,{logger});
    }
    return worker;
   })();
  }
  try{return await starting;}
  catch(error){starting=null;worker=null;throw Error("OCR-motoren kunne ikke startes. Prøv med internettilgang i Safari.");}
 }
 async function close(){
  const runningWorker=worker;
  worker=null;starting=null;
  if(runningWorker)await runningWorker.terminate();
 }
 return {
  async recognize(images,onProgress=()=>{},options={}){
   if(!Array.isArray(images)||images.length===0)throw Error("Ingen bilder å lese.");
   if(running)throw Error("En kvittering leses allerede.");
   running=true;progress=onProgress;
   let modeChanged=false;
   try{
    const active=await start();
    if(options.layout==="column"){
     if(typeof active.setParameters!=="function")throw Error("Alternativ dokumenttolkning støttes ikke.");
     // PSM 4: single column with variable text sizes. Default PSM 6 is
     // restored after this retry so subsequent receipts start normally.
     await active.setParameters({tessedit_pageseg_mode:"4"});
     modeChanged=true;
    }
    let text="",confidence=[];
    for(let i=0;i<images.length;i++){
     progress("Leser bilde "+(i+1)+" av "+images.length+" …");
     const result=await active.recognize(images[i]);
     text+="\n"+String(result?.data?.text||"");
     if(Number.isFinite(result?.data?.confidence))confidence.push(result.data.confidence);
    }
    return {text,confidence:confidence.length?
     Math.round(confidence.reduce((sum,value)=>sum+value,0)/confidence.length):null};
   }catch(error){
    await close().catch(()=>{});
    throw error;
   }finally{
    if(modeChanged&&worker){
     try{await worker.setParameters({tessedit_pageseg_mode:"6"});}
     catch{await close().catch(()=>{});}
    }
    running=false;progress=()=>{};
   }
  },
  close
 };
}
