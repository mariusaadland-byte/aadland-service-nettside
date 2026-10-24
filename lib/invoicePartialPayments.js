// Only confirmed money already received should be recorded manually.
// Parse kroner as integer øre; prevent rounding/exponent/scientific notation.
export function parseInvoicePaymentAmountOre(value, outstandingOre){
 const raw=String(value??"").trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(raw))
  throw Error("Oppgi beløp i kroner, for eksempel 250 eller 250,50.");
 const [kroner,decimals=""]=raw.replace(",",".").split(".");
 const amountOre=Number(kroner)*100+Number(decimals.padEnd(2,"0"));
 if(!Number.isSafeInteger(amountOre)||amountOre<1)
  throw Error("Innbetalingen må være minst 0,01 kr.");
 if(!Number.isSafeInteger(outstandingOre)||outstandingOre<1)
  throw Error("Fakturaen har ikke et utestående beløp.");
 if(amountOre>outstandingOre)
  throw Error("Beløpet kan ikke overstige restbeløpet.");
 return amountOre;
}
export function invoicePaymentSuggestionOre(outstandingOre,percent){
 if(!Number.isSafeInteger(outstandingOre)||outstandingOre<=0||
    ![25,50,100].includes(percent))return 0;
 return Math.max(1,Math.round(outstandingOre*percent/100));
}
export function invoicePaymentAmountInput(ore){
 if(!Number.isSafeInteger(ore)||ore<0)return "";
 return (ore/100).toFixed(2).replace(".",",");
}
export function invoicePaymentProgress(invoice){
 const amount=Math.max(0,Number(invoice?.gross||0)-Number(invoice?.credited||0));
 const paid=Math.max(0,Math.min(amount,Number(invoice?.paid||0)));
 const outstanding=Math.max(0,amount-paid);
 return {amount,paid,outstanding,paidPercent:amount>0?Math.round(paid/amount*100):100};
}
