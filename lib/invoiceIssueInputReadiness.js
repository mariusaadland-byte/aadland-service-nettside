// New draft line numbers are intentionally empty until the user enters them.
// Never silently turn an unset amount into a legal, issued zero-value invoice.
export function invoiceIssueInputError(invoice){
 const lines=invoice?.line_items;
 if(!Array.isArray(lines)||!lines.length)return "Legg inn minst én fakturalinje før fakturering.";
 let total=0;
 for(let i=0;i<lines.length;i++){
  const line=lines[i]||{};
  if(!String(line.description||"").trim())
   return "Fyll inn beskrivelse på fakturalinje "+(i+1)+".";
  if(line.quantity==null||line.quantity===""||
   !Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)
   return "Fyll inn antall eller timer på fakturalinje "+(i+1)+".";
  if(line.unitPriceOre==null||line.unitPriceOre===""||
   !Number.isSafeInteger(Number(line.unitPriceOre))||Number(line.unitPriceOre)<0)
   return "Fyll inn pris eks. MVA på fakturalinje "+(i+1)+".";
  const vat=Number(line.vatRate);
  if(![0,12,15,25].includes(vat))return "Kontroller MVA-satsen på fakturalinje "+(i+1)+".";
  const net=Math.round(Number(line.quantity)*Number(line.unitPriceOre));
  total+=net+Math.round(net*vat/100);
 }
 if(total<=0)return "Fakturaen må ha et beløp større enn 0 før den kan utstedes.";
 return null;
}
