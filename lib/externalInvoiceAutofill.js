// Conservative, review-only suggestions from the ORIGINAL private invoice.
// No VAT assumptions from gross alone: parse textual VAT base and tax and
// independently reconcile to the original invoice total, in exact øre.
import {parseNorwegianSupplierInvoice} from "./vatSupplierInvoiceParser";
import {parseExternalInvoiceOre} from "./externalInvoiceRegister";

const normalizeNumber=x=>String(x||"").trim().replace(/[\s._-]+/g,"").replaceAll("/","").toLowerCase();
export function suggestExternalInvoiceVat(text,invoice){
 const parsed=parseNorwegianSupplierInvoice(String(text||"").slice(0,140000));
 const total=Number(invoice?.amount_ore);
 const notFound=reason=>({ok:false,reason,parserWarnings:parsed.warnings||[]});
 if(!Number.isSafeInteger(total)||total<=0)
  return notFound("Fakturaen mangler et gyldig totalbeløp.");
 if(parsed.documentNumber&&invoice?.invoice_number&&
  normalizeNumber(parsed.documentNumber)!==normalizeNumber(invoice.invoice_number))
  return notFound("Originalfilen ser ut til å ha et annet fakturanummer enn det som er registrert. Kontroller filen.");
 if(parsed.totalOre!==total)
  return notFound("Fakturasummen i originalfilen stemmer ikke med det registrerte totalbeløpet. Ingen automatisk utfylling.");
 const rates=Object.entries(parsed.groups||{}).filter(([rate,group])=>
  group&&[0,12,15,25].includes(Number(rate)));
 if(rates.length!==1||![12,15,25].includes(Number(rates[0]?.[0])))
  return notFound("MVA-grunnlaget ble ikke lest entydig med én støttet avgiftssats. Kontroller fakturaen manuelt.");
 const [rate,group]=rates[0];
 const baseOre=parseExternalInvoiceOre(group.base);
 const vatOre=parseExternalInvoiceOre(group.vat);
 if(!Number.isSafeInteger(baseOre)||baseOre<=0||
  !Number.isSafeInteger(vatOre)||vatOre<=0||
  baseOre+vatOre!==total||
  Math.round(baseOre*Number(rate)/100)!==vatOre)
  return notFound("Beløp ekskl. MVA og MVA-beløpet stemmer ikke nøyaktig med fakturaens total. Kontroller manuelt.");
 return {ok:true,vatRate:Number(rate),baseOre,vatOre,grossOre:total,
  baseAmount:(baseOre/100).toFixed(2).replace(".",","),
  source:"original_invoice",parserWarnings:parsed.warnings||[]};
}
