// Client-side coordinator. The server independently authorizes, locks and
// verifies each irreversible write. This never guesses payment accounts,
// invents payment dates or automatically retries an uncertain provider call.
const readJson=async(response)=>{
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.ok===false)throw Error(
  data.error||"Tripletex kunne ikke bekrefte overføringen. Kontroller historikken."
 );
 return data;
};
const uuid=value=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const jsonPost=body=>({method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify(body)});

export async function transferTripletexInvoiceAsPaid({
 invoiceId,digest,paymentCount,paymentTypesBySource,fetcher=fetch,
 onCreated=()=>{},onPayment=()=>{}
}={}){
 if(!uuid(invoiceId)||typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)||
  !Number.isSafeInteger(paymentCount)||paymentCount<1||paymentCount>10||
  !paymentTypesBySource||typeof paymentTypesBySource!=="object")
  throw Error("Ugyldig betalingsgrunnlag. Kontroller fakturaen på nytt.");
 let created=null,posted=0,attemptedCreation=false;
 try{
  attemptedCreation=true;
  created=await readJson(await fetcher("/api/admin/tripletex/invoices/direct",
   jsonPost({action:"transfer",confirmed:true,invoiceId,digest})));
  if(created.status!=="confirmed"||!validId(created.tripletexInvoiceId))
   throw Error("Tripletex-fakturaen ble ikke entydig bekreftet.");
  onCreated(created);
  for(let i=0;i<paymentCount;i++){
   const get=await readJson(await fetcher(
    "/api/admin/tripletex/invoices/payments?invoiceId="+encodeURIComponent(invoiceId),
    {cache:"no-store"}));
   if(!get.ready||!get.next)
    throw Error(get.reason||"Innbetalingen kunne ikke avstemmes.");
   const type=paymentTypesBySource[get.next.source];
   if(!validId(type))
    throw Error("Mangler korrekt betalingstype for "+String(get.next.source)+".");
   const recorded=await readJson(await fetcher(
    "/api/admin/tripletex/invoices/payments",jsonPost({
     action:"record",confirmed:true,invoiceId,paymentId:get.next.id,
     paymentTypeId:Number(type),expectedRemoteOutstandingOre:get.remoteOutstandingOre
    })));
   if(!recorded.ok||recorded.paymentId!==get.next.id)
    throw Error("Tripletex bekreftet ikke riktig innbetaling. Ingen automatisk ny sending.");
   posted++;
   onPayment(posted,paymentCount,recorded);
  }
  const check=await readJson(await fetcher(
   "/api/admin/tripletex/invoices/payments?invoiceId="+encodeURIComponent(invoiceId),
   {cache:"no-store"}));
  if(check.remainingCount!==0||
   check.remoteOutstandingOre!==check.localOutstandingOre)
   throw Error("Innbetalingene kan være bokført, men restbeløpene er ikke bekreftet like.");
  const reconciled=await readJson(await fetcher(
   "/api/admin/tripletex/invoices/reconcile",
   jsonPost({invoiceId,action:"check"})));
  if(reconciled.comparison!=="match")
   throw Error("Betalingene kan være bokført, men sluttavstemmingen må kontrolleres.");
  return {created,posted,matched:true};
 }catch(error){
  // After a request was initiated, an interrupted network reply may mean that
  // Tripletex did book the invoice/payment. Never suggest blindly retrying.
  const reason=error?.message||"Overføringen ble avbrutt.";
  const detail=created?
   "Faktura nr. "+created.tripletexInvoiceNumber+" er opprettet. "+posted+
   " av "+paymentCount+" innbetalinger er bekreftet her. ":
   attemptedCreation?"Fakturaforsøket kan være registrert i Tripletex. ":"";
  const failed=new Error(detail+reason+
   " Kontroller overføringshistorikken og Tripletex. Ikke opprett fakturaen eller"+
   " send en uavklart betaling på nytt.");
  failed.invoiceAttempted=attemptedCreation;
  failed.invoiceCreated=Boolean(created);
  failed.invoiceNumber=created?.tripletexInvoiceNumber||null;
  failed.posted=posted;
  throw failed;
 }
}
