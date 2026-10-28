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
