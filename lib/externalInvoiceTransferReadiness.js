// Human-readable review steps for an external invoice's DIRECT Tripletex transfer.
// UX only: the server independently enforces all accounting and duplicate checks.
export function externalInvoiceTransferBlockers({
 loading=false,directLoading=false,customerStatus="loading",
 direct=null,importAmountsMatch=false,readerStatus="idle",
 confirmed=false,customerConfirmed=false,notImported=false,
 accountingPeriodConfirmed=false,number="",paid=false,paidOn=null,
 paymentTypeId="",paymentSourceConfirmed=false
}={}){
 const steps=[];
 if(loading||directLoading)steps.push("Vent til kontroll av faktura og Tripletex er ferdig.");
 if(!direct?.configured)steps.push(
  direct===null?"Tripletex-tilkoblingen kunne ikke kontrolleres. Prøv å oppdatere status.":
  "Koble Aadland Service til Tripletex-produksjon."
 );
 if(customerStatus==="missing_local_card")
  steps.push("Koble fakturaen til et kundekort med «Kundekort – velg eller opprett» ovenfor.");
 else if(customerStatus==="not_linked_to_tripletex")
  steps.push("Koble kundekortet til Tripletex med knappen «Koble kunde til Tripletex» ovenfor.");
 else if(customerStatus==="needs_review")
  steps.push("Kundeoverføringen må kontrolleres i Tripletex før fakturaen sendes.");
 else if(customerStatus!=="linked_to_tripletex")
  steps.push("Vent til kundekoblingen er kontrollert.");
 if(readerStatus==="reading")steps.push("Vent til fakturalesingen er ferdig.");
 if(!importAmountsMatch)
  steps.push("Velg riktig MVA-sats og kontroller at ekskl. MVA + MVA = original fakturasum.");
 if(!/^\d{5,9}$/.test(String(number||"")))
  steps.push("Kontroller Tripletex-importnummeret.");
 if(!confirmed)steps.push("Kryss av for at MVA-beløpene er kontrollert.");
 if(!customerConfirmed)steps.push("Kryss av for at riktig kunde er kontrollert.");
 if(!notImported)steps.push("Bekreft at fakturaen ikke allerede finnes i Tripletex.");
 if(!accountingPeriodConfirmed)steps.push("Bekreft at omsetning og MVA ikke bokføres dobbelt.");
 if(paid){
  if(!/^20\d\d-\d\d-\d\d$/.test(String(paidOn||"")))
   steps.push("Betalingsdato mangler på fakturaen i Aadland Service.");
  if(direct?.paymentTypesError)
   steps.push(direct.paymentTypesError);
  else if(!Array.isArray(direct?.paymentTypes)||!direct.paymentTypes.some(t=>String(t.id)===String(paymentTypeId)))
   steps.push("Velg riktig betalingsmåte eller bankkonto fra Tripletex.");
  if(!paymentSourceConfirmed)
   steps.push("Bekreft at innbetalingen er mottatt og ikke allerede bokført.");
 }
 return [...new Set(steps)];
}
