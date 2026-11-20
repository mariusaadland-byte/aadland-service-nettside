// All amounts are integer øre. This computes a REVIEW SUGGESTION only.
// Selecting a VAT rate does not prove that rate applies to every invoice line.
export function splitExternalInvoiceGrossByRate(totalOre,rateInput){
 const rate=Number(rateInput);
 if(!Number.isSafeInteger(totalOre)||totalOre<=0||
  ![12,15,25].includes(rate))return null;
 const estimated=Math.round(totalOre*100/(100+rate));
 for(const net of [estimated,estimated-1,estimated+1]){
  const vat=Math.round(net*rate/100);
  if(net>0&&net+vat===totalOre)return {
   baseOre:net,vatOre:vat,grossOre:totalOre,vatRate:rate
  };
 }
 return null;
}
