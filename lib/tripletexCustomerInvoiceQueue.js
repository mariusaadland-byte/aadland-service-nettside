// A downloaded CSV is NOT an import. Only explicit owner confirmation after
// checking Tripletex's own invoice overview removes a customer invoice from pending.
export function tripletexCustomerInvoiceQueue(rows,transfers){
 const byId=new Map((transfers||[]).map(x=>[x.invoice_id,x]));
 const pending=[],prepared=[],confirmed=[],needsReview=[];
 for(const row of rows||[]){
  const transfer=byId.get(row.id)||null;
  const annotated={...row,transfer};
  if(transfer?.status==="confirmed")confirmed.push(annotated);
  else if(transfer?.status==="prepared")prepared.push(annotated);
  else if(row.state==="review")needsReview.push(annotated);
  else pending.push(annotated);
 }
 return {pending,prepared,confirmed,needsReview};
}
export function validateTripletexImportNumber(value){
 const n=Number(value);
 return typeof value!=="boolean"&&String(value).trim()!==""&&
  Number.isSafeInteger(n)&&n>=10001&&n<=999999999?n:null;
}
export function tripletexPaymentTypeFor(item,vipps,other){
 const code=item.paymentSource==="vipps"?vipps:item.paymentSource==="other"?other:"";
 if(item.state==="paid"&&!/^[A-Za-z0-9_-]{1,32}$/.test(String(code||"")))
  throw Error("Oppgi riktig Tripletex Import-ID for "+(item.paymentSource==="vipps"?"Vipps":"annen innbetaling")+".");
 return item.state==="paid"?String(code):null;
}
