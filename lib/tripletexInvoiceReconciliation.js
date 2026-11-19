// Pure, read-only reconciliation. Never use a display name to identify an invoice.
export const positiveId=value=>{
 const n=Number(value);
 return value!==null&&value!==undefined&&value!==""&&Number.isSafeInteger(n)&&n>0?n:null;
};
export function nokToOre(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1000000000)
  return null;
 const ore=Math.round(value*100);
 return Math.abs(ore/100-value)<0.000001&&Number.isSafeInteger(ore)?ore:null;
}
export function nextInvoiceDate(value){
 if(typeof value!=="string"||!/^20\d\d-\d\d-\d\d$/.test(value))return null;
 const time=Date.parse(value+"T00:00:00.000Z");
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)return null;
 return new Date(time+86400000).toISOString().slice(0,10);
}
export function verifyTripletexInvoice(remote,transfer,customerId){
 const id=positiveId(remote?.id);
 const number=positiveId(remote?.invoiceNumber);
 const expectedNumber=positiveId(transfer?.import_number);
 const expectedCustomer=positiveId(customerId);
 const amountOre=nokToOre(remote?.amount);
 const outstandingOre=nokToOre(remote?.amountOutstanding);
 const expectedGross=Number(transfer?.snapshot_gross_ore);
 if(!id||!number||!expectedNumber||!expectedCustomer||
  !Number.isSafeInteger(expectedGross)||expectedGross<=0)
  return {ok:false,reason:"Tripletex-returnerte mangler sikre faktura-, kunde- eller beløpsverdier."};
 if(number!==expectedNumber)return {ok:false,reason:"Fakturanummeret i Tripletex stemmer ikke med importnummeret."};
 if(String(remote.invoiceDate||"").slice(0,10)!==String(transfer.original_issued_date||""))
  return {ok:false,reason:"Fakturadatoen stemmer ikke med den opprinnelige fakturaen."};
 if(positiveId(remote.customer?.id)!==expectedCustomer)
  return {ok:false,reason:"Fakturaen er knyttet til en annen Tripletex-kunde."};
 if(amountOre===null||amountOre!==expectedGross)
  return {ok:false,reason:"Fakturabeløpet stemmer ikke nøyaktig med den importerte fakturaen."};
 if(outstandingOre===null||outstandingOre>amountOre)
  return {ok:false,reason:"Tripletex returnerte et uventet restbeløp."};
 if(remote.isCreditNote===true||remote.isCredited===true)
  return {ok:false,reason:"Fakturaen er kreditert i Tripletex og må kontrolleres regnskapsmessig."};
 const code=String(remote.currency?.code||"").toUpperCase();
 if(code&&code!=="NOK")
  return {ok:false,reason:"Fakturaen er ikke i NOK og kan ikke kobles automatisk."};
 return {ok:true,id,invoiceNumber:number,customerId:expectedCustomer,
  grossOre:amountOre,outstandingOre,invoiceDate:transfer.original_issued_date};
}
export function compareTripletexBalance(link){
 const local=Number(link?.local_outstanding_ore),remote=Number(link?.remote_outstanding_ore);
 if(!Number.isSafeInteger(local)||!Number.isSafeInteger(remote)||local<0||remote<0)
  return {status:"unknown",differenceOre:null};
 return {status:local===remote?"match":"difference",differenceOre:local-remote};
}
